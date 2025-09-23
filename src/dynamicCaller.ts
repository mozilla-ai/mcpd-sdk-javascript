/**
 * Dynamic tool invocation for mcpd client.
 *
 * This module provides the DynamicCaller and ServerProxy classes that enable
 * natural JavaScript syntax for calling MCP tools, such as:
 *     client.call.server.tool(args)
 *
 * The dynamic calling system uses JavaScript's Proxy to create
 * a fluent interface that resolves server and tool names at runtime.
 */

import { ToolNotFoundError } from './errors';
import type { McpdClient } from './client';

/**
 * Enables dynamic, attribute-based tool invocation using natural JavaScript syntax.
 *
 * This class provides the magic behind the client.call.server.tool(args) syntax,
 * allowing you to call MCP tools as if they were native JavaScript methods. It uses
 * JavaScript's Proxy to dynamically resolve server and tool names at runtime.
 *
 * The DynamicCaller is automatically instantiated as the 'call' attribute on McpdClient
 * and should not be created directly.
 *
 * @example
 * ```typescript
 * const client = new McpdClient({ apiEndpoint: 'http://localhost:8090' });
 *
 * // Access tools through natural attribute syntax
 * // Instead of: client._performCall("time", "get_current_time", { timezone: "UTC" })
 * // You can write:
 * const result = await client.call.time.get_current_time({ timezone: "UTC" });
 *
 * // Works with any server and tool name
 * const weather = await client.call.weather.get_forecast({ city: "Tokyo" });
 * const messages = await client.call.discord.read_messages({ channelId: "123", limit: 10 });
 * ```
 */
export class DynamicCaller {
  private client: McpdClient;

  /**
   * Initialize the DynamicCaller with a reference to the client.
   *
   * @param client - The McpdClient instance that owns this DynamicCaller
   */
  constructor(client: McpdClient) {
    this.client = client;

    // Return a Proxy to intercept property access
    return new Proxy(this, {
      get: (target, serverName: string | symbol) => {
        if (typeof serverName !== 'string') {
          return undefined;
        }
        return new ServerProxy(target.client, serverName);
      },
    });
  }
}

/**
 * Proxy for a specific MCP server, enabling tool invocation via properties.
 *
 * This class represents a specific MCP server and allows calling its tools
 * as if they were methods. It's created automatically by DynamicCaller and
 * should not be instantiated directly.
 *
 * @example
 * ```typescript
 * // ServerProxy is created when you access a server:
 * const timeServer = client.call.time; // Returns ServerProxy(client, "time")
 *
 * // You can then call tools on it:
 * const currentTime = await timeServer.get_current_time({ timezone: "UTC" });
 *
 * // Or chain it directly:
 * const currentTime = await client.call.time.get_current_time({ timezone: "UTC" });
 * ```
 */
export class ServerProxy {
  private client: McpdClient;
  private serverName: string;

  /**
   * Initialize a ServerProxy for a specific server.
   *
   * @param client - The McpdClient instance to use for API calls
   * @param serverName - The name of the MCP server this proxy represents
   */
  constructor(client: McpdClient, serverName: string) {
    this.client = client;
    this.serverName = serverName;

    // Return a Proxy to intercept method calls
    return new Proxy(this, {
      get: (target, toolName: string | symbol) => {
        if (typeof toolName !== 'string') {
          return undefined;
        }

        // Return a function that will call the tool
        return async (args?: Record<string, any>) => {
          // Check if the tool exists
          const hasTool = await target.client.hasTool(target.serverName, toolName);
          if (!hasTool) {
            throw new ToolNotFoundError(
              `Tool '${toolName}' not found on server '${target.serverName}'. ` +
                `Use client.tools('${target.serverName}') to see available tools.`,
              target.serverName,
              toolName
            );
          }

          // Perform the tool call
          return target.client._performCall(target.serverName, toolName, args);
        };
      },
    });
  }
}