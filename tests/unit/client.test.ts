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

  describe("getTools()", () => {
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

      const tools = await client.getTools();

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

      const tools = await client.getTools({ servers: ["time"] });

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

      const tools = await client.getTools();

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

      const tools = await client.getTools();

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

  describe("getPrompts()", () => {
    it("should return all prompts from all servers with transformed names", async () => {
      const mockPrompts = {
        github: [
          {
            name: "create_pr",
            description: "Create a pull request",
            arguments: [{ name: "title", required: true }],
          },
          {
            name: "close_issue",
            description: "Close an issue",
            arguments: [{ name: "number", required: true }],
          },
        ],
        notion: [
          {
            name: "create_page",
            description: "Create a new page",
            arguments: [{ name: "title", required: true }],
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["github", "notion"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "github",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "notion",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third+Fourth calls: prompts for 'github' and 'notion' (parallel)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: mockPrompts.github }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: mockPrompts.notion }),
      });

      const prompts = await client.getPrompts();

      expect(prompts).toHaveLength(3);
      expect(prompts[0]?.name).toBe("github__create_pr");
      expect(prompts[1]?.name).toBe("github__close_issue");
      expect(prompts[2]?.name).toBe("notion__create_page");
    });

    it("should filter prompts by specified servers", async () => {
      const mockPrompts = {
        github: [
          {
            name: "create_pr",
            description: "Create a pull request",
            arguments: [],
          },
        ],
      };

      // First call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "github",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Second call: prompts for 'github'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: mockPrompts.github }),
      });

      const prompts = await client.getPrompts({ servers: ["github"] });

      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.name).toBe("github__create_pr");
    });

    it("should return empty array when no prompts available", async () => {
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

      const prompts = await client.getPrompts();

      expect(prompts).toHaveLength(0);
    });

    it("should skip servers that return 501 Not Implemented", async () => {
      const mockPrompts = {
        github: [
          {
            name: "create_pr",
            description: "Create a pull request",
            arguments: [],
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["github", "no-prompts"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "github",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "no-prompts",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: prompts for 'github' (success)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: mockPrompts.github }),
      });

      // Fourth call: prompts for 'no-prompts' (501 error)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 501,
        statusText: "Not Implemented",
        text: async () =>
          JSON.stringify({
            detail: "Server does not support prompts",
            status: 501,
            title: "Not Implemented",
            type: "about:blank",
          }),
      });

      const prompts = await client.getPrompts();

      // Should only get prompts from server that supports them
      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.name).toBe("github__create_pr");
    });

    it("should skip unhealthy servers", async () => {
      const mockPrompts = {
        github: [
          {
            name: "create_pr",
            description: "Create a pull request",
            arguments: [],
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["github", "unhealthy"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "github",
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

      // Third call: prompts for 'github' (unhealthy server is filtered out)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: mockPrompts.github }),
      });

      const prompts = await client.getPrompts();

      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.name).toBe("github__create_pr");
    });
  });

  describe("generatePrompt()", () => {
    it("should generate prompt with arguments", async () => {
      const mockResponse = {
        description: "A pull request for fixing a bug",
        messages: [
          { role: "user", content: "Create PR: Fix bug" },
          { role: "assistant", content: "I'll help create that PR" },
        ],
      };

      // First call: health check for server
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "github",
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Second call: generate prompt
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.generatePrompt("github__create_pr", {
        title: "Fix bug",
        description: "Fixed the authentication issue",
      });

      expect(result.description).toBe("A pull request for fixing a bug");
      expect(result.messages).toHaveLength(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        "http://localhost:8090/api/v1/servers/github/prompts/create_pr",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            arguments: {
              title: "Fix bug",
              description: "Fixed the authentication issue",
            },
          }),
        }),
      );
    });

    it("should throw error for invalid prompt name format", async () => {
      await expect(client.generatePrompt("invalid")).rejects.toThrow(
        "Invalid prompt name format: invalid. Expected format: serverName__promptName",
      );
    });

    it("should handle prompt names with underscores", async () => {
      const mockResponse = {
        description: "Test prompt",
        messages: [],
      };

      // First call: health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "github",
          status: "ok",
          latency: "2ms",
          lastChecked: "2025-10-07T15:00:00Z",
          lastSuccessful: "2025-10-07T15:00:00Z",
        }),
      });

      // Second call: generate prompt
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.generatePrompt("github__create_pull_request", {
        title: "Test",
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        "http://localhost:8090/api/v1/servers/github/prompts/create_pull_request",
        expect.any(Object),
      );
    });
  });

  describe("getResources()", () => {
    it("should return all resources from all servers with transformed names", async () => {
      const mockResources = {
        files: [
          {
            uri: "file:///Users/test/doc.txt",
            name: "doc.txt",
            description: "A text document",
            mimeType: "text/plain",
          },
          {
            uri: "file:///Users/test/image.png",
            name: "image.png",
            description: "An image file",
            mimeType: "image/png",
          },
        ],
        web: [
          {
            uri: "https://example.com/page",
            name: "example_page",
            description: "Example web page",
            mimeType: "text/html",
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files", "web"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "web",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third+Fourth calls: resources for 'files' and 'web' (parallel)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources.files }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources.web }),
      });

      const resources = await client.getResources();

      expect(resources).toHaveLength(3);
      expect(resources[0]?.name).toBe("files__doc.txt");
      expect(resources[0]?._serverName).toBe("files");
      expect(resources[0]?._resourceName).toBe("doc.txt");
      expect(resources[0]?._uri).toBe("file:///Users/test/doc.txt");
      expect(resources[1]?.name).toBe("files__image.png");
      expect(resources[2]?.name).toBe("web__example_page");
    });

    it("should filter resources by specified servers", async () => {
      const mockResources = {
        files: [
          {
            uri: "file:///Users/test/doc.txt",
            name: "doc.txt",
            description: "A text document",
            mimeType: "text/plain",
          },
        ],
      };

      // First call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Second call: resources for 'files'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources.files }),
      });

      const resources = await client.getResources({ servers: ["files"] });

      expect(resources).toHaveLength(1);
      expect(resources[0]?.name).toBe("files__doc.txt");
    });

    it("should return empty array when no resources available", async () => {
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

      const resources = await client.getResources();

      expect(resources).toHaveLength(0);
    });

    it("should skip servers that return 501 Not Implemented", async () => {
      const mockResources = {
        files: [
          {
            uri: "file:///Users/test/doc.txt",
            name: "doc.txt",
            description: "A text document",
            mimeType: "text/plain",
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files", "no-resources"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "no-resources",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: resources for 'files' (success)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources.files }),
      });

      // Fourth call: resources for 'no-resources' (501 error)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 501,
        statusText: "Not Implemented",
        text: async () =>
          JSON.stringify({
            detail: "Server does not support resources",
            status: 501,
            title: "Not Implemented",
            type: "about:blank",
          }),
      });

      const resources = await client.getResources();

      // Should only get resources from server that supports them
      expect(resources).toHaveLength(1);
      expect(resources[0]?.name).toBe("files__doc.txt");
    });

    it("should skip unhealthy servers", async () => {
      const mockResources = {
        files: [
          {
            uri: "file:///Users/test/doc.txt",
            name: "doc.txt",
            description: "A text document",
            mimeType: "text/plain",
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files", "unhealthy"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
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

      // Third call: resources for 'files' (unhealthy server is filtered out)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources.files }),
      });

      const resources = await client.getResources();

      expect(resources).toHaveLength(1);
      expect(resources[0]?.name).toBe("files__doc.txt");
    });
  });

  describe("getResourceTemplates()", () => {
    it("should return all resource templates from all servers with transformed names", async () => {
      const mockTemplates = {
        files: [
          {
            uriTemplate: "file:///Users/{username}/docs/{filename}",
            name: "user_doc",
            description: "User document template",
            mimeType: "text/plain",
          },
        ],
        web: [
          {
            uriTemplate: "https://example.com/{path}",
            name: "web_page",
            description: "Web page template",
            mimeType: "text/html",
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files", "web"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "web",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third+Fourth calls: templates for 'files' and 'web' (parallel)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: mockTemplates.files }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: mockTemplates.web }),
      });

      const templates = await client.getResourceTemplates();

      expect(templates).toHaveLength(2);
      expect(templates[0]?.name).toBe("files__user_doc");
      expect(templates[0]?._serverName).toBe("files");
      expect(templates[0]?._templateName).toBe("user_doc");
      expect(templates[1]?.name).toBe("web__web_page");
    });

    it("should filter resource templates by specified servers", async () => {
      const mockTemplates = {
        files: [
          {
            uriTemplate: "file:///Users/{username}/docs/{filename}",
            name: "user_doc",
            description: "User document template",
            mimeType: "text/plain",
          },
        ],
      };

      // First call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Second call: templates for 'files'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: mockTemplates.files }),
      });

      const templates = await client.getResourceTemplates({
        servers: ["files"],
      });

      expect(templates).toHaveLength(1);
      expect(templates[0]?.name).toBe("files__user_doc");
    });

    it("should skip servers that return 501 Not Implemented", async () => {
      const mockTemplates = {
        files: [
          {
            uriTemplate: "file:///Users/{username}/docs/{filename}",
            name: "user_doc",
            description: "User document template",
            mimeType: "text/plain",
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files", "no-templates"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
            {
              name: "no-templates",
              status: "ok",
              latency: "1ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: templates for 'files' (success)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: mockTemplates.files }),
      });

      // Fourth call: templates for 'no-templates' (501 error)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 501,
        statusText: "Not Implemented",
        text: async () =>
          JSON.stringify({
            detail: "Server does not support resource templates",
            status: 501,
            title: "Not Implemented",
            type: "about:blank",
          }),
      });

      const templates = await client.getResourceTemplates();

      // Should only get templates from server that supports them
      expect(templates).toHaveLength(1);
      expect(templates[0]?.name).toBe("files__user_doc");
    });

    it("should skip unhealthy servers", async () => {
      const mockTemplates = {
        files: [
          {
            uriTemplate: "file:///Users/{username}/docs/{filename}",
            name: "user_doc",
            description: "User document template",
            mimeType: "text/plain",
          },
        ],
      };

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files", "unhealthy"],
      });

      // Second call: health check for all servers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
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

      // Third call: templates for 'files' (unhealthy server is filtered out)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: mockTemplates.files }),
      });

      const templates = await client.getResourceTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]?.name).toBe("files__user_doc");
    });
  });

  describe("readResource()", () => {
    it("should auto-populate cache and read resource content", async () => {
      const mockResources = [
        {
          uri: "file:///Users/test/doc.txt",
          name: "doc.txt",
          description: "A text document",
          mimeType: "text/plain",
        },
      ];

      const mockContent = [
        {
          uri: "file:///Users/test/doc.txt",
          text: "Hello, world!",
          mimeType: "text/plain",
        },
      ];

      // First call: listServers() (triggered by auto-populate)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files"],
      });

      // Second call: health check (triggered by auto-populate)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: getResources (auto-populate cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources }),
      });

      // Fourth call: read resource content (health check is cached from step 2)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      });

      const content = await client.readResource("files__doc.txt");

      expect(content).toHaveLength(1);
      expect(content[0]?.text).toBe("Hello, world!");
      expect(content[0]?.mimeType).toBe("text/plain");
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining(
          "/api/v1/servers/files/resources/content?uri=file%3A%2F%2F%2FUsers%2Ftest%2Fdoc.txt",
        ),
        expect.any(Object),
      );
    });

    it("should read from pre-populated cache", async () => {
      const mockResources = [
        {
          uri: "file:///Users/test/doc.txt",
          name: "doc.txt",
          description: "A text document",
          mimeType: "text/plain",
        },
      ];

      const mockContent = [
        {
          uri: "file:///Users/test/doc.txt",
          text: "Hello, world!",
          mimeType: "text/plain",
        },
      ];

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files"],
      });

      // Second call: health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: getResources (pre-populate cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources }),
      });

      // Pre-populate the cache
      await client.getResources();

      // Fourth call: read resource content (health check is cached from step 2)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      });

      const content = await client.readResource("files__doc.txt");

      expect(content).toHaveLength(1);
      expect(content[0]?.text).toBe("Hello, world!");
      // Should only have 4 fetch calls total (not 7 if it auto-populated again)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("should handle blob content", async () => {
      const mockResources = [
        {
          uri: "file:///Users/test/image.png",
          name: "image.png",
          description: "An image file",
          mimeType: "image/png",
        },
      ];

      const mockContent = [
        {
          uri: "file:///Users/test/image.png",
          blob: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          mimeType: "image/png",
        },
      ];

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files"],
      });

      // Second call: health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: getResources (pre-populate cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources }),
      });

      await client.getResources();

      // Fourth call: read resource content (health check is cached from step 2)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      });

      const content = await client.readResource("files__image.png");

      expect(content).toHaveLength(1);
      expect(content[0]?.blob).toBeDefined();
      expect(content[0]?.mimeType).toBe("image/png");
    });

    it("should throw error when resource not found after cache population", async () => {
      const mockResources = [
        {
          uri: "file:///Users/test/doc.txt",
          name: "doc.txt",
          description: "A text document",
          mimeType: "text/plain",
        },
      ];

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files"],
      });

      // Second call: health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: getResources (auto-populate cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources }),
      });

      await expect(
        client.readResource("files__nonexistent.txt"),
      ).rejects.toThrow(
        "Resource 'files__nonexistent.txt' not found. Use getResources() to see available resources.",
      );
    });

    it("should throw error for invalid resource name format", async () => {
      // First call: listServers() (triggered by auto-populate)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      // Second call: health check (triggered by auto-populate)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [],
        }),
      });

      await expect(client.readResource("invalid")).rejects.toThrow(
        "Resource 'invalid' not found. Use getResources() to see available resources.",
      );
    });

    it("should handle resource names with underscores", async () => {
      const mockResources = [
        {
          uri: "file:///Users/test/my_file.txt",
          name: "my_file.txt",
          description: "A file with underscores",
          mimeType: "text/plain",
        },
      ];

      const mockContent = [
        {
          uri: "file:///Users/test/my_file.txt",
          text: "Content",
          mimeType: "text/plain",
        },
      ];

      // First call: listServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ["files"],
      });

      // Second call: health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [
            {
              name: "files",
              status: "ok",
              latency: "2ms",
              lastChecked: "2025-10-07T15:00:00Z",
              lastSuccessful: "2025-10-07T15:00:00Z",
            },
          ],
        }),
      });

      // Third call: getResources
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: mockResources }),
      });

      await client.getResources();

      // Fourth call: read resource content (health check is cached from step 2)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      });

      await client.readResource("files__my_file.txt");

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining(
          "/api/v1/servers/files/resources/content?uri=file%3A%2F%2F%2FUsers%2Ftest%2Fmy_file.txt",
        ),
        expect.any(Object),
      );
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
