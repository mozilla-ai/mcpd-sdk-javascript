/**
 * Type definitions for the mcpd SDK.
 */

/**
 * Enumeration of possible MCP server health statuses.
 */
export enum HealthStatus {
  OK = 'ok',
  TIMEOUT = 'timeout',
  UNREACHABLE = 'unreachable',
  UNKNOWN = 'unknown',
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
 * MCP tool schema definition.
 */
export interface ToolSchema {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

/**
 * Server health information.
 */
export interface ServerHealth {
  status: string;
  timestamp?: string;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Tools response from the mcpd daemon.
 */
export interface ToolsResponse {
  tools?: ToolSchema[];
  [serverName: string]: ToolSchema[] | undefined;
}

/**
 * Health response from the mcpd API.
 */
export interface HealthResponse {
  $schema?: string;
  servers: Array<ServerHealth & { name: string }>;
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