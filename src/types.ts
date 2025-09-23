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
 * JSON Schema definition for tool parameters.
 */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  description?: string;
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
  [key: string]: any;
}

/**
 * Tool call response from the mcpd daemon.
 */
export interface ToolCallResponse {
  content?: any;
  error?: {
    code?: string;
    message?: string;
    details?: any;
  };
  [key: string]: any;
}

/**
 * Server list response from the mcpd daemon.
 */
export interface ServersResponse {
  servers: string[];
}

/**
 * Tools response from the mcpd daemon.
 */
export interface ToolsResponse {
  tools?: ToolSchema[];
  [serverName: string]: ToolSchema[] | undefined;
}

/**
 * Health response from the mcpd daemon.
 */
export interface HealthResponse {
  [serverName: string]: ServerHealth;
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
  serverHealthCacheTtl?: number;

  /**
   * Request timeout in milliseconds.
   * Default: 30000 (30 seconds)
   */
  timeout?: number;
}

/**
 * Options for making HTTP requests to the mcpd daemon.
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
}