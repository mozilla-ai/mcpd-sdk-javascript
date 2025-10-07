/**
 * Dynamic tool invocation for mcpd client.
 *
 * This module provides the ServersNamespace and ServerProxy classes
 * that enable natural JavaScript syntax for calling MCP tools, such as:
 *     client.servers.time.get_current_time(args)
 *
 * The dynamic calling system uses JavaScript's Proxy to create
 * a fluent interface that resolves server and tool names at runtime.
 */

import { ToolNotFoundError } from './errors';
import type { McpdClient } from './client';

/**
 * Convert a camelCase string to snake_case.
 *
 * @param str - The camelCase string to convert
 * @returns The snake_case version of the string
 *
 * @example
 * ```typescript
 * camelToSnake('getCurrentTime') // 'get_current_time'
 * camelToSnake('someToolName') // 'some_tool_name'
 * ```
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

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
 * const result = await client.servers.time.get_current_time({ timezone: "UTC" });
 *
 * // Check if a tool exists
 * if (await client.servers.time.hasTool("get_current_time")) {
 *   // ...
 * }
 * ```
 */
export class ServersNamespace {
  #client: McpdClient;

  /**
   * Initialize the ServersNamespace with a reference to the client.
   *
   * @param client - The McpdClient instance that owns this ServersNamespace
   */
  constructor(client: McpdClient) {
    this.#client = client;

    // Return a Proxy to intercept property access
    return new Proxy(this, {
      get: (target, serverName: string | symbol) => {
        if (typeof serverName !== 'string') {
          return undefined;
        }
        return new ServerProxy(target.#client, serverName);
      },
    });
  }
}

/**
 * Proxy for a specific MCP server, enabling tool invocation via properties.
 *
 * This class represents a specific MCP server and allows calling its tools
 * as if they were methods. Supports both snake_case and camelCase naming.
 *
 * @example
 * ```typescript
 * // ServerProxy is created when you access a server:
 * const timeServer = client.servers.time; // Returns ServerProxy(client, "time")
 *
 * // Check if a tool exists (supports both naming styles):
 * await timeServer.hasTool('get_current_time')  // true
 * await timeServer.hasTool('getCurrentTime')    // true
 *
 * // Call tools (supports both naming styles):
 * await timeServer.get_current_time({ timezone: "UTC" })
 * await timeServer.getCurrentTime({ timezone: "UTC" })
 * ```
 */
export class ServerProxy {
  #client: McpdClient;
  #serverName: string;

  /**
   * Initialize a ServerProxy for a specific server.
   *
   * @param client - The McpdClient instance to use for API calls
   * @param serverName - The name of the MCP server this proxy represents
   */
  constructor(client: McpdClient, serverName: string) {
    this.#client = client;
    this.#serverName = serverName;

    // Return a Proxy to intercept method calls
    return new Proxy(this, {
      get: (target, prop: string | symbol) => {
        if (typeof prop !== 'string') {
          return undefined;
        }

        // Expose hasTool method
        if (prop === 'hasTool') {
          return target.hasTool.bind(target);
        }

        // Return a function that will call the tool
        return async (args?: Record<string, unknown>) => {
          // Try exact match first, then try snake_case conversion
          const toolName = prop;
          const snakeCaseName = camelToSnake(prop);

          // Check if the tool exists (try both names)
          const tools = await target.#client.getTools(target.#serverName);
          const exactMatch = tools.find(t => t.name === toolName);
          const snakeMatch = tools.find(t => t.name === snakeCaseName);

          const actualToolName = exactMatch ? toolName : snakeMatch ? snakeCaseName : null;

          if (!actualToolName) {
            throw new ToolNotFoundError(
              `Tool '${toolName}' not found on server '${target.#serverName}'. ` +
                `Use client.getTools('${target.#serverName}') to see available tools.`,
              target.#serverName,
              toolName
            );
          }

          // Perform the tool call with the actual tool name
          return target.#client._performCall(target.#serverName, actualToolName, args);
        };
      },
    });
  }

  /**
   * Check if a tool exists on this server.
   *
   * Supports both snake_case and camelCase naming.
   *
   * @param toolName - The name of the tool to check (supports both snake_case and camelCase)
   * @returns True if the tool exists, false otherwise
   *
   * @example
   * ```typescript
   * const timeServer = client.getServer('time');
   *
   * // Both naming styles work:
   * await timeServer.hasTool('get_current_time')  // true
   * await timeServer.hasTool('getCurrentTime')    // true
   * ```
   */
  async hasTool(toolName: string): Promise<boolean> {
    try {
      const tools = await this.#client.getTools(this.#serverName);

      // Try exact match first
      if (tools.some(t => t.name === toolName)) {
        return true;
      }

      // Try snake_case conversion
      const snakeCaseName = camelToSnake(toolName);
      return tools.some(t => t.name === snakeCaseName);
    } catch {
      return false;
    }
  }
}