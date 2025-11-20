/**
 * Type definitions for the mcpd SDK.
 */

import type { Logger } from "./logger";

/**
 * Enumeration of possible MCP server health statuses.
 */
export enum HealthStatus {
  OK = "ok",
  TIMEOUT = "timeout",
  UNREACHABLE = "unreachable",
  UNKNOWN = "unknown",
}

/**
 * Helper functions for HealthStatus.
 */
export const HealthStatusHelpers = {
  /**
   * Check if the given health status is a transient error state.
   */
  isTransient(status: string): boolean {
    return status === HealthStatus.TIMEOUT || status === HealthStatus.UNKNOWN;
  },

  /**
   * Check if the given status string represents a healthy state.
   */
  isHealthy(status: string): boolean {
    return status === HealthStatus.OK;
  },
};

/**
 * Error detail from Huma API error responses.
 * Location and value are optional as the API doesn't always include them.
 */
export interface ErrorDetail {
  location?: string;
  message: string;
  value?: unknown;
}

/**
 * Huma API error model (RFC 7807 Problem Details).
 * Used for all API errors including HTTP errors and tool execution failures.
 */
export interface ErrorModel {
  $schema?: string;
  detail: string;
  errors?: ErrorDetail[];
  instance?: string;
  status: number;
  title: string;
  type: string;
}

/**
 * JSON Schema definition for tool parameters.
 */
export interface JsonSchema {
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Tool annotations for hints about tool behavior.
 */
export interface ToolAnnotations {
  title?: string;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  readOnlyHint?: boolean;
}

/**
 * MCP tool definition following the Model Context Protocol specification (2025-06-18).
 *
 * @see https://spec.modelcontextprotocol.io/specification/2025-06-18/server/tools/
 */
export interface Tool {
  /**
   * Unique identifier for the tool (required).
   */
  name: string;

  /**
   * Optional human-readable title for display.
   */
  title?: string;

  /**
   * Human-readable description of what the tool does (optional in MCP spec).
   *
   * Note: mcpd API currently requires this field, but MCP spec makes it optional.
   * This SDK follows the MCP spec to remain protocol-compliant.
   */
  description?: string;

  /**
   * JSON Schema defining the tool's input parameters (required in MCP spec).
   *
   * Note: mcpd API currently makes this optional, but MCP spec requires it.
   * This SDK follows the MCP spec to remain protocol-compliant.
   */
  inputSchema: JsonSchema;

  /**
   * Optional JSON Schema defining the tool's output structure.
   */
  outputSchema?: JsonSchema;

  /**
   * Optional hints about tool behavior (readonly, destructive, idempotent, etc.).
   */
  annotations?: ToolAnnotations;

  /**
   * Optional metadata for extensibility.
   */
  _meta?: Record<string, unknown>;
}

/**
 * Tools list response from the mcpd API.
 */
export interface Tools {
  $schema?: string;
  tools: Tool[];
}

/**
 * Server health information from the mcpd API.
 * Represents the health status of an MCP server.
 */
export interface ServerHealth {
  /**
   * Name of the server (required).
   */
  name: string;

  /**
   * Health status of the server (required).
   * Common values: 'ok', 'timeout', 'unreachable', 'unknown'
   */
  status: string;

  /**
   * Optional JSON Schema reference.
   */
  $schema?: string;

  /**
   * Timestamp of the last health check (ISO 8601 date-time).
   */
  lastChecked?: string;

  /**
   * Timestamp of the last successful health check (ISO 8601 date-time).
   */
  lastSuccessful?: string;

  /**
   * Latency of the health check (e.g., '2ms', '1.5s').
   */
  latency?: string;
}

/**
 * Tools response from the mcpd daemon.
 */
export interface ToolsResponse {
  tools?: Tool[];
  [serverName: string]: Tool[] | undefined;
}

/**
 * Health response from the mcpd API.
 * Contains health information for all tracked servers.
 */
export interface HealthResponse {
  $schema?: string;
  servers: ServerHealth[];
}

/**
 * Configuration options for the McpdClient.
 */
export interface McpdClientOptions {
  /**
   * The mcpd daemon API endpoint URL.
   */
  apiEndpoint: string;

  /**
   * Optional API key for authentication.
   */
  apiKey?: string;

  /**
   * TTL in seconds for caching server health checks.
   */
  healthCacheTtl?: number;

  /**
   * Request timeout in milliseconds.
   */
  timeout?: number;

  /**
   * Optional custom logger for SDK warnings and errors.
   *
   * If not provided, uses default logger (disabled by default).
   * Logging can be enabled by setting the MCPD_LOG_LEVEL environment variable.
   *
   * Supports partial implementations - any omitted methods fall back to the
   * default logger, which respects MCPD_LOG_LEVEL.
   *
   * NOTE: It is recommended that you only enable logging in non-MCP-server contexts.
   * MCP servers using stdio transport for JSON-RPC communication should avoid enabling logging
   * to avoid contaminating stdout/stderr.
   *
   * @example
   * ```typescript
   * // Use default logger (controlled by MCPD_LOG_LEVEL env var).
   * const client = new McpdClient({ apiEndpoint: "http://localhost:8090" });
   *
   * // Inject full custom logger.
   * const client = new McpdClient({
   *   apiEndpoint: "http://localhost:8090",
   *   logger: myCustomLogger,
   * });
   *
   * // Partial logger: custom warn/error, default (MCPD_LOG_LEVEL-aware) for others.
   * const client = new McpdClient({
   *   apiEndpoint: "http://localhost:8090",
   *   logger: {
   *     warn: (msg) => myLogger.warn(`[mcpd] ${msg}`),
   *     error: (msg) => myLogger.error(`[mcpd] ${msg}`),
   *     // trace, debug, info use default logger (respects MCPD_LOG_LEVEL)
   *   },
   * });
   *
   * // Disable logging: ensure MCPD_LOG_LEVEL is unset or set to 'off' (default).
   * const client = new McpdClient({ apiEndpoint: "http://localhost:8090" });
   *
   * // Override MCPD_LOG_LEVEL (disable even if env var is set).
   * const client = new McpdClient({
   *   apiEndpoint: "http://localhost:8090",
   *   logger: {
   *     trace: () => {},
   *     debug: () => {},
   *     info: () => {},
   *     warn: () => {},
   *     error: () => {},
   *   },
   * });
   * ```
   */
  logger?: Partial<Logger>;
}

/**
 * Tool format types for cross-framework compatibility.
 *
 * @remarks
 * Output format for agent tools.
 * - 'array': Returns array of functions (default, for LangChain)
 * - 'object': Returns object keyed by tool name (for Vercel AI SDK)
 * - 'map': Returns Map keyed by tool name
 */
export type AgentToolsFormat = "array" | "object" | "map";

/**
 * Base options shared across all agent tools configurations.
 */
export interface BaseAgentToolsOptions {
  /**
   * List of server names to include. If not specified, or empty, should include all servers.
   */
  servers?: string[];

  /**
   * List of tool names to filter by.
   *
   * @remarks
   * Supports both:
   * - Raw tool names: 'get_current_time' (matches tool across all servers)
   * - Server-prefixed names: 'time__get_current_time' (server + TOOL_SEPARATOR + tool)
   * If not specified, returns all tools from selected servers.
   *
   * @example ['add', 'multiply']
   * @example ['time__get_current_time', 'math__add']
   */
  tools?: string[];

  /**
   * When true, clears the agent tools cache and fetches fresh tool schemas from servers.
   * When false or undefined, returns cached functions if available.
   *
   * @defaultValue false
   */
  refreshCache?: boolean;
}

/**
 * Options for getAgentTools with array format (default).
 * Returns an array of agent functions.
 */
export interface ArrayAgentToolsOptions extends BaseAgentToolsOptions {
  format?: "array";
}

/**
 * Options for getAgentTools with object format.
 * Returns an object keyed by tool name.
 */
export interface ObjectAgentToolsOptions extends BaseAgentToolsOptions {
  format: "object";
}

/**
 * Options for getAgentTools with map format.
 * Returns a Map keyed by tool name.
 */
export interface MapAgentToolsOptions extends BaseAgentToolsOptions {
  format: "map";
}

/**
 * Options for generating agent tools.
 * Discriminated union based on the format field.
 */
export type AgentToolsOptions =
  | ArrayAgentToolsOptions
  | ObjectAgentToolsOptions
  | MapAgentToolsOptions;

/**
 * Function signature for performing tool calls.
 * This is injected into proxy classes via dependency injection.
 * @internal
 */
export type PerformCallFn = (
  serverName: string,
  toolName: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Function signature for getting tools from a server.
 * This is injected into proxy classes via dependency injection.
 * @internal
 */
export type GetToolsFn = (serverName: string) => Promise<Tool[]>;

/**
 * Function signature for getting prompt templates from a server.
 * This is injected into proxy classes via dependency injection.
 * @internal
 */
export type GetPromptsFn = (serverName: string) => Promise<Prompt[]>;

/**
 * Function signature for generating a prompt from a template.
 * This is injected into proxy classes via dependency injection.
 * @internal
 */
export type GeneratePromptFn = (
  serverName: string,
  promptName: string,
  args?: Record<string, string>,
) => Promise<GeneratePromptResponseBody>;

/**
 * Function signature for getting resources from a server.
 * This is injected into proxy classes via dependency injection.
 * @internal
 */
export type GetResourcesFn = (serverName: string) => Promise<Resource[]>;

/**
 * Function signature for getting resource templates from a server.
 * This is injected into proxy classes via dependency injection.
 * @internal
 */
export type GetResourceTemplatesFn = (
  serverName: string,
) => Promise<ResourceTemplate[]>;

/**
 * Function signature for reading resource content from a server.
 * This is injected into proxy classes via dependency injection.
 * @internal
 */
export type ReadResourceFn = (
  serverName: string,
  uri: string,
) => Promise<ResourceContent[]>;

/**
 * MCP resource definition.
 */
export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
}

/**
 * Resources list response from the mcpd API.
 */
export interface Resources {
  $schema?: string;
  resources: Resource[];
  nextCursor?: string;
}

/**
 * Prompt argument definition.
 */
export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * MCP prompt definition.
 */
export interface Prompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
  _meta?: Record<string, unknown>;
}

/**
 * Prompts list response from the mcpd API.
 */
export interface Prompts {
  $schema?: string;
  prompts: Prompt[];
  nextCursor?: string;
}

/**
 * Prompt message in a generated prompt.
 */
export interface PromptMessage {
  role: string;
  content: unknown;
}

/**
 * Generated prompt response from the mcpd API.
 */
export interface GeneratePromptResponseBody {
  $schema?: string;
  description?: string;
  messages: PromptMessage[];
}

/**
 * Resource content response from the mcpd API.
 */
export interface ResourceContent {
  uri: string;
  text?: string;
  blob?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
}

/**
 * MCP resource template definition.
 */
export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
}

/**
 * Resource templates list response from the mcpd API.
 */
export interface ResourceTemplates {
  $schema?: string;
  templates: ResourceTemplate[];
  nextCursor?: string;
}

/**
 * Arguments for generating a prompt from a template.
 */
export interface PromptGenerateArguments {
  $schema?: string;
  arguments?: Record<string, string>;
}
