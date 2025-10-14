/**
 * Exception hierarchy for the mcpd SDK.
 *
 * This module provides a structured exception hierarchy to help users handle
 * different error scenarios appropriately.
 */

import type { ErrorModel } from "./types";

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
