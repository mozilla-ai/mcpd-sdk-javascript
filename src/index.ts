/**
 * mcpd JavaScript/TypeScript SDK.
 *
 * A JavaScript/TypeScript SDK for interacting with the mcpd daemon, which manages
 * Model Context Protocol (MCP) servers and enables seamless tool execution
 * through natural JavaScript syntax.
 *
 * This package provides:
 * - McpdClient: Main client for server management and tool execution
 * - Dynamic calling: Natural syntax like client.call.server.tool(args)
 * - Agent-ready functions: Generate callable functions via agentTools() for AI frameworks
 * - Type-safe function generation: Create callable functions from tool schemas
 * - Comprehensive error handling: Detailed exceptions for different failure modes
 *
 * @packageDocumentation
 */

export { McpdClient } from './client';

// Export error types
export {
  McpdError,
  AuthenticationError,
  ConnectionError,
  ServerNotFoundError,
  ServerUnhealthyError,
  TimeoutError,
  ToolExecutionError,
  ToolNotFoundError,
  ValidationError,
} from './errors';

// Export type definitions
export {
  HealthStatus,
  HealthStatusHelpers,
  type JsonSchema,
  type ToolSchema,
  type ServerHealth,
  type ToolCallResponse,
  type ServersResponse,
  type ToolsResponse,
  type HealthResponse,
  type McpdClientOptions,
  type RequestOptions,
} from './types';

// Re-export McpdClient as default
export { McpdClient as default } from './client';