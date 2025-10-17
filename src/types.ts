/**
 * Type definitions for the mcpd SDK.
 */

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
   * Default: 10
   */
  healthCacheTtl?: number;

  /**
   * TTL in seconds for caching server list and tool schemas.
   * Default: 60
   */
  serverCacheTtl?: number;

  /**
   * Request timeout in milliseconds.
   * Default: 30000 (30 seconds)
   */
  timeout?: number;
}

/**
 * Tool format types for cross-framework compatibility.
 */
export type ToolFormat = "array" | "object" | "map";

/**
 * Options for generating agent tools.
 */
export interface AgentToolsOptions {
  /**
   * Optional list of server names to include. If not specified, includes all servers.
   */
  servers?: string[];

  /**
   * Output format for the tools.
   * - 'array': Returns array of functions (default, for LangChain)
   * - 'object': Returns object keyed by tool name (for Vercel AI SDK)
   * - 'map': Returns Map keyed by tool name
   */
  format?: ToolFormat;
}

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
  // SDK additions for client-level aggregation.
  _serverName?: string;
  _resourceName?: string;
  _uri?: string;
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
  // SDK additions for client-level aggregation.
  _serverName?: string;
  _templateName?: string;
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
