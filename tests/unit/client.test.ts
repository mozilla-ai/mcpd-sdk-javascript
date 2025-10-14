import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpdClient } from "../../src/client";
import { ConnectionError, AuthenticationError } from "../../src/errors";
import { HealthStatusHelpers } from "../../src/types";

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

  describe("getToolSchemas()", () => {
    it("should return all tools from all servers with transformed names", async () => {
      const mockTools = {
        time: [
          {
            name: "get_current_time",
            description: "Get current time",
            inputSchema: { type: "object" },
          },
          {
            name: "convert_timezone",
            description: "Convert timezone",
            inputSchema: { type: "object" },
          },
        ],
        math: [
          {
            name: "add",
            description: "Add two numbers",
            inputSchema: { type: "object" },
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
        json: async () => ({ tools: mockTools.time }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTools.math }),
      });

      const tools = await client.getToolSchemas();

      expect(tools).toHaveLength(3);
      expect(tools[0]?.name).toBe("time__get_current_time");
      expect(tools[1]?.name).toBe("time__convert_timezone");
      expect(tools[2]?.name).toBe("math__add");
    });

    it("should filter tools by specified servers", async () => {
      const mockTools = {
        time: [
          {
            name: "get_current_time",
            description: "Get current time",
            inputSchema: { type: "object" },
          },
        ],
      };

      // First call: health check for all servers (populates cache)
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

      // Second call: tools for 'time'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTools.time }),
      });

      const tools = await client.getToolSchemas({ servers: ["time"] });

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("time__get_current_time");
    });

    it("should return empty array when no tools available", async () => {
      // First call: listServers()
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

      const tools = await client.getToolSchemas();

      expect(tools).toHaveLength(0);
    });

    it("should skip unhealthy servers and continue", async () => {
      const mockTools = {
        time: [
          {
            name: "get_current_time",
            description: "Get current time",
            inputSchema: { type: "object" },
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["time", "unhealthy"],
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
              name: "unhealthy",
              status: "error",
              latency: "0ms",
              lastChecked: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: tools for 'time' (unhealthy server is filtered out, no request made)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTools.time }),
      });

      const tools = await client.getToolSchemas();

      // Should only get tools from healthy server
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("time__get_current_time");
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

  describe("agentTools()", () => {
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

  describe("clearAgentToolsCache()", () => {
    it("should clear the function builder cache", () => {
      // This is more of an integration test to ensure the method exists and calls through
      expect(() => client.clearAgentToolsCache()).not.toThrow();
    });
  });
});

describe("HealthStatusHelpers", () => {
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
});
