import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpdClient } from "../../src/client";
import { ToolNotFoundError } from "../../src/errors";

/**
 * Tests for all supported calling patterns to prevent regressions.
 *
 * These tests ensure that all documented API patterns work correctly:
 * - client.servers[serverName]! (dynamic server access)
 * - client.servers.foo.listTools() (list tools)
 * - client.servers.foo!.tools.bar!(args) (static tool call)
 * - client.servers.foo.callTool(name, args) (dynamic tool call)
 * - client.servers.foo.hasTool(name) (check tool existence)
 */
describe("Dynamic Calling Patterns", () => {
  let client: McpdClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    client = new McpdClient({
      apiEndpoint: "http://localhost:8090",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Pattern: client.servers[serverName]! (dynamic server indexing)", () => {
    it("should support dynamic server access with string variable", async () => {
      const serverName = "time";

      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
              inputSchema: {
                type: "object",
                properties: { timezone: { type: "string" } },
                required: ["timezone"],
              },
            },
          ],
        }),
      });

      const tools = await client.servers[serverName]!.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("get_current_time");
    });
  });

  describe("Pattern: client.servers.foo.listTools()", () => {
    it("should list tools with static property access", async () => {
      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: "tool1", description: "Tool 1" },
            { name: "tool2", description: "Tool 2" },
          ],
        }),
      });

      const tools = await client.servers.time!.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]?.name).toBe("tool1");
      expect(tools[1]?.name).toBe("tool2");
    });
  });

  describe("Pattern: client.servers.foo!.tools.bar!(args)", () => {
    it("should call tool with static property access", async () => {
      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
              inputSchema: {
                type: "object",
                properties: { timezone: { type: "string" } },
                required: ["timezone"],
              },
            },
          ],
        }),
      });

      // Tool execution.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
        }),
      });

      const result = await client.servers.time!.tools.get_current_time!({
        timezone: "UTC",
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8090/api/v1/servers/time/tools/get_current_time",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ timezone: "UTC" }),
        }),
      );
    });

    it("should throw ToolNotFoundError for non-existent tool", async () => {
      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list (no tools).
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [],
        }),
      });

      await expect(
        client.servers.time!.tools.nonexistent_tool!(),
      ).rejects.toThrow(ToolNotFoundError);
    });

    it("should handle tool calls without arguments", async () => {
      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "no_args_tool",
              description: "Tool with no args",
            },
          ],
        }),
      });

      // Tool execution.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "success" }],
        }),
      });

      const result = await client.servers.time!.tools.no_args_tool!();

      expect(result).toEqual({
        content: [{ type: "text", text: "success" }],
      });
    });
  });

  describe("Pattern: client.servers.foo.callTool(name, args)", () => {
    it("should call tool with dynamic tool name", async () => {
      const toolName = "get_current_time";

      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
              inputSchema: {
                type: "object",
                properties: { timezone: { type: "string" } },
                required: ["timezone"],
              },
            },
          ],
        }),
      });

      // Tool execution.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
        }),
      });

      const result = await client.servers.time!.callTool(toolName, {
        timezone: "UTC",
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
      });
    });

    it("should throw ToolNotFoundError for non-existent tool", async () => {
      const toolName = "nonexistent_tool";

      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list (no matching tool).
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
            },
          ],
        }),
      });

      await expect(client.servers.time!.callTool(toolName)).rejects.toThrow(
        ToolNotFoundError,
      );
    });

    it("should work with dynamic server name", async () => {
      const serverName = "time";
      const toolName = "get_current_time";

      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
            },
          ],
        }),
      });

      // Tool execution.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
        }),
      });

      const result = await client.servers[serverName]!.callTool(toolName, {
        timezone: "UTC",
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
      });
    });
  });

  describe("Pattern: client.servers.foo.hasTool(name)", () => {
    it("should return true when tool exists", async () => {
      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
            },
          ],
        }),
      });

      const exists = await client.servers.time!.hasTool("get_current_time");

      expect(exists).toBe(true);
    });

    it("should return false when tool does not exist", async () => {
      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
            },
          ],
        }),
      });

      const exists = await client.servers.time!.hasTool("nonexistent_tool");

      expect(exists).toBe(false);
    });

    it("should work with dynamic server name", async () => {
      const serverName = "time";

      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
            },
          ],
        }),
      });

      const exists =
        await client.servers[serverName]!.hasTool("get_current_time");

      expect(exists).toBe(true);
    });
  });

  describe("Mixed patterns and edge cases", () => {
    it("should work with mixed static and dynamic access", async () => {
      const serverName = "time";

      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "tool1",
              description: "Tool 1",
            },
          ],
        }),
      });

      // Mix dynamic server with static method.
      const tools = await client.servers[serverName]!.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("tool1");
    });

    it("should work with dynamic server and static tool call", async () => {
      const serverName = "time";

      // Health check.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Tools list.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "get_current_time",
              description: "Get current time",
            },
          ],
        }),
      });

      // Tool execution.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
        }),
      });

      const result = await client.servers[serverName]!.tools.get_current_time!({
        timezone: "UTC",
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "2024-10-13T12:00:00Z" }],
      });
    });
  });
});
