/**
 * Exception hierarchy for the mcpd SDK.
 *
 * This module provides a structured exception hierarchy to help users handle
 * different error scenarios appropriately.
 */

import type { ErrorModel } from "./types";

/**
 * Pipeline flow constant for request processing failures.
 */
export const PIPELINE_FLOW_REQUEST = "request" as const;

/**
 * Pipeline flow constant for response processing failures.
 */
export const PIPELINE_FLOW_RESPONSE = "response" as const;

/**
 * Pipeline flow indicating where in the pipeline the failure occurred.
 */
export type PipelineFlow =
  | typeof PIPELINE_FLOW_REQUEST
  | typeof PIPELINE_FLOW_RESPONSE;

/**
 * Base exception for all mcpd SDK errors.
 *
 * This exception wraps all errors that occur during interaction with the mcpd daemon,
 * including network failures, authentication errors, server errors, and tool execution
 * failures. The original exception is preserved via the cause property for debugging.
 */
export class McpdError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "McpdError";
    this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when unable to connect to the mcpd daemon.
 *
 * This typically indicates that:
 * - The mcpd daemon is not running
 * - The endpoint URL is incorrect
 * - Network connectivity issues
 * - Firewall blocking the connection
 */
export class ConnectionError extends McpdError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "ConnectionError";
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when authentication with the mcpd daemon fails.
 *
 * This indicates that:
 * - The API key is invalid or expired
 * - The API key is missing but required
 * - The authentication method is not supported
 */
export class AuthenticationError extends McpdError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "AuthenticationError";
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when a specified MCP server doesn't exist.
 *
 * This error occurs when trying to access a server that:
 * - Is not configured in the mcpd daemon
 * - Has been removed or renamed
 * - Is temporarily unavailable
 */
export class ServerNotFoundError extends McpdError {
  public readonly serverName: string | undefined;

  constructor(message: string, serverName?: string, cause?: Error) {
    super(message, cause);
    this.name = "ServerNotFoundError";
    this.serverName = serverName;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when a specified MCP server is not healthy.
 *
 * This indicates that the server exists but is currently unhealthy:
 * - The server is down or unreachable
 * - Timeout occurred while checking health
 * - No health data is available for the server
 */
export class ServerUnhealthyError extends McpdError {
  public readonly serverName: string;
  public readonly healthStatus: string;

  constructor(
    message: string,
    serverName: string,
    healthStatus: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = "ServerUnhealthyError";
    this.serverName = serverName;
    this.healthStatus = healthStatus;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when a specified tool doesn't exist on a server.
 *
 * This error occurs when trying to call a tool that:
 * - Doesn't exist on the specified server
 * - Has been removed or renamed
 * - Is temporarily unavailable
 */
export class ToolNotFoundError extends McpdError {
  public readonly serverName: string | undefined;
  public readonly toolName: string | undefined;

  constructor(
    message: string,
    serverName?: string,
    toolName?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = "ToolNotFoundError";
    this.serverName = serverName;
    this.toolName = toolName;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when a tool execution fails on the server side.
 *
 * This indicates that the tool was found and called, but failed during execution:
 * - Invalid parameters provided
 * - Server-side error during tool execution
 * - Tool returned an error response
 * - Timeout during tool execution
 */
export class ToolExecutionError extends McpdError {
  public readonly serverName: string | undefined;
  public readonly toolName: string | undefined;
  public readonly errorModel: ErrorModel | undefined;

  constructor(
    message: string,
    serverName?: string,
    toolName?: string,
    errorModel?: ErrorModel,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = "ToolExecutionError";
    this.serverName = serverName;
    this.toolName = toolName;
    this.errorModel = errorModel;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when input validation fails.
 *
 * This occurs when:
 * - Required parameters are missing
 * - Parameter types don't match the schema
 * - Parameter values don't meet constraints
 */
export class ValidationError extends McpdError {
  public readonly validationErrors: string[];

  constructor(message: string, validationErrors?: string[], cause?: Error) {
    super(message, cause);
    this.name = "ValidationError";
    this.validationErrors = validationErrors || [];
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when an operation times out.
 *
 * This can occur during:
 * - Long-running tool executions
 * - Slow network connections
 * - Unresponsive mcpd daemon
 */
export class TimeoutError extends McpdError {
  public readonly operation: string | undefined;
  public readonly timeout: number | undefined;

  constructor(
    message: string,
    operation?: string,
    timeout?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = "TimeoutError";
    this.operation = operation;
    this.timeout = timeout;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Raised when required pipeline processing fails.
 *
 * This indicates that required processing failed in the mcpd pipeline.
 * The error occurs when a required plugin (such as authentication, validation,
 * audit logging, monitoring, or response transformation) fails during request
 * or response processing.
 *
 * Pipeline Flow Distinction:
 * - **response-pipeline-failure**: The upstream request was processed (the tool
 *   was called), but results cannot be returned due to a required response
 *   processing step failure. Note: This does not indicate whether the tool
 *   itself succeeded or failed - only that the response cannot be delivered.
 *
 * - **request-pipeline-failure**: The request was rejected before reaching the
 *   upstream server due to a required request processing step failure (such as
 *   authentication, authorization, validation, or rate limiting plugin failure).
 *
 * This typically indicates a problem with a plugin or an external system
 * that a plugin depends on (e.g., audit service, authentication provider).
 * Retrying is unlikely to help as this usually indicates a configuration
 * or dependency problem rather than a transient failure.
 *
 * @example
 * ```typescript
 * import { McpdClient, PipelineError } from '@mozilla-ai/mcpd';
 *
 * const client = new McpdClient({ apiEndpoint: 'http://localhost:8090' });
 *
 * try {
 *   const result = await client.servers.time.tools.get_current_time();
 * } catch (error) {
 *   if (error instanceof PipelineError) {
 *     console.log(`Pipeline failure: ${error.message}`);
 *     console.log(`Flow: ${error.pipelineFlow}`);
 *
 *     if (error.pipelineFlow === 'response') {
 *       console.log('Tool was called but results cannot be delivered');
 *     } else {
 *       console.log('Request was rejected by pipeline');
 *       console.log('Check authentication, authorization, or rate limiting');
 *     }
 *   }
 * }
 * ```
 *
 * @remarks
 * This exception indicates a problem with a plugin or its dependencies, not
 * with your request or the tool itself.
 */
export class PipelineError extends McpdError {
  public readonly serverName: string | undefined;
  public readonly operation: string | undefined;
  public readonly pipelineFlow: PipelineFlow | undefined;

  constructor(
    message: string,
    serverName?: string,
    operation?: string,
    pipelineFlow?: PipelineFlow,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = "PipelineError";
    this.serverName = serverName;
    this.operation = operation;
    this.pipelineFlow = pipelineFlow;
    Error.captureStackTrace(this, this.constructor);
  }
}
