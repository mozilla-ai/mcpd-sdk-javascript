/**
 * Dynamic tool invocation for mcpd client.
 *
 * This module provides the ServersNamespace, ServerProxy, and ToolsProxy classes
 * that enable natural JavaScript syntax for calling MCP tools, such as:
 *     client.servers.time.tools.get_current_time(args)
 *
 * The dynamic calling system uses JavaScript's Proxy to create
 * a fluent interface that resolves server and tool names at runtime.
 */

import { ToolNotFoundError } from "./errors";
import type { ToolSchema, PerformCallFn, GetToolsFn } from "./types";

/**
 * Namespace for accessing MCP servers via proxy.
 *
 * This class provides the `client.servers.*` namespace, allowing you to access
 * servers and their tools with natural JavaScript syntax.
 *
 * @example
 * ```typescript
 * const client = new McpdClient({ apiEndpoint: 'http://localhost:8090' });
 *
 * // Access tools through the servers namespace
 * const result = await client.servers.time.tools.get_current_time({ timezone: "UTC" });
 *
 * // Check if a tool exists
 * if (await client.servers.time.tools.hasTool("get_current_time")) {
 *   // ...
 * }
 * ```
 */
export class ServersNamespace {
  #performCall: PerformCallFn;
  #getTools: GetToolsFn;

  /**
   * Initialize the ServersNamespace with injected functions.
   *
   * @param performCall - Function to execute tool calls
   * @param getTools - Function to get tool schemas
   */
  constructor(performCall: PerformCallFn, getTools: GetToolsFn) {
    this.#performCall = performCall;
    this.#getTools = getTools;

    // Return a Proxy to intercept property access
    return new Proxy(this, {
      get: (target, serverName: string | symbol) => {
        if (typeof serverName !== "string") {
          return undefined;
        }
        return new ServerProxy(
          target.#performCall,
          target.#getTools,
          serverName,
        );
      },
    });
  }
}

/**
 * Proxy for a specific MCP server, enabling tool access and server operations.
 *
 * This class represents a specific MCP server and provides access to its tools
 * through the `.tools` namespace, as well as server-level operations like listing tools.
 *
 * @example
 * ```typescript
 * // ServerProxy is created when you access a server:
 * const timeServer = client.servers.time; // Returns ServerProxy(...)
 *
 * // List available tools
 * const tools = await timeServer.listTools();
 *
 * // Call tools through the .tools namespace:
 * await timeServer.tools.get_current_time({ timezone: "UTC" })
 * ```
 */
export class ServerProxy {
  #performCall: PerformCallFn;
  #getTools: GetToolsFn;
  #serverName: string;

  /**
   * Initialize a ServerProxy for a specific server.
   *
   * @param performCall - Function to execute tool calls
   * @param getTools - Function to get tool schemas
   * @param serverName - The name of the MCP server this proxy represents
   */
  constructor(
    performCall: PerformCallFn,
    getTools: GetToolsFn,
    serverName: string,
  ) {
    this.#performCall = performCall;
    this.#getTools = getTools;
    this.#serverName = serverName;

    // Return a Proxy to intercept property access
    return new Proxy(this, {
      get: (target, prop: string | symbol) => {
        if (typeof prop !== "string") {
          return undefined;
        }

        // Expose listTools method
        if (prop === "listTools") {
          return target.listTools.bind(target);
        }

        // Expose tools namespace
        if (prop === "tools") {
          return new ToolsProxy(
            target.#performCall,
            target.#getTools,
            target.#serverName,
          );
        }

        // Unknown property
        return undefined;
      },
    });
  }

  /**
   * List all tools available on this server.
   *
   * @returns Array of tool schemas
   * @throws {ServerNotFoundError} If the server doesn't exist
   * @throws {ServerUnhealthyError} If the server is unhealthy
   *
   * @example
   * ```typescript
   * const tools = await client.servers.time.listTools();
   * for (const tool of tools) {
   *   console.log(`${tool.name}: ${tool.description}`);
   * }
   * ```
   */
  async listTools(): Promise<ToolSchema[]> {
    return this.#getTools(this.#serverName);
  }
}

/**
 * Proxy for accessing tools on a specific MCP server.
 *
 * This class provides the `.tools` namespace for a server, allowing you to call
 * tools as if they were methods. All tool names must match exactly as returned
 * by the MCP server.
 *
 * @example
 * ```typescript
 * // Access via .tools namespace
 * const result = await client.servers.time.tools.get_current_time({ timezone: "UTC" });
 *
 * // Use callTool for dynamic tool names
 * const toolName = "get_current_time";
 * const result = await client.servers.time.tools.callTool(toolName, { timezone: "UTC" });
 *
 * // Check if a tool exists
 * if (await client.servers.time.tools.hasTool("get_current_time")) {
 *   // ...
 * }
 * ```
 */
export class ToolsProxy {
  #performCall: PerformCallFn;
  #getTools: GetToolsFn;
  #serverName: string;

  /**
   * Initialize a ToolsProxy for a specific server.
   *
   * @param performCall - Function to execute tool calls
   * @param getTools - Function to get tool schemas
   * @param serverName - The name of the MCP server
   */
  constructor(
    performCall: PerformCallFn,
    getTools: GetToolsFn,
    serverName: string,
  ) {
    this.#performCall = performCall;
    this.#getTools = getTools;
    this.#serverName = serverName;

    // Return a Proxy to intercept method calls
    return new Proxy(this, {
      get: (target, prop: string | symbol) => {
        if (typeof prop !== "string") {
          return undefined;
        }

        // Expose hasTool method
        if (prop === "hasTool") {
          return target.hasTool.bind(target);
        }

        // Expose callTool method
        if (prop === "callTool") {
          return target.callTool.bind(target);
        }

        // Return a function that will call the tool with exact name matching
        return async (args?: Record<string, unknown>) => {
          const toolName = prop;

          // Check if the tool exists (exact match only)
          const tools = await target.#getTools(target.#serverName);
          const tool = tools.find((t) => t.name === toolName);

          if (!tool) {
            throw new ToolNotFoundError(
              `Tool '${toolName}' not found on server '${target.#serverName}'. ` +
                `Use client.servers.${target.#serverName}.listTools() to see available tools.`,
              target.#serverName,
              toolName,
            );
          }

          // Perform the tool call
          return target.#performCall(target.#serverName, toolName, args);
        };
      },
    });
  }

  /**
   * Call a tool by name with the given arguments.
   *
   * This method is useful for programmatic tool invocation when the tool name
   * is in a variable. The tool name must match exactly as returned by the server.
   *
   * @param toolName - The exact name of the tool to call
   * @param args - The arguments to pass to the tool
   * @returns The tool's response
   * @throws {ToolNotFoundError} If the tool doesn't exist on the server
   *
   * @example
   * ```typescript
   * // Call with explicit method (useful for dynamic tool names):
   * const toolName = 'get_current_time';
   * await client.servers.time.tools.callTool(toolName, { timezone: 'UTC' });
   * ```
   */
  async callTool(
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    // Check if the tool exists (exact match only)
    const tools = await this.#getTools(this.#serverName);
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      throw new ToolNotFoundError(
        `Tool '${toolName}' not found on server '${this.#serverName}'. ` +
          `Use client.servers.${this.#serverName}.listTools() to see available tools.`,
        this.#serverName,
        toolName,
      );
    }

    // Perform the tool call
    return this.#performCall(this.#serverName, toolName, args);
  }

  /**
   * Check if a tool exists on this server.
   *
   * The tool name must match exactly as returned by the server.
   *
   * @param toolName - The exact name of the tool to check
   * @returns True if the tool exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await client.servers.time.tools.hasTool('get_current_time')) {
   *   const result = await client.servers.time.tools.get_current_time({ timezone: 'UTC' });
   * }
   * ```
   */
  async hasTool(toolName: string): Promise<boolean> {
    try {
      const tools = await this.#getTools(this.#serverName);
      return tools.some((t) => t.name === toolName);
    } catch {
      return false;
    }
  }
}
