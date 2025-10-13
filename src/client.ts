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

import { LRUCache } from "lru-cache";
import {
  McpdError,
  ConnectionError,
  AuthenticationError,
  ServerNotFoundError,
  ServerUnhealthyError,
  ToolExecutionError,
  TimeoutError,
} from "./errors";
import {
  HealthStatusHelpers,
  McpdClientOptions,
  ServerHealth,
  ToolSchema,
  ToolsResponse,
  HealthResponse,
  ErrorModel,
  AgentToolsOptions,
} from "./types";
import { createCache } from "./utils/cache";
import { ServersNamespace } from "./dynamicCaller";
import { FunctionBuilder, type AgentFunction } from "./functionBuilder";
import { API_PATHS } from "./apiPaths";

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
 *   healthCacheTtl: 10,
 *   serverCacheTtl: 60
 * });
 *
 * // List available servers
 * const servers = await client.listServers();
 * console.log(servers); // ['time', 'fetch', 'git']
 *
 * // Invoke a tool dynamically
 * const result = await client.servers.time.get_current_time({ timezone: 'UTC' });
 * console.log(result); // { time: '2024-01-15T10:30:00Z' }
 * ```
 */
export class McpdClient {
  readonly #endpoint: string;
  readonly #apiKey: string | undefined;
  readonly #timeout: number;
  readonly #serverHealthCache: LRUCache<string, ServerHealth | Error>;
  readonly #functionBuilder: FunctionBuilder;
  readonly #cacheableExceptions = new Set([
    ServerNotFoundError,
    ServerUnhealthyError,
    AuthenticationError,
  ]);

  /**
   * Namespace for accessing MCP servers and their tools.
   */
  public readonly servers: ServersNamespace;

  /**
   * Initialize a new McpdClient instance.
   *
   * @param options - Configuration options for the client
   */
  constructor(options: McpdClientOptions) {
    // Remove trailing slash from endpoint
    this.#endpoint = options.apiEndpoint.replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#timeout = options.timeout ?? 30000;

    // Setup health cache
    const healthCacheTtlMs = (options.healthCacheTtl ?? 10) * 1000; // Convert to milliseconds
    this.#serverHealthCache = createCache({
      max: 100, // TODO: Extract to const like Python SDK see:
      //  _SERVER_HEALTH_CACHE_MAXSIZE: int = 100
      // """Maximum number of server health entries to cache.
      // Prevents unbounded memory growth while allowing legitimate large-scale monitoring."""
      ttl: healthCacheTtlMs,
    });

    // Initialize servers namespace and function builder with injected functions
    this.servers = new ServersNamespace(
      this.#performCall.bind(this),
      this.#getToolsByServer.bind(this),
    );
    this.#functionBuilder = new FunctionBuilder(this.#performCall.bind(this));
  }

  /**
   * Make an HTTP request to the mcpd daemon.
   *
   * @param path - The API path (e.g., '/servers', '/servers/{server_name}/tools')
   * @param options - Request options
   * @returns The JSON response from the daemon
   * @throws {McpdError} If the request fails
   */
  async #request<T = unknown>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.#endpoint}${path}`;

    // Setup request headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authentication if configured
    if (this.#apiKey) {
      headers["Authorization"] = `Bearer ${this.#apiKey}`;
    }

    // Setup timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-2xx responses with ErrorModel parsing
      if (!response.ok) {
        const body = await response.text();
        let errorModel: ErrorModel | null = null;

        try {
          errorModel = JSON.parse(body) as ErrorModel;
        } catch {
          // Not JSON, use text as detail
          // TODO: This stinks do something in here.
        }

        if (errorModel && errorModel.detail) {
          const errorDetails = errorModel.errors
            ?.map((e) => `${e.location}: ${e.message}`)
            .join("; ");
          const fullMessage = errorDetails
            ? `${errorModel.detail} - ${errorDetails}`
            : errorModel.detail;

          // Handle authentication errors
          if (response.status === 401 || response.status === 403) {
            throw new AuthenticationError(fullMessage);
          }

          // Handle other errors with proper message
          throw new McpdError(
            `${errorModel.title || "Request failed"}: ${fullMessage}`,
          );
        }

        // Fallback if ErrorModel parsing failed
        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(
            `Authentication failed: ${response.status} ${response.statusText}`,
          );
        }

        throw new McpdError(
          `Request failed: ${response.status} ${response.statusText} - ${body}`,
        );
      }

      // Parse JSON response
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new McpdError("Failed to parse JSON response", error as Error);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout
      if ((error as Error).name === "AbortError") {
        throw new TimeoutError(
          `Request timed out after ${this.#timeout}ms`,
          path,
          this.#timeout,
        );
      }

      // Handle connection errors
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new ConnectionError(
          `Cannot connect to mcpd daemon at ${this.#endpoint}. Is it running?`,
          error,
        );
      }

      // Re-throw our errors as-is
      if (error instanceof McpdError) {
        throw error;
      }

      // Wrap unknown errors
      throw new McpdError(
        `Request failed: ${(error as Error).message}`,
        error as Error,
      );
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
   * const servers = await client.listServers();
   * console.log(servers); // ['time', 'fetch', 'git']
   * ```
   */
  async listServers(): Promise<string[]> {
    return await this.#request<string[]>(API_PATHS.SERVERS);
  }

  /**
   * Internal method to get tool schemas for a server.
   * Used by dependency injection for ServersNamespace and internally for getAgentTools.
   *
   * @param serverName - Server name to get tools for
   * @returns Tool schemas for the specified server
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {McpdError} If the request fails
   * @internal
   */
  async #getToolsByServer(serverName: string): Promise<ToolSchema[]> {
    // Check server health first
    await this.#ensureServerHealthy(serverName);

    const path = API_PATHS.SERVER_TOOLS(serverName);
    const response = await this.#request<ToolsResponse>(path);

    if (!response.tools) {
      throw new ServerNotFoundError(
        `Server '${serverName}' not found`,
        serverName,
      );
    }

    return response.tools;
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
  async getServerHealth(
    serverName?: string,
  ): Promise<ServerHealth | Record<string, ServerHealth>> {
    if (serverName) {
      // Check cache first
      const cacheKey = `health:${serverName}`;
      const cached = this.#serverHealthCache.get(cacheKey);

      if (cached !== undefined) {
        if (cached instanceof Error) {
          throw cached;
        }
        return cached;
      }

      try {
        const path = API_PATHS.HEALTH_SERVER(serverName);
        const health = await this.#request<ServerHealth>(path);

        // Cache successful result
        this.#serverHealthCache.set(cacheKey, health);

        return health;
      } catch (error) {
        // Cache certain error types
        if (error instanceof Error) {
          for (const errorType of this.#cacheableExceptions) {
            if (error instanceof errorType) {
              this.#serverHealthCache.set(cacheKey, error);
              break;
            }
          }
        }
        throw error;
      }
    } else {
      const response = await this.#request<HealthResponse>(
        API_PATHS.HEALTH_ALL,
      );
      // Transform array response into Record<string, ServerHealth>
      const healthMap: Record<string, ServerHealth> = {};
      for (const server of response.servers) {
        const { name, ...health } = server;
        healthMap[name] = health;
      }
      return healthMap;
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
   *   const time = await client.servers.time.get_current_time();
   * }
   * ```
   */
  async isServerHealthy(serverName: string): Promise<boolean> {
    try {
      const health = await this.getServerHealth(serverName);
      return HealthStatusHelpers.isHealthy(health.status);
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
  async #ensureServerHealthy(serverName: string): Promise<void> {
    const health = await this.getServerHealth(serverName);

    if (!health) {
      throw new ServerNotFoundError(
        `Server '${serverName}' not found`,
        serverName,
      );
    }

    if (!HealthStatusHelpers.isHealthy(health.status)) {
      throw new ServerUnhealthyError(
        `Server '${serverName}' is not healthy: ${health.status}`,
        serverName,
        health.status,
      );
    }
  }

  /**
   * Internal method to perform a tool call on a server.
   *
   * ⚠️ This method is truly private and cannot be accessed by SDK consumers.
   * Use the fluent API instead: `client.servers.foo.tools.bar(args)`
   *
   * This method is used internally by:
   * - ToolsProxy (via dependency injection)
   * - FunctionBuilder (via dependency injection)
   *
   * @param serverName - The name of the server
   * @param toolName - The exact name of the tool
   * @param args - The tool arguments
   * @returns The tool's response
   * @throws {ToolExecutionError} If the tool execution fails
   * @internal
   */
  async #performCall(
    serverName: string,
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    const path = API_PATHS.TOOL_CALL(serverName, toolName);

    try {
      const response = await this.#request<unknown>(path, {
        method: "POST",
        body: JSON.stringify(args || {}),
      });

      // The mcpd API returns tool results as JSON strings that need parsing
      if (typeof response === "string") {
        try {
          return JSON.parse(response);
        } catch {
          // If not valid JSON, return string as-is
          return response;
        }
      }

      // Return the response as-is (already parsed or not a string)
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
        error as Error,
      );
    }
  }

  /**
   * Clear the cached agent tools functions.
   * This should be called when the tool schemas might have changed.
   */
  clearAgentToolsCache(): void {
    this.#functionBuilder.clearCache();
  }

  /**
   * Generate callable functions for use with AI agent frameworks (internal).
   *
   * This method queries servers via `getTools()` and creates self-contained,
   * callable functions that can be passed to AI agent frameworks. Each function
   * includes its schema as metadata and handles the MCP communication internally.
   *
   * @param servers - Optional list of server names to include. If not specified, includes all servers.
   * @returns Array of callable functions with metadata
   *
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If requests to the daemon time out
   * @throws {AuthenticationError} If API key authentication fails
   * @throws {ServerNotFoundError} If a server becomes unavailable during tool retrieval
   * @throws {McpdError} If unable to retrieve tool definitions or generate functions
   * @internal
   */
  async agentTools(servers?: string[]): Promise<AgentFunction[]> {
    const agentTools: AgentFunction[] = [];

    // Get tools from all servers or filtered servers
    let toolsByServer: Record<string, ToolSchema[]>;

    if (servers && servers.length > 0) {
      // Fetch tools only from specified servers
      toolsByServer = {};
      for (const serverName of servers) {
        toolsByServer[serverName] = await this.#getToolsByServer(serverName);
      }
    } else {
      // Fetch tools from all servers
      const allServers = await this.listServers();
      toolsByServer = {};
      for (const serverName of allServers) {
        try {
          toolsByServer[serverName] = await this.#getToolsByServer(serverName);
        } catch (error) {
          // If we can't get tools for a server, skip it
          console.warn(
            `Failed to get tools for server '${serverName}':`,
            error,
          );
        }
      }
    }

    // Build functions from tool schemas
    for (const [serverName, toolSchemas] of Object.entries(toolsByServer)) {
      for (const toolSchema of toolSchemas) {
        const func = this.#functionBuilder.createFunctionFromSchema(
          toolSchema,
          serverName,
        );
        agentTools.push(func);
      }
    }

    return agentTools;
  }

  /**
   * Generate callable functions for use with AI agent frameworks.
   *
   * This method queries servers via `getTools()` and creates self-contained,
   * callable functions that can be passed to AI agent frameworks. Each function
   * includes its schema as metadata and handles the MCP communication internally.
   *
   * The generated functions are cached for performance. Use clearAgentToolsCache()
   * to force regeneration if servers or tools have changed.
   *
   * @param options - Options for generating agent tools (format and server filtering)
   * @returns Functions in the requested format (array, object, or map)
   *
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If requests to the daemon time out
   * @throws {AuthenticationError} If API key authentication fails
   * @throws {ServerNotFoundError} If a server becomes unavailable during tool retrieval
   * @throws {McpdError} If unable to retrieve tool definitions or generate functions
   *
   * @example
   * ```typescript
   * // Get all tools from all servers (default array format)
   * const tools = await client.getAgentTools();
   * console.log(`Generated ${tools.length} callable tools`);
   *
   * // Get tools from specific servers
   * const tools = await client.getAgentTools({ servers: ['time', 'fetch'] });
   *
   * // Use with LangChain JS (array format)
   * const langchainTools = await client.getAgentTools({ format: 'array' });
   * const agent = await createOpenAIToolsAgent({ llm, tools: langchainTools, prompt });
   *
   * // Use with Vercel AI SDK (object format) from specific servers
   * const vercelTools = await client.getAgentTools({
   *   servers: ['time'],
   *   format: 'object'
   * });
   * const result = await generateText({ model, tools: vercelTools, prompt });
   * ```
   */
  async getAgentTools(options?: {
    format?: "array";
    servers?: string[];
  }): Promise<AgentFunction[]>;
  async getAgentTools(options: {
    format: "object";
    servers?: string[];
  }): Promise<Record<string, AgentFunction>>;
  async getAgentTools(options: {
    format: "map";
    servers?: string[];
  }): Promise<Map<string, AgentFunction>>;
  async getAgentTools(
    options: AgentToolsOptions = {},
  ): Promise<
    AgentFunction[] | Record<string, AgentFunction> | Map<string, AgentFunction>
  > {
    const { servers, format = "array" } = options;

    // Get tools in array format (default internal representation)
    const tools = await this.agentTools(servers);

    // Return in requested format
    switch (format) {
      case "object":
        return Object.fromEntries(tools.map((tool) => [tool.name, tool]));

      case "map":
        return new Map(tools.map((tool) => [tool.name, tool]));

      case "array":
      default:
        return tools;
    }
  }
}
