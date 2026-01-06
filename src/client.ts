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
  PipelineError,
  PIPELINE_FLOW_REQUEST,
  PIPELINE_FLOW_RESPONSE,
  type PipelineFlow,
} from "./errors";
import {
  HealthStatusHelpers,
  McpdClientOptions,
  ServerHealth,
  Tool,
  ToolsResponse,
  HealthResponse,
  ErrorModel,
  AgentToolsOptions,
  ArrayAgentToolsOptions,
  ObjectAgentToolsOptions,
  MapAgentToolsOptions,
  Prompt,
  Prompts,
  GeneratePromptResponseBody,
  PromptGenerateArguments,
  Resource,
  Resources,
  ResourceTemplate,
  ResourceTemplates,
  ResourceContent,
} from "./types";
import { createCache } from "./utils/cache";
import { ServersNamespace } from "./dynamicCaller";
import { FunctionBuilder, type AgentFunction } from "./functionBuilder";
import { API_PATHS } from "./apiPaths";
import { createLogger, type Logger } from "./logger";

/**
 * Default timeout for API requests to mcpd, in seconds.
 */
const REQUEST_TIMEOUT_SECONDS = 30;

/**
 * Default TTL for server health cache entries, in seconds.
 *
 * @remarks
 * Used to avoid excessive health check requests while keeping data reasonably fresh.
 */
const SERVER_HEALTH_CACHE_TTL_SECONDS = 10;

/**
 * Maximum number of server health entries to cache.
 * Prevents unbounded memory growth while allowing legitimate large-scale monitoring.
 */
const SERVER_HEALTH_CACHE_MAXSIZE = 100;

/**
 * Separator used between server name and tool name in qualified tool names.
 * Format: `{serverName}{TOOL_SEPARATOR}{toolName}`
 * Example: "time__get_current_time" where "time" is server and "get_current_time" is tool.
 */
const TOOL_SEPARATOR = "__";

/**
 * Header name for mcpd pipeline error type.
 */
const MCPD_ERROR_TYPE_HEADER = "Mcpd-Error-Type";

/**
 * Maps mcpd error type header values to pipeline flows.
 */
const PIPELINE_ERROR_FLOWS: Record<string, PipelineFlow> = {
  "request-pipeline-failure": PIPELINE_FLOW_REQUEST,
  "response-pipeline-failure": PIPELINE_FLOW_RESPONSE,
};

/**
 * Type alias for agent functions in array format.
 * @internal
 */
type AgentFunctionsArray = AgentFunction[];

/**
 * Type alias for agent functions in object format (keyed by function name).
 * @internal
 */
type AgentFunctionsRecord = Record<string, AgentFunction>;

/**
 * Type alias for agent functions in Map format (keyed by function name).
 * @internal
 */
type AgentFunctionsMap = Map<string, AgentFunction>;

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
  readonly #logger: Logger;
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
    // Helper for time conversion.
    const toMs = (s: number) => s * 1000; // seconds to milliseconds

    // Remove trailing slash from endpoint.
    this.#endpoint = options.apiEndpoint.replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#timeout = options.timeout ?? toMs(REQUEST_TIMEOUT_SECONDS);

    // Setup health cache.
    const healthCacheTtlMs = toMs(
      options.healthCacheTtl ?? SERVER_HEALTH_CACHE_TTL_SECONDS,
    );
    this.#serverHealthCache = createCache({
      max: SERVER_HEALTH_CACHE_MAXSIZE,
      ttl: healthCacheTtlMs,
    });

    // Setup logger (the default logger uses MCPD_LOG_LEVEL).
    this.#logger = createLogger(options.logger);

    // Initialize servers namespace and function builder with injected functions.
    this.servers = new ServersNamespace({
      performCall: this.#performCall.bind(this),
      getTools: this.#getToolsByServer.bind(this),
      generatePrompt: this.#generatePromptInternal.bind(this),
      getPrompts: this.#getPromptsByServer.bind(this),
      getResources: this.#getResourcesByServer.bind(this),
      getResourceTemplates: this.#getResourceTemplatesByServer.bind(this),
      readResource: this.#readResourceByServer.bind(this),
    });
    this.#functionBuilder = new FunctionBuilder(this.#performCall.bind(this));
  }

  /**
   * Make an HTTP request to the mcpd daemon.
   *
   * @param path - The API path (e.g., '/servers', '/servers/{server_name}/tools')
   * @param options - Request options
   *
   * @returns The JSON response from the daemon
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
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
          // Response body is not valid JSON - fall through to fallback error handling below.
          errorModel = null;
        }

        // Check for pipeline failure (500 with Mcpd-Error-Type header).
        if (response.status === 500) {
          const errorType = response.headers
            .get(MCPD_ERROR_TYPE_HEADER)
            ?.toLowerCase();

          const flow = errorType ? PIPELINE_ERROR_FLOWS[errorType] : undefined;

          if (flow) {
            const message = errorModel?.detail || body || "Pipeline failure";

            throw new PipelineError(
              message,
              undefined, // serverName - enriched by caller if available.
              undefined, // operation - enriched by caller if available.
              flow,
            );
          }
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
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
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
   * Get tool schemas for a server.
   *
   * @privateRemarks
   * Used by dependency injection for ServersNamespace and internally for getAgentTools.
   *
   * @param serverName - Server name to get tools for
   *
   * @returns Tool schemas for the specified server
   *
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {ServerUnhealthyError} If the server is not healthy
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
   */
  async #getToolsByServer(serverName: string): Promise<Tool[]> {
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
   * Get prompt schemas for a server.
   *
   * @privateRemarks
   * Used internally for getPromptSchemas.
   *
   * @param serverName - Server name to get prompts for
   * @param cursor - Cursor for pagination
   *
   * @returns Prompt schemas for the specified server
   *
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {ServerUnhealthyError} If the server is not healthy
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
   */
  async #getPromptsByServer(
    serverName: string,
    cursor?: string,
  ): Promise<Prompt[]> {
    try {
      // Check server health first.
      await this.#ensureServerHealthy(serverName);

      const path = API_PATHS.SERVER_PROMPTS(serverName, cursor);
      const response = await this.#request<Prompts>(path);
      return response.prompts || [];
    } catch (error) {
      // Handle 501 Not Implemented - server doesn't support prompts.
      if (
        error instanceof McpdError &&
        error.message.includes("501") &&
        error.message.includes("Not Implemented")
      ) {
        return [];
      }

      throw error;
    }
  }

  /**
   * Generate a prompt on a server.
   *
   * @privateRemarks
   * Used internally by:
   * - PromptsNamespace (via dependency injection)
   * - Server.generatePrompt() (via dependency injection)
   *
   * @param serverName - The name of the server
   * @param promptName - The exact name of the prompt
   * @param args - The prompt arguments
   *
   * @returns The generated prompt response
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
   */
  async #generatePromptInternal(
    serverName: string,
    promptName: string,
    args?: Record<string, string>,
  ): Promise<GeneratePromptResponseBody> {
    // Check server health first.
    await this.#ensureServerHealthy(serverName);

    const path = API_PATHS.PROMPT_GET_GENERATED(serverName, promptName);
    const requestBody: PromptGenerateArguments = {
      arguments: args || {},
    };

    const response = await this.#request<GeneratePromptResponseBody>(path, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    return response;
  }

  /**
   * Get resource schemas for a server.
   *
   * @privateRemarks
   * Used internally for getResources and by dependency injection for ServersNamespace.
   *
   * @param serverName - Server name to get resources for
   * @param cursor - Cursor for pagination
   *
   * @returns Resource schemas for the specified server
   *
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {ServerUnhealthyError} If the server is not healthy
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
   */
  async #getResourcesByServer(
    serverName: string,
    cursor?: string,
  ): Promise<Resource[]> {
    try {
      // Check server health first.
      await this.#ensureServerHealthy(serverName);

      const path = API_PATHS.SERVER_RESOURCES(serverName, cursor);
      const response = await this.#request<Resources>(path);
      return response.resources || [];
    } catch (error) {
      // Handle 501 Not Implemented - server doesn't support resources.
      if (
        error instanceof McpdError &&
        error.message.includes("501") &&
        error.message.includes("Not Implemented")
      ) {
        return [];
      }

      throw error;
    }
  }

  /**
   * Get resource template schemas for a server.
   *
   * @privateRemarks
   * Used internally for getResourceTemplates and by dependency injection for ServersNamespace.
   *
   * @param serverName - Server name to get resource templates for
   * @param cursor - Cursor for pagination
   *
   * @returns Resource template schemas for the specified server
   *
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {ServerUnhealthyError} If the server is not healthy
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
   */
  async #getResourceTemplatesByServer(
    serverName: string,
    cursor?: string,
  ): Promise<ResourceTemplate[]> {
    try {
      // Check server health first.
      await this.#ensureServerHealthy(serverName);

      const path = API_PATHS.SERVER_RESOURCE_TEMPLATES(serverName, cursor);
      const response = await this.#request<ResourceTemplates>(path);
      return response.templates || [];
    } catch (error) {
      // Handle 501 Not Implemented - server doesn't support resource templates.
      if (
        error instanceof McpdError &&
        error.message.includes("501") &&
        error.message.includes("Not Implemented")
      ) {
        return [];
      }

      throw error;
    }
  }

  /**
   * Read resource content from a server.
   *
   * @privateRemarks
   * Used by dependency injection for ServersNamespace.
   *
   * @param serverName - Server name to read resource from
   * @param uri - The resource URI
   *
   * @returns Array of resource contents (text or blob)
   *
   * @throws {ServerNotFoundError} If the specified server doesn't exist
   * @throws {ServerUnhealthyError} If the server is not healthy
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
   */
  async #readResourceByServer(
    serverName: string,
    uri: string,
  ): Promise<ResourceContent[]> {
    // Check server health first.
    await this.#ensureServerHealthy(serverName);

    const path = API_PATHS.RESOURCE_CONTENT(serverName, uri);
    const response = await this.#request<ResourceContent[]>(path);
    return response || [];
  }

  /**
   * Get health information for one or all servers.
   *
   * @param serverName - Server name to get health for, or undefined for all servers
   *
   * @returns Health information for the specified server or all servers
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
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
        healthMap[server.name] = server;
        // Cache individual server health for subsequent calls
        const cacheKey = `health:${server.name}`;
        this.#serverHealthCache.set(cacheKey, server);
      }
      return healthMap;
    }
  }

  /**
   * Check if a specific server is healthy.
   *
   * @param serverName - The name of the server to check
   *
   * @returns True if the server is healthy, false otherwise
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
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
   *
   * @throws {ServerNotFoundError} If the server doesn't exist
   * @throws {ServerUnhealthyError} If the server is not healthy
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
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
   * Get list of healthy servers.
   *
   * @remarks
   * If logging is enabled, warnings are logged for servers that do not exist or are unhealthy.
   *
   * @param servers - List of server names to use for health checking.
   *                  If not provided, or empty, checks health for all servers.
   *
   * @returns List of server names with 'ok' health status.
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   */
  async #getHealthyServers(servers?: string[]): Promise<string[]> {
    const serverNames = servers?.length ? servers : await this.listServers();
    const healthMap = await this.getServerHealth();

    return serverNames.filter((name) => {
      const health = healthMap[name];

      if (!health) {
        this.#logger.warn(`Skipping non-existent server '${name}'`);
        return false;
      }

      if (!HealthStatusHelpers.isHealthy(health.status)) {
        this.#logger.warn(
          `Skipping unhealthy server '${name}' with status '${health.status}'`,
        );
        return false;
      }

      return true;
    });
  }

  /**
   * Perform a tool call on a server.
   *
   * @privateRemarks
   * Used internally by:
   * - ToolsNamespace (via dependency injection)
   * - FunctionBuilder (via dependency injection)
   *
   * @param serverName - The name of the server
   * @param toolName - The exact name of the tool
   * @param args - The tool arguments
   *
   * @returns The tool's response
   *
   * @throws {ToolExecutionError} If the tool execution fails
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
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
      // Enrich PipelineError with server/tool context.
      if (error instanceof PipelineError) {
        throw new PipelineError(
          error.message,
          serverName,
          `${serverName}.${toolName}`,
          error.pipelineFlow,
          error.cause as Error | undefined,
        );
      }

      if (error instanceof McpdError) {
        throw error;
      }

      throw new ToolExecutionError(
        `Failed to execute tool '${toolName}' on server '${serverName}': ${(error as Error).message}`,
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
   * Clear the server health cache.
   * This forces fresh health checks on the next getServerHealth() or isServerHealthy() call.
   */
  clearServerHealthCache(): void {
    this.#serverHealthCache.clear();
  }

  /**
   * Fetch and cache callable functions from all healthy servers.
   *
   * This method queries all healthy servers and creates self-contained, callable functions
   * that can be passed to AI agent frameworks. Each function includes its schema
   * as metadata and handles the MCP communication internally.
   *
   * Unhealthy servers are automatically filtered out and skipped (with optional warnings
   * when logging is enabled) to ensure the method returns quickly without waiting for timeouts.
   *
   * Tool fetches from multiple servers are executed concurrently for optimal performance.
   * Functions are cached indefinitely until explicitly cleared.
   *
   * @returns Array of callable functions with metadata from all healthy servers.
   *
   * @throws {AuthenticationError} If API key was present and authentication fails
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If the request times out
   * @throws {McpdError} If the request fails
   *
   * @internal
   */
  async #agentTools(): Promise<AgentFunction[]> {
    // Return cached functions if available.
    const cachedFunctions = this.#functionBuilder.getCachedFunctions();
    if (cachedFunctions.length > 0) {
      return cachedFunctions;
    }

    // Get all healthy servers.
    const healthyServers = await this.#getHealthyServers();

    // Fetch tools from all healthy servers in parallel.
    const results = await Promise.allSettled(
      healthyServers.map(async (serverName) => ({
        serverName,
        tools: await this.#getToolsByServer(serverName),
      })),
    );

    // Build functions from tool schemas.
    const agentTools: AgentFunction[] = results
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => {
        const { serverName, tools } = result.value;
        return tools.map((toolSchema) =>
          this.#functionBuilder.createFunctionFromSchema(
            toolSchema,
            serverName,
          ),
        );
      });

    return agentTools;
  }

  /**
   * Generate callable functions for use with AI agent frameworks.
   *
   * This method queries servers to create and cache self-contained, callable functions
   * that can be passed to AI agent frameworks. Each function includes its schema
   * as metadata and handles the MCP communication internally.
   *
   * @remarks
   * This method automatically filters out unhealthy servers by checking their health status before fetching tools.
   * Unhealthy servers are skipped (with optional warnings when logging is enabled) to ensure the
   * method returns quickly without waiting for timeouts on failed servers.
   *
   * Tool fetches from multiple servers are executed concurrently for optimal performance.
   *
   * Generated functions are cached for performance. Once cached, subsequent calls return
   * the cached functions immediately without refetching schemas, regardless of filter parameters.
   * Use {@link clearAgentToolsCache()} to clear the cache, or set refreshCache to true
   * to force regeneration when tool schemas have changed.
   *
   * @param options - Options for output format, server/tool filtering, and cache control
   *
   * @returns Functions in the requested format (array, object, or map).
   *          Only includes tools from healthy servers.
   *
   * @throws {ConnectionError} If unable to connect to the mcpd daemon
   * @throws {TimeoutError} If requests to the daemon time out
   * @throws {AuthenticationError} If API key authentication fails
   * @throws {McpdError} If unable to retrieve health status, server list, or generate functions
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
   * // Force refresh from cache
   * const freshTools = await client.getAgentTools({ refreshCache: true });
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
  async getAgentTools(
    options?: ArrayAgentToolsOptions,
  ): Promise<AgentFunction[]>;
  async getAgentTools(
    options: ObjectAgentToolsOptions,
  ): Promise<Record<string, AgentFunction>>;
  async getAgentTools(
    options: MapAgentToolsOptions,
  ): Promise<Map<string, AgentFunction>>;
  async getAgentTools(
    options: AgentToolsOptions = {},
  ): Promise<
    AgentFunction[] | Record<string, AgentFunction> | Map<string, AgentFunction>
  > {
    const { servers, tools, format = "array", refreshCache = false } = options;

    // Clear cache and fetch fresh if requested.
    if (refreshCache) this.#functionBuilder.clearCache();

    // Fetch or retrieve cached functions from all healthy servers.
    const allTools = await this.#agentTools();

    // Filter results based on servers and tools parameters.
    const filteredTools = allTools
      .filter((tool) => !servers || servers.includes(tool._serverName))
      .filter((tool) => !tools || this.#matchesToolFilter(tool, tools));

    // Format output as requested.
    const formatters: {
      array: (t: AgentFunctionsArray) => AgentFunctionsArray;
      object: (t: AgentFunctionsArray) => AgentFunctionsRecord;
      map: (t: AgentFunctionsArray) => AgentFunctionsMap;
    } = {
      array: (t) => t,
      object: (t) => Object.fromEntries(t.map((tool) => [tool.name, tool])),
      map: (t) => new Map(t.map((tool) => [tool.name, tool])),
    };

    return formatters[format](filteredTools);
  }

  /**
   * Check if a tool matches the tool filter.
   *
   * Supports two formats:
   * - Raw tool name: "get_current_time" (matches across all servers)
   * - Server-prefixed: "time__get_current_time" (matches specific server + tool)
   *
   * @remarks
   * When a filter contains "__", it's first checked as server-prefixed (exact match).
   * If that fails, it's checked as a raw tool name. This handles tools whose names
   * contain "__" (e.g., "my__special__tool").
   *
   * @param tool The tool to match.
   * @param tools List of tool names to match against.
   *
   * @returns True if a match is found in tools, based on the predicate.
   *
   * @internal
   */
  #matchesToolFilter(tool: AgentFunction, tools: string[]): boolean {
    return tools.some((filterItem) => {
      if (filterItem.indexOf(TOOL_SEPARATOR) === -1) {
        // Match against raw tool name
        return filterItem === tool._toolName;
      }

      // Try prefixed match first, then fall back to raw match
      return filterItem === tool.name || filterItem === tool._toolName;
    });
  }
}
