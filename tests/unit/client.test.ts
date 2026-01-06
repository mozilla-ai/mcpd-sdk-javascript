import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpdClient } from "../../src/client";
import {
  ConnectionError,
  AuthenticationError,
  McpdError,
  PipelineError,
} from "../../src/errors";
import { HealthStatusHelpers } from "../../src/types";
import { createFetchMock } from "./utils/mockApi";
import { API_PATHS } from "../../src/apiPaths";

describe("McpdClient", () => {
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

  describe("constructor", () => {
    it("should initialize with basic configuration", () => {
      const basicClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
      });
      expect(basicClient).toBeDefined();
      expect(basicClient.servers).toBeDefined();
    });

    it("should strip trailing slash from endpoint", () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ servers: [] }),
      });

      const clientWithSlash = new McpdClient({
        apiEndpoint: "http://localhost:8090/",
      });

      clientWithSlash.listServers();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8090/api/v1/servers",
        expect.any(Object),
      );
    });

    it("should initialize with API key", () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ servers: [] }),
      });

      const clientWithAuth = new McpdClient({
        apiEndpoint: "http://localhost:8090",
        apiKey: "test-key",
      });

      clientWithAuth.listServers();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8090/api/v1/servers",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        }),
      );
    });
  });

  describe("servers()", () => {
    it("should return list of servers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["time", "fetch", "git"],
      });

      const servers = await client.listServers();

      expect(servers).toEqual(["time", "fetch", "git"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8090/api/v1/servers",
        expect.any(Object),
      );
    });

    it("should handle empty server list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const servers = await client.listServers();

      expect(servers).toEqual([]);
    });

    it("should throw ConnectionError when cannot connect", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(client.listServers()).rejects.toThrow(ConnectionError);
    });

    it("should throw AuthenticationError on 401", async () => {
      const errorModel = {
        detail: "Authentication required",
        status: 401,
        title: "Unauthorized",
        type: "about:blank",
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => JSON.stringify(errorModel),
      });

      await expect(client.listServers()).rejects.toThrow(AuthenticationError);
    });
  });

  describe("getServerHealth()", () => {
    it("should return health for all servers", async () => {
      const mockApiResponse = {
        $schema: "http://localhost:8090/schemas/ServersHealthResponseBody.json",
        servers: [
          {
            name: "time",
            status: "ok",
            latency: "2ms",
            lastChecked: "2025-10-07T15:00:00Z",
            lastSuccessful: "2025-10-07T15:00:00Z",
          },
          {
            name: "fetch",
            status: "ok",
            latency: "1ms",
            lastChecked: "2025-10-07T15:00:00Z",
            lastSuccessful: "2025-10-07T15:00:00Z",
          },
        ],
      };

      const expectedHealth = {
        time: {
          name: "time",
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        },
        fetch: {
          name: "fetch",
          status: "ok",
          latency: "1ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      });

      const health = await client.getServerHealth();

      expect(health).toEqual(expectedHealth);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8090/api/v1/health/servers",
        expect.any(Object),
      );
    });

    it("should return health for specific server", async () => {
      const serverHealth = {
        $schema: "http://localhost:8090/schemas/ServerHealth.json",
        name: "time",
        status: "ok",
        latency: "2.262667ms",
        lastChecked: "2025-10-07T15:22:19.437833Z",
        lastSuccessful: "2025-10-07T15:22:19.437833Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverHealth,
      });

      const health = await client.getServerHealth("time");

      expect(health).toEqual(serverHealth);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8090/api/v1/health/servers/time",
        expect.any(Object),
      );
    });

    it("should cache health results", async () => {
      const serverHealth = {
        name: "time",
        status: "ok",
        latency: "2ms",
        lastChecked: "2025-10-07T15:00:00Z",
        lastSuccessful: "2025-10-07T15:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverHealth,
      });

      // First call
      await client.getServerHealth("time");
      // Second call (should use cache)
      await client.getServerHealth("time");

      // Should only call fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("isServerHealthy()", () => {
    it("should return true for healthy server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "time",
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      const isHealthy = await client.isServerHealthy("time");

      expect(isHealthy).toBe(true);
    });

    it("should return false for unhealthy server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "time",
          status: "unreachable",
          latency: "0ms",
          lastChecked: "2025-10-07T15:00:00Z",
        }),
      });

      const isHealthy = await client.isServerHealthy("time");

      expect(isHealthy).toBe(false);
    });
  });

  describe("getAgentTools() basic functionality", () => {
    it("should generate callable functions for all tools", async () => {
      const mockAllTools = {
        time: [
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
        math: [
          {
            name: "add",
            description: "Add two numbers",
            inputSchema: {
              type: "object",
              properties: {
                a: { type: "number" },
                b: { type: "number" },
              },
              required: ["a", "b"],
            },
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["time", "math"],
      });

      // Second call: health check for all servers (populates cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "time",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "math",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third+Fourth calls: tools for 'time' and 'math' (parallel, order may vary)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockAllTools.time }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockAllTools.math }),
      });

      const tools = await client.getAgentTools({ format: "array" });

      expect(tools).toHaveLength(2);

      const tool0 = tools[0];
      expect(tool0).toBeDefined();
      expect(tool0?.name).toBe("time__get_current_time");
      expect(tool0?.description).toContain("Get current time");
      expect(tool0?._serverName).toBe("time");
      expect(tool0?._toolName).toBe("get_current_time");

      const tool1 = tools[1];
      expect(tool1).toBeDefined();
      expect(tool1?.name).toBe("math__add");
      expect(tool1?.description).toContain("Add two numbers");
      expect(tool1?._serverName).toBe("math");
      expect(tool1?._toolName).toBe("add");
    });

    it("should return empty array when no tools available", async () => {
      // First call: listServers() returns empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      // Second call: health check for all servers (empty)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [],
        }),
      });

      const tools = await client.getAgentTools({ format: "array" });

      expect(tools).toHaveLength(0);
    });
  });

  describe("getAgentTools with tool filtering", () => {
    // Standard mock data used across tool filtering tests.
    const mockTimeAndMathTools = {
      time: [
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
      math: [
        {
          name: "add",
          description: "Add two numbers",
          inputSchema: {
            type: "object",
            properties: {
              a: { type: "number" },
              b: { type: "number" },
            },
            required: ["a", "b"],
          },
        },
        {
          name: "multiply",
          description: "Multiply two numbers",
          inputSchema: {
            type: "object",
            properties: {
              a: { type: "number" },
              b: { type: "number" },
            },
            required: ["a", "b"],
          },
        },
      ],
    };

    // Helper to set up standard mocks: listServers() + health + tools for each server.
    function mockTimeAndMathServers() {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["time", "math"],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "time",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "math",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTimeAndMathTools.time }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTimeAndMathTools.math }),
      });
    }

    it("should filter by raw tool name", async () => {
      mockTimeAndMathServers();

      const tools = await client.getAgentTools({ tools: ["add"] });

      expect(tools).toHaveLength(1);
      expect(tools[0]?._toolName).toBe("add");
      expect(tools[0]?.name).toBe("math__add");
    });

    it("should filter by multiple raw tool names", async () => {
      mockTimeAndMathServers();

      const tools = await client.getAgentTools({ tools: ["add", "multiply"] });

      expect(tools).toHaveLength(2);
      const toolNames = tools.map((t) => t._toolName);
      expect(toolNames).toContain("add");
      expect(toolNames).toContain("multiply");
    });

    it("should filter by prefixed tool name", async () => {
      mockTimeAndMathServers();

      const tools = await client.getAgentTools({
        tools: ["time__get_current_time"],
      });

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("time__get_current_time");
      expect(tools[0]?._serverName).toBe("time");
      expect(tools[0]?._toolName).toBe("get_current_time");
    });

    it("should handle mixed raw and prefixed formats", async () => {
      mockTimeAndMathServers();

      const tools = await client.getAgentTools({
        tools: ["add", "time__get_current_time"],
      });

      expect(tools).toHaveLength(2);
      const hasTimeTool = tools.some(
        (t) => t.name === "time__get_current_time",
      );
      const hasAddTool = tools.some((t) => t._toolName === "add");

      expect(hasTimeTool).toBe(true);
      expect(hasAddTool).toBe(true);
    });

    it("should combine server and tool filtering", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["time", "math"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "time", status: "ok" },
              { name: "math", status: "ok" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("time")]: {
            tools: mockTimeAndMathTools.time,
          },
          [API_PATHS.SERVER_TOOLS("math")]: {
            tools: mockTimeAndMathTools.math,
          },
        }),
      );

      const client = new McpdClient({
        apiEndpoint: "http://localhost:8090",
      });

      const tools = await client.getAgentTools({
        servers: ["time", "math"],
        tools: ["add", "get_current_time"],
      });

      expect(tools).toHaveLength(2);

      const servers = new Set(tools.map((t) => t._serverName));
      const toolNames = new Set(tools.map((t) => t._toolName));

      expect([...servers].every((s) => ["time", "math"].includes(s))).toBe(
        true,
      );

      expect(
        [...toolNames].every((t) => ["add", "get_current_time"].includes(t)),
      ).toBe(true);
    });

    it("should return empty array for non-existent tool", async () => {
      const mockAllTools = {
        time: [
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
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["time"],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "time",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockAllTools.time }),
      });

      const tools = await client.getAgentTools({
        tools: ["nonexistent_tool_xyz"],
      });

      expect(tools).toEqual([]);
    });

    it("should return empty array for empty tools list", async () => {
      const mockAllTools = {
        time: [
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
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["time"],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "time",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockAllTools.time }),
      });

      const tools = await client.getAgentTools({ tools: [] });

      expect(tools).toEqual([]);
    });

    it("should work with object format", async () => {
      mockTimeAndMathServers();

      const tools = await client.getAgentTools({
        tools: ["add"],
        format: "object",
      });

      expect(tools).toBeTypeOf("object");
      expect(tools).not.toBeInstanceOf(Array);
      expect(Object.keys(tools)).toHaveLength(1);
      expect(tools["math__add"]).toBeDefined();
      expect(tools["math__add"]?._toolName).toBe("add");
    });

    it("should work with map format", async () => {
      mockTimeAndMathServers();

      const tools = await client.getAgentTools({
        tools: ["add"],
        format: "map",
      });

      expect(tools).toBeInstanceOf(Map);
      expect(tools.size).toBe(1);
      const addTool = tools.get("math__add");
      expect(addTool).toBeDefined();
      expect(addTool?._toolName).toBe("add");
    });

    it("should handle tool names containing double underscore", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["test"],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "test",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "my__special__tool",
              description: "A tool with underscores in the name",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
          ],
        }),
      });

      const rawFilter = await client.getAgentTools({
        tools: ["my__special__tool"],
      });
      expect(rawFilter).toHaveLength(1);
      expect(rawFilter[0]?._toolName).toBe("my__special__tool");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["test"],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "test",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "my__special__tool",
              description: "A tool with underscores in the name",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
          ],
        }),
      });

      const prefixedFilter = await client.getAgentTools({
        tools: ["test__my__special__tool"],
      });
      expect(prefixedFilter).toHaveLength(1);
      expect(prefixedFilter[0]?.name).toBe("test__my__special__tool");
    });

    it("should prefer prefixed format when filter is ambiguous", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["my", "other"],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "my",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "other",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "special__tool",
              description: "Tool from 'my' server",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: "my__special__tool",
              description: "Tool from 'other' server",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        }),
      });

      const tools = await client.getAgentTools({
        tools: ["my__special__tool"],
      });

      expect(tools).toHaveLength(2);

      const prefixedMatch = tools.find((t) => t._serverName === "my");
      expect(prefixedMatch?._toolName).toBe("special__tool");
      expect(prefixedMatch?.name).toBe("my__special__tool");

      const rawMatch = tools.find((t) => t._serverName === "other");
      expect(rawMatch?._toolName).toBe("my__special__tool");
      expect(rawMatch?.name).toBe("other__my__special__tool");
    });
  });

  describe("getAgentTools caching behavior", () => {
    const mockTimeAndMathTools = {
      time: [
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
      math: [
        {
          name: "add",
          description: "Add two numbers",
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
          },
        },
        {
          name: "multiply",
          description: "Multiply two numbers",
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
          },
        },
      ],
    };

    it("should cache functions and reuse them on subsequent calls", async () => {
      let fetchCallCount = 0;
      const mockFn = vi.fn((url: string) => {
        fetchCallCount++;
        const mock = createFetchMock({
          [API_PATHS.SERVERS]: ["time", "math"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "time", status: "ok" },
              { name: "math", status: "ok" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("time")]: {
            tools: mockTimeAndMathTools.time,
          },
          [API_PATHS.SERVER_TOOLS("math")]: {
            tools: mockTimeAndMathTools.math,
          },
        });
        return mock(url);
      });

      vi.stubGlobal("fetch", mockFn);

      const client = new McpdClient({
        apiEndpoint: "http://localhost:8090",
      });

      const firstCall = await client.getAgentTools();
      expect(firstCall).toHaveLength(3);
      const firstCallCount = fetchCallCount;

      const secondCall = await client.getAgentTools();
      expect(secondCall).toHaveLength(3);
      expect(fetchCallCount).toBe(firstCallCount);
    });

    it("should return filtered results from cache without refetching", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["time", "math"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "time", status: "ok" },
              { name: "math", status: "ok" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("time")]: {
            tools: mockTimeAndMathTools.time,
          },
          [API_PATHS.SERVER_TOOLS("math")]: {
            tools: mockTimeAndMathTools.math,
          },
        }),
      );

      const client = new McpdClient({
        apiEndpoint: "http://localhost:8090",
      });

      const allTools = await client.getAgentTools();
      expect(allTools).toHaveLength(3);

      const timeTools = await client.getAgentTools({ servers: ["time"] });
      expect(timeTools).toHaveLength(1);
      expect(timeTools[0]?._serverName).toBe("time");

      const addTool = await client.getAgentTools({ tools: ["add"] });
      expect(addTool).toHaveLength(1);
      expect(addTool[0]?._toolName).toBe("add");

      const mathAdd = await client.getAgentTools({
        servers: ["math"],
        tools: ["add"],
      });
      expect(mathAdd).toHaveLength(1);
      expect(mathAdd[0]?._serverName).toBe("math");
      expect(mathAdd[0]?._toolName).toBe("add");
    });

    it("should refetch when refreshCache is true", async () => {
      let callCount = 0;
      const mockFn = vi.fn((url: string) => {
        callCount++;
        const mock = createFetchMock({
          [API_PATHS.SERVERS]: ["time", "math"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "time", status: "ok" },
              { name: "math", status: "ok" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("time")]: {
            tools: mockTimeAndMathTools.time,
          },
          [API_PATHS.SERVER_TOOLS("math")]: {
            tools: mockTimeAndMathTools.math,
          },
        });
        return mock(url);
      });

      vi.stubGlobal("fetch", mockFn);

      const client = new McpdClient({
        apiEndpoint: "http://localhost:8090",
      });

      await client.getAgentTools();
      const firstCallCount = callCount;

      await client.getAgentTools({ refreshCache: true });
      const secondCallCount = callCount;

      expect(secondCallCount).toBeGreaterThan(firstCallCount);
    });
  });

  describe("clearAgentToolsCache()", () => {
    it("should clear the function builder cache", () => {
      expect(() => client.clearAgentToolsCache()).not.toThrow();
    });
  });

  describe("isHealthy()", () => {
    it("should return true for ok status", () => {
      expect(HealthStatusHelpers.isHealthy("ok")).toBe(true);
    });

    it("should return false for non-ok status", () => {
      expect(HealthStatusHelpers.isHealthy("timeout")).toBe(false);
      expect(HealthStatusHelpers.isHealthy("unreachable")).toBe(false);
      expect(HealthStatusHelpers.isHealthy("unknown")).toBe(false);
    });
  });

  describe("isTransient()", () => {
    it("should return true for transient statuses", () => {
      expect(HealthStatusHelpers.isTransient("timeout")).toBe(true);
      expect(HealthStatusHelpers.isTransient("unknown")).toBe(true);
    });

    it("should return false for non-transient statuses", () => {
      expect(HealthStatusHelpers.isTransient("ok")).toBe(false);
      expect(HealthStatusHelpers.isTransient("unreachable")).toBe(false);
    });
  });

  describe("logging", () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let originalLogLevel: string | undefined;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Save original log level.
      originalLogLevel = process.env.MCPD_LOG_LEVEL;
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      // Restore original log level.
      if (originalLogLevel === undefined) {
        delete process.env.MCPD_LOG_LEVEL;
      } else {
        process.env.MCPD_LOG_LEVEL = originalLogLevel;
      }
    });

    it("should not log when MCPD_LOG_LEVEL is not set (default)", async () => {
      // Ensure MCPD_LOG_LEVEL is not set.
      // This means the default logger will be a noop.
      delete process.env.MCPD_LOG_LEVEL;

      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["healthy", "unhealthy"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "healthy", status: "ok" },
              { name: "unhealthy", status: "timeout" }, // Generates warning if logging enabled.
            ],
          },
          [API_PATHS.SERVER_TOOLS("healthy")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
        }),
      );

      const newClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
      });
      await newClient.getAgentTools();

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should log warnings when MCPD_LOG_LEVEL is set to warn", async () => {
      // Set MCPD_LOG_LEVEL to enable logging via environment variable.
      process.env.MCPD_LOG_LEVEL = "warn";

      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["healthy", "unhealthy"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "healthy", status: "ok" },
              { name: "unhealthy", status: "timeout" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("healthy")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
        }),
      );

      const newClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
      });
      await newClient.getAgentTools();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Skipping unhealthy server 'unhealthy' with status 'timeout'",
      );
    });

    it("should warn when server is unhealthy", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["healthy", "unhealthy"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "healthy", status: "ok" },
              { name: "unhealthy", status: "timeout" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("healthy")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
        }),
      );

      const customWarn = vi.fn();
      const loggerClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
        logger: { warn: customWarn },
      });

      await loggerClient.getAgentTools();

      expect(customWarn).toHaveBeenCalledWith(
        "Skipping unhealthy server 'unhealthy' with status 'timeout'",
      );
    });

    it("should warn when server does not exist", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["server1", "nonexistent"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "server1", status: "ok" },
              // 'nonexistent' not in health response.
            ],
          },
          [API_PATHS.SERVER_TOOLS("server1")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
        }),
      );

      const customWarn = vi.fn();
      const loggerClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
        logger: { warn: customWarn },
      });

      await loggerClient.getAgentTools({ servers: ["server1", "nonexistent"] });

      expect(customWarn).toHaveBeenCalledWith(
        "Skipping non-existent server 'nonexistent'",
      );
    });

    it("should not warn when all servers are healthy", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["server1", "server2"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "server1", status: "ok" },
              { name: "server2", status: "ok" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("server1")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
          [API_PATHS.SERVER_TOOLS("server2")]: {
            tools: [{ name: "tool2", description: "Tool 2", inputSchema: {} }],
          },
        }),
      );

      const customWarn = vi.fn();
      const loggerClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
        logger: { warn: customWarn },
      });

      await loggerClient.getAgentTools();

      expect(customWarn).not.toHaveBeenCalled();
    });

    it("should log multiple warnings correctly", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: [
            "healthy",
            "timeout_server",
            "unreachable_server",
          ],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "healthy", status: "ok" },
              { name: "timeout_server", status: "timeout" },
              { name: "unreachable_server", status: "unreachable" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("healthy")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
        }),
      );

      const customWarn = vi.fn();
      const loggerClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
        logger: { warn: customWarn },
      });

      await loggerClient.getAgentTools();

      expect(customWarn).toHaveBeenCalledWith(
        "Skipping unhealthy server 'timeout_server' with status 'timeout'",
      );
      expect(customWarn).toHaveBeenCalledWith(
        "Skipping unhealthy server 'unreachable_server' with status 'unreachable'",
      );
      expect(customWarn).toHaveBeenCalledTimes(2);
    });

    it("should use custom logger when provided", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["healthy", "unhealthy"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "healthy", status: "ok" },
              { name: "unhealthy", status: "timeout" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("healthy")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
        }),
      );

      const customWarn = vi.fn();
      const customLogger = {
        warn: customWarn,
      };

      const loggerClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
        logger: customLogger,
      });

      await loggerClient.getAgentTools();

      expect(customWarn).toHaveBeenCalledWith(
        "Skipping unhealthy server 'unhealthy' with status 'timeout'",
      );
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should support partial logger implementation", async () => {
      vi.stubGlobal(
        "fetch",
        createFetchMock({
          [API_PATHS.SERVERS]: ["healthy", "unhealthy"],
          [API_PATHS.HEALTH_ALL]: {
            servers: [
              { name: "healthy", status: "ok" },
              { name: "unhealthy", status: "timeout" },
            ],
          },
          [API_PATHS.SERVER_TOOLS("healthy")]: {
            tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          },
        }),
      );

      const customWarn = vi.fn();

      const loggerClient = new McpdClient({
        apiEndpoint: "http://localhost:8090",
        logger: {
          warn: customWarn,
          // Other methods use default implementation.
        },
      });

      await loggerClient.getAgentTools();

      expect(customWarn).toHaveBeenCalledWith(
        "Skipping unhealthy server 'unhealthy' with status 'timeout'",
      );
    });
  });

  describe("PipelineError handling", () => {
    it("should throw PipelineError for response pipeline failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({
          "Mcpd-Error-Type": "response-pipeline-failure",
        }),
        text: async () => "Response processing failed\n",
      });

      await expect(client.listServers()).rejects.toThrow(PipelineError);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({
          "Mcpd-Error-Type": "response-pipeline-failure",
        }),
        text: async () => "Response processing failed\n",
      });

      try {
        await client.listServers();
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        const pipelineError = error as PipelineError;
        expect(pipelineError.pipelineFlow).toBe("response");
        expect(pipelineError.message).toContain("Response processing failed");
      }
    });

    it("should throw PipelineError for request pipeline failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({
          "Mcpd-Error-Type": "request-pipeline-failure",
        }),
        text: async () => "Request processing failed\n",
      });

      try {
        await client.listServers();
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        const pipelineError = error as PipelineError;
        expect(pipelineError.pipelineFlow).toBe("request");
        expect(pipelineError.message).toContain("Request processing failed");
      }
    });

    it("should throw McpdError for 500 without Mcpd-Error-Type header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
        text: async () => "Internal Server Error",
      });

      try {
        await client.listServers();
      } catch (error) {
        expect(error).not.toBeInstanceOf(PipelineError);
        expect(error).toBeInstanceOf(McpdError);
      }
    });

    it("should handle case-insensitive header value", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({
          "Mcpd-Error-Type": "RESPONSE-PIPELINE-FAILURE",
        }),
        text: async () => "Response processing failed\n",
      });

      try {
        await client.listServers();
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        const pipelineError = error as PipelineError;
        expect(pipelineError.pipelineFlow).toBe("response");
      }
    });

    it("should enrich PipelineError with server and tool context in performCall", async () => {
      // First mock: health check for ensureServerHealthy.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "time",
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Second mock: tools list for getTools (to verify tool exists).
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
              },
            },
          ],
        }),
      });

      // Third mock: tool call returns pipeline error.
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({
          "Mcpd-Error-Type": "response-pipeline-failure",
        }),
        text: async () => "Response processing failed\n",
      });

      try {
        await client.servers.time!.tools.get_current_time!({ timezone: "UTC" });
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        const pipelineError = error as PipelineError;
        expect(pipelineError.pipelineFlow).toBe("response");
        expect(pipelineError.serverName).toBe("time");
        expect(pipelineError.operation).toBe("time.get_current_time");
        expect(pipelineError.message).toContain("Response processing failed");
      }
    });

    it("should not throw PipelineError for other 500 errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({
          "Mcpd-Error-Type": "some-other-error-type",
        }),
        text: async () => "Some other error",
      });

      try {
        await client.listServers();
      } catch (error) {
        expect(error).not.toBeInstanceOf(PipelineError);
        expect(error).toBeInstanceOf(McpdError);
      }
    });
  });
});
