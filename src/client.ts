/**
 * mcpd client for MCP server management and tool execution.
 *
 * This module provides the main McpdClient class that interfaces with the mcpd
 * daemon to manage interactions with MCP servers and execute tools. It offers
 * multiple interaction patterns including direct API calls, dynamic calling
 * syntax, and agent-ready function generation.
 *
 * The client handles authentication, error management, and provides a unified
 * interface for working with multiple MCP servers through the mcpd daemon.
 */

import { LRUCache } from 'lru-cache';
import {
  McpdError,
  ConnectionError,
  AuthenticationError,
  ServerNotFoundError,
  ServerUnhealthyError,
  ToolExecutionError,
  TimeoutError,
} from './errors';
import {
  HealthStatusHelpers,
  McpdClientOptions,
  ServerHealth,
  ToolSchema,
  ToolsResponse,
  HealthResponse,
} from './types';
import { createCache } from './utils/cache';
import { DynamicCaller } from './dynamicCaller';
import { FunctionBuilder, type AgentFunction } from './functionBuilder';
import { API_PATHS } from './apiPaths';

/**
 * Tool format types for cross-framework compatibility.
 */
export type ToolFormat = 'array' | 'object' | 'map';

/**
 * Client for interacting with MCP (Model Context Protocol) servers through an mcpd daemon.
 *
 * The McpdClient provides a high-level interface to discover, inspect, and invoke tools
 * exposed by MCP servers running behind an mcpd daemon proxy/gateway.
 *
 * Thread Safety:
 *     This client is safe to use from multiple async contexts. The internal health
 *     check cache is protected by the LRUCache implementation.
 *
 * @example
 * ```typescript
 * import { McpdClient } from '@mozilla-ai/mcpd';
 *
 * // Initialize client
 * const client = new McpdClient({
 *   apiEndpoint: 'http://localhost:8090',
 *   apiKey: 'optional-key',
 *   serverHealthCacheTtl: 10
 * });
 *
 * // List available servers
 * const servers = await client.getServers();
 * console.log(servers); // ['time', 'fetch', 'git']
 *
 * // Invoke a tool dynamically
 * const result = await client.call.time.get_current_time({ timezone: 'UTC' });
 * console.log(result); // { time: '2024-01-15T10:30:00Z' }
 * ```
 */
export class McpdClient {
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;
  private readonly serverHealthCache: LRUCache<string, ServerHealth | Error>;
  private readonly functionBuilder: FunctionBuilder;
  private readonly cacheableExceptions = new Set([
    ServerNotFoundError,
    ServerUnhealthyError,
    AuthenticationError,
  ]);

  /**
   * Dynamic interface for invoking tools using dot notation.
   */
  public readonly call: DynamicCaller;

  /**
   * Initialize a new McpdClient instance.
   *
   * @param options - Configuration options for the client
   */
  constructor(options: McpdClientOptions) {
    // Remove trailing slash from endpoint
    this.endpoint = options.apiEndpoint.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30000;

    // Setup health check cache
    const cacheTtl = (options.serverHealthCacheTtl ?? 10) * 1000; // Convert to milliseconds
    this.serverHealthCache = createCache({
      max: 100,
      ttl: cacheTtl,
    });

    // Initialize dynamic caller and function builder
    this.call = new DynamicCaller(this);
    this.functionBuilder = new FunctionBuilder(this);
  }

  /**
   * Make an HTTP request to the mcpd daemon.
   *
   * @param path - The API path (e.g., '/servers', '/tools')
   * @param options - Request options
   * @returns The JSON response from the daemon
   * @throws {McpdError} If the request fails
   */
  private async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.endpoint}${path}`;

    // Setup request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authentication if configured
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Setup timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        const message = `Authentication failed: ${response.status} ${response.statusText}`;
        throw new AuthenticationError(message);
      }

      // Handle not found errors
      if (response.status === 404) {
        const body = await response.text();
        throw new McpdError(`Resource not found: ${body}`);
      }

      // Handle other non-2xx responses
      if (!response.ok) {
        const body = await response.text();
        throw new McpdError(
          `Request failed: ${response.status} ${response.statusText} - ${body}`
        );
      }

      // Parse JSON response
      try {
        return await response.json() as T;
      } catch (error) {
        throw new McpdError('Failed to parse JSON response', error as Error);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout
      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`, path, this.timeout);
      }

      // Handle connection errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ConnectionError(
          `Cannot connect to mcpd daemon at ${this.endpoint}. Is it running?`,
          error
        );
      }

      // Re-throw our errors as-is
      if (error instanceof McpdError) {
        throw error;
      }

      // Wrap unknown errors
      throw new McpdError(`Request failed: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Get a list of all configured MCP servers.
   *
   * @returns Array of server names
   * @throws {McpdError} If the request fails
   *
   * @example
   * ```typescript
   * const servers = await client.servers();
   * console.log(servers); // ['time', 'fetch', 'git']
   * ```
   */
  async servers(): Promise<string[]> {
    const response = await this.request<string[]>(API_PATHS.SERVERS);
    return response;
  }

  /**
   * Get a list of all configured MCP servers (JavaScript naming convention).
   *
   * @returns Array of server names
   * @throws {McpdError} If the request fails
   *
   * @example
   * ```typescript
   * const servers = await client.getServers();
   * console.log(servers); // ['time', 'fetch', 'git']
   * ```
   */
  async getServers(): Promise<string[]> {
    return this.servers();
  }

  /**
   * Get tool schemas for one or all servers.
   *
   * @param serverName - Optional server name to get tools for
   * @returns Tool schemas, either as an array (single server) or object (all servers)
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {McpdError} If the request fails
   *
   * @example
   * ```typescript
   * // Get tools for all servers
   * const allTools = await client.tools();
   * console.log(allTools); // { time: [...], fetch: [...] }
   *
   * // Get tools for a specific server
   * const timeTools = await client.tools('time');
   * console.log(timeTools); // [{ name: 'get_current_time', ... }]
   * ```
   */
  async tools(): Promise<Record<string, ToolSchema[]>>;
  async tools(serverName: string): Promise<ToolSchema[]>;
  async tools(serverName?: string): Promise<ToolSchema[] | Record<string, ToolSchema[]>> {
    if (serverName) {
      // Check server health first
      await this.ensureServerHealthy(serverName);

      const path = API_PATHS.SERVER_TOOLS(serverName);
      const response = await this.request<ToolsResponse>(path);

      if (!response.tools) {
        throw new ServerNotFoundError(`Server '${serverName}' not found`, serverName);
      }

      return response.tools;
    } else {
      // No global tools endpoint - get tools from each server individually (matching Python SDK)
      const servers = await this.servers();

      const toolsPromises = servers.map(async (server) => {
        try {
          const path = API_PATHS.SERVER_TOOLS(server);
          const response = await this.request<ToolsResponse>(path);
          return { server, tools: response.tools || [] };
        } catch (error) {
          // If we can't get tools for a server, return empty array
          console.warn(`Failed to get tools for server '${server}':`, error);
          return { server, tools: [] };
        }
      });

      const results = await Promise.all(toolsPromises);

      return results.reduce((acc, { server, tools }) => {
        acc[server] = tools;
        return acc;
      }, {} as Record<string, ToolSchema[]>);
    }
  }

  /**
   * Get tool schemas for one or all servers (JavaScript naming convention).
   *
   * @param serverName - Optional server name to get tools for
   * @returns Tool schemas, either as an array (single server) or object (all servers)
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {McpdError} If the request fails
   *
   * @example
   * ```typescript
   * // Get tools for all servers
   * const allTools = await client.getTools();
   * console.log(allTools); // { time: [...], fetch: [...] }
   *
   * // Get tools for a specific server
   * const timeTools = await client.getTools('time');
   * console.log(timeTools); // [{ name: 'get_current_time', ... }]
   * ```
   */
  async getTools(): Promise<Record<string, ToolSchema[]>>;
  async getTools(serverName: string): Promise<ToolSchema[]>;
  async getTools(serverName?: string): Promise<ToolSchema[] | Record<string, ToolSchema[]>> {
    if (serverName !== undefined) {
      return this.tools(serverName);
    } else {
      return this.tools();
    }
  }

  /**
   * Get health information for one or all servers.
   *
   * @param serverName - Optional server name to get health for
   * @returns Health information for the specified server or all servers
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {McpdError} If the request fails
   *
   * @example
   * ```typescript
   * // Get health for all servers
   * const allHealth = await client.serverHealth();
   * console.log(allHealth); // { time: { status: 'ok' }, fetch: { status: 'ok' } }
   *
   * // Get health for a specific server
   * const timeHealth = await client.serverHealth('time');
   * console.log(timeHealth); // { status: 'ok' }
   * ```
   */
  async serverHealth(): Promise<Record<string, ServerHealth>>;
  async serverHealth(serverName: string): Promise<ServerHealth>;
  async serverHealth(serverName?: string): Promise<ServerHealth | Record<string, ServerHealth>> {
    if (serverName) {
      // Check cache first
      const cacheKey = `health:${serverName}`;
      const cached = this.serverHealthCache.get(cacheKey);

      if (cached !== undefined) {
        if (cached instanceof Error) {
          throw cached;
        }
        return cached;
      }

      try {
        const path = API_PATHS.HEALTH_SERVER(serverName);
        const health = await this.request<ServerHealth>(path);

        // Cache successful result
        this.serverHealthCache.set(cacheKey, health);

        return health;
      } catch (error) {
        // Cache certain error types
        if (error instanceof Error) {
          for (const errorType of this.cacheableExceptions) {
            if (error instanceof errorType) {
              this.serverHealthCache.set(cacheKey, error);
              break;
            }
          }
        }
        throw error;
      }
    } else {
      return await this.request<HealthResponse>(API_PATHS.HEALTH_ALL);
    }
  }

  /**
   * Get health information for one or all servers (JavaScript naming convention).
   *
   * @param serverName - Optional server name to get health for
   * @returns Health information for the specified server or all servers
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {McpdError} If the request fails
   *
   * @example
   * ```typescript
   * // Get health for all servers
   * const allHealth = await client.getServerHealth();
   * console.log(allHealth); // { time: { status: 'ok' }, fetch: { status: 'ok' } }
   *
   * // Get health for a specific server
   * const timeHealth = await client.getServerHealth('time');
   * console.log(timeHealth); // { status: 'ok' }
   * ```
   */
  async getServerHealth(): Promise<Record<string, ServerHealth>>;
  async getServerHealth(serverName: string): Promise<ServerHealth>;
  async getServerHealth(serverName?: string): Promise<ServerHealth | Record<string, ServerHealth>> {
    if (serverName !== undefined) {
      return this.serverHealth(serverName);
    } else {
      return this.serverHealth();
    }
  }

  /**
   * Check if a specific server is healthy.
   *
   * @param serverName - The name of the server to check
   * @returns True if the server is healthy, false otherwise
   *
   * @example
   * ```typescript
   * if (await client.isServerHealthy('time')) {
   *   const time = await client.call.time.get_current_time();
   * }
   * ```
   */
  async isServerHealthy(serverName: string): Promise<boolean> {
    try {
      const health = await this.serverHealth(serverName);
      return HealthStatusHelpers.isHealthy(health.status);
    } catch (error) {
      if (error instanceof ServerNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a specific tool exists on a server.
   *
   * @param serverName - The name of the server
   * @param toolName - The name of the tool
   * @returns True if the tool exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await client.hasTool('time', 'get_current_time')) {
   *   const time = await client.call.time.get_current_time();
   * }
   * ```
   */
  async hasTool(serverName: string, toolName: string): Promise<boolean> {
    try {
      const tools = await this.tools(serverName);
      return tools.some((tool) => tool.name === toolName);
    } catch (error) {
      if (error instanceof ServerNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Ensure a server is healthy before performing an operation.
   *
   * @param serverName - The name of the server to check
   * @throws {ServerNotFoundError} If the server doesn't exist
   * @throws {ServerUnhealthyError} If the server is not healthy
   */
  private async ensureServerHealthy(serverName: string): Promise<void> {
    const health = await this.serverHealth(serverName);

    if (!health) {
      throw new ServerNotFoundError(`Server '${serverName}' not found`, serverName);
    }

    if (!HealthStatusHelpers.isHealthy(health.status)) {
      throw new ServerUnhealthyError(
        `Server '${serverName}' is not healthy: ${health.status}`,
        serverName,
        health.status
      );
    }
  }

  /**
   * Perform a tool call on a server.
   *
   * This method is used internally by the dynamic caller and agent tools.
   * Users should typically use the dynamic caller syntax instead.
   *
   * @param serverName - The name of the server
   * @param toolName - The name of the tool
   * @param args - The tool arguments
   * @returns The tool's response
   * @throws {ToolExecutionError} If the tool execution fails
   * @internal
   */
  async _performCall(
    serverName: string,
    toolName: string,
    args?: Record<string, any>
  ): Promise<any> {
    const path = API_PATHS.TOOL_CALL(serverName, toolName);

    try {
      const response = await this.request<any>(path, {
        method: 'POST',
        body: JSON.stringify(args || {}),
      });

      // The mcpd API returns a JSON string that needs to be parsed
      // Check if response is a string (the actual tool result as JSON string)
      if (typeof response === 'string') {
        try {
          return JSON.parse(response);
        } catch {
          // If it's not valid JSON, return as-is
          return response;
        }
      }

      // Check for error response format
      if (response && typeof response === 'object' && response.error) {
        throw new ToolExecutionError(
          response.error.message || 'Tool execution failed',
          serverName,
          toolName,
          response.error.details
        );
      }

      // Return the response (already parsed object)
      return response;
    } catch (error) {
      if (error instanceof McpdError) {
        throw error;
      }

      throw new ToolExecutionError(
        `Failed to execute tool '${toolName}' on server '${serverName}': ${
          (error as Error).message
        }`,
        serverName,
        toolName,
        undefined,
        error as Error
      );
    }
  }

  /**
   * Clear the cached agent tools functions.
   * This should be called when the tool schemas might have changed.
   */
  clearAgentToolsCache(): void {
    this.functionBuilder.clearCache();
  }

  /**
   * Generate callable functions for use with AI agent frameworks.
   *
   * This method queries all servers via `tools()` and creates self-contained,
   * callable functions that can be passed to AI agent frameworks. Each function
   * includes its schema as metadata and handles the MCP communication internally.
   *
   * The generated functions are cached for performance. Use clearAgentToolsCache()
   * to force regeneration if servers or tools have changed.
   *
   * @returns Array of callable functions with metadata
   *
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If requests to the daemon time out
   * @throws {AuthenticationError} If API key authentication fails
   * @throws {ServerNotFoundError} If a server becomes unavailable during tool retrieval
   * @throws {McpdError} If unable to retrieve tool definitions or generate functions
   *
   * @example
   * ```typescript
   * const tools = await client.agentTools();
   * console.log(`Generated ${tools.length} callable tools`);
   *
   * // Each function has metadata
   * for (const tool of tools) {
   *   console.log(`${tool.__name__}: ${tool.__doc__}`);
   * }
   *
   * // Use with an AI agent framework
   * const agent = new Agent({
   *   tools: tools,
   *   model: 'gpt-4',
   *   instructions: 'Help the user with their tasks.'
   * });
   * ```
   */
  async agentTools(): Promise<AgentFunction[]> {
    const agentTools: AgentFunction[] = [];
    const allTools = await this.tools();

    for (const [serverName, toolSchemas] of Object.entries(allTools)) {
      for (const toolSchema of toolSchemas) {
        const func = this.functionBuilder.createFunctionFromSchema(toolSchema, serverName);
        agentTools.push(func);
      }
    }

    return agentTools;
  }

  /**
   * Generate callable functions for use with AI agent frameworks (JavaScript naming convention).
   *
   * This method queries all servers via `getTools()` and creates self-contained,
   * callable functions that can be passed to AI agent frameworks. Each function
   * includes its schema as metadata and handles the MCP communication internally.
   *
   * The generated functions are cached for performance. Use clearAgentToolsCache()
   * to force regeneration if servers or tools have changed.
   *
   * @returns Array of callable functions with metadata
   *
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If requests to the daemon time out
   * @throws {AuthenticationError} If API key authentication fails
   * @throws {ServerNotFoundError} If a server becomes unavailable during tool retrieval
   * @throws {McpdError} If unable to retrieve tool definitions or generate functions
   *
   * @example
   * ```typescript
   * const tools = await client.getAgentTools();
   * console.log(`Generated ${tools.length} callable tools`);
   *
   * // Each function has metadata
   * for (const tool of tools) {
   *   console.log(`${tool.name}: ${tool.description}`);
   * }
   *
   * // Use with LangChain JS (expects array format)
   * const langchainTools = await client.getAgentTools('array');
   * const agent = await createOpenAIToolsAgent({ llm, tools: langchainTools, prompt });
   *
   * // Use with Vercel AI SDK (expects object format)
   * const vercelTools = await client.getAgentTools('object');
   * const result = await generateText({ model, tools: vercelTools, prompt });
   * ```
   */
  // TypeScript overloads for different return types based on format parameter
  async getAgentTools(): Promise<AgentFunction[]>;
  async getAgentTools(format: 'array'): Promise<AgentFunction[]>;
  async getAgentTools(format: 'object'): Promise<Record<string, AgentFunction>>;
  async getAgentTools(format: 'map'): Promise<Map<string, AgentFunction>>;
  async getAgentTools(format: ToolFormat = 'array'): Promise<AgentFunction[] | Record<string, AgentFunction> | Map<string, AgentFunction>> {
    // Get tools in array format (default internal representation)
    const tools = await this.agentTools();

    // Return in requested format
    switch (format) {
      case 'object':
        return Object.fromEntries(tools.map(tool => [tool.name, tool]));

      case 'map':
        return new Map(tools.map(tool => [tool.name, tool]));

      case 'array':
      default:
        return tools;
    }
  }
}