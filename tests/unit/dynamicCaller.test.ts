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

  describe("Prompt Dynamic Calling Patterns", () => {
    describe("Pattern: client.servers.foo.getPrompts()", () => {
      it("should list prompts with static property access", async () => {
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

        // Prompts list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            prompts: [
              { name: "create_pr", description: "Create PR" },
              { name: "close_issue", description: "Close issue" },
            ],
          }),
        });

        const prompts = await client.servers.github!.getPrompts();

        expect(prompts).toHaveLength(2);
        expect(prompts[0]?.name).toBe("create_pr");
        expect(prompts[1]?.name).toBe("close_issue");
      });
    });

    describe("Pattern: client.servers.foo!.prompts.bar!(args)", () => {
      it("should generate prompt with static property access", async () => {
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

        // Prompts list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            prompts: [
              {
                name: "create_pr",
                description: "Create PR",
                arguments: [{ name: "title", required: true }],
              },
            ],
          }),
        });

        // Prompt generation (health check is cached from above).
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            description: "PR for bug fix",
            messages: [{ role: "user", content: "Create PR: Fix bug" }],
          }),
        });

        const result = await client.servers.github!.prompts.create_pr!({
          title: "Fix bug",
        });

        expect(result.description).toBe("PR for bug fix");
        expect(result.messages).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(
          "http://localhost:8090/api/v1/servers/github/prompts/create_pr",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ arguments: { title: "Fix bug" } }),
          }),
        );
      });

      it("should throw ToolNotFoundError for non-existent prompt", async () => {
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

        // Prompts list (no prompts).
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            prompts: [],
          }),
        });

        await expect(
          client.servers.github!.prompts.nonexistent_prompt!(),
        ).rejects.toThrow(ToolNotFoundError);
      });
    });

    describe("Pattern: client.servers.foo.generatePrompt(name, args)", () => {
      it("should generate prompt with dynamic prompt name", async () => {
        const promptName = "create_pr";

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

        // Prompts list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            prompts: [
              {
                name: "create_pr",
                description: "Create PR",
                arguments: [{ name: "title", required: true }],
              },
            ],
          }),
        });

        // Prompt generation (health check is cached from above).
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            description: "PR for bug fix",
            messages: [{ role: "user", content: "Create PR: Fix bug" }],
          }),
        });

        const result = await client.servers.github!.generatePrompt(promptName, {
          title: "Fix bug",
        });

        expect(result.description).toBe("PR for bug fix");
        expect(result.messages).toHaveLength(1);
      });

      it("should throw ToolNotFoundError for non-existent prompt", async () => {
        const promptName = "nonexistent_prompt";

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

        // Prompts list (no matching prompt).
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            prompts: [{ name: "create_pr", description: "Create PR" }],
          }),
        });

        await expect(
          client.servers.github!.generatePrompt(promptName),
        ).rejects.toThrow(ToolNotFoundError);
      });
    });

    describe("Pattern: client.servers.foo.hasPrompt(name)", () => {
      it("should return true when prompt exists", async () => {
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

        // Prompts list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            prompts: [{ name: "create_pr", description: "Create PR" }],
          }),
        });

        const exists = await client.servers.github!.hasPrompt("create_pr");

        expect(exists).toBe(true);
      });

      it("should return false when prompt does not exist", async () => {
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

        // Prompts list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            prompts: [{ name: "create_pr", description: "Create PR" }],
          }),
        });

        const exists =
          await client.servers.github!.hasPrompt("nonexistent_prompt");

        expect(exists).toBe(false);
      });
    });
  });

  describe("Resource Dynamic Calling Patterns", () => {
    describe("Pattern: client.servers.foo.getResources()", () => {
      it("should list resources with static property access", async () => {
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

        // Resources list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            resources: [
              {
                name: "readme",
                uri: "file:///repo/README.md",
                description: "Project readme",
                mimeType: "text/markdown",
              },
              {
                name: "changelog",
                uri: "file:///repo/CHANGELOG.md",
                mimeType: "text/markdown",
              },
            ],
          }),
        });

        const resources = await client.servers.github!.getResources();

        expect(resources).toHaveLength(2);
        expect(resources[0]?.name).toBe("readme");
        expect(resources[0]?.uri).toBe("file:///repo/README.md");
        expect(resources[1]?.name).toBe("changelog");
      });
    });

    describe("Pattern: client.servers.foo.getResourceTemplates()", () => {
      it("should list resource templates with static property access", async () => {
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

        // Resource templates list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            templates: [
              {
                name: "file",
                uriTemplate: "file:///{path}",
                description: "Access any file",
                mimeType: "text/plain",
              },
            ],
          }),
        });

        const templates = await client.servers.github!.getResourceTemplates();

        expect(templates).toHaveLength(1);
        expect(templates[0]?.name).toBe("file");
        expect(templates[0]?.uriTemplate).toBe("file:///{path}");
      });
    });

    describe("Pattern: client.servers.foo.readResource(uri)", () => {
      it("should read resource content by URI", async () => {
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

        // Resource content.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              uri: "file:///repo/README.md",
              text: "# My Project\n\nThis is a readme.",
              mimeType: "text/markdown",
            },
          ],
        });

        const contents = await client.servers.github!.readResource(
          "file:///repo/README.md",
        );

        expect(contents).toHaveLength(1);
        expect(contents[0]?.uri).toBe("file:///repo/README.md");
        expect(contents[0]?.text).toBe("# My Project\n\nThis is a readme.");
        expect(contents[0]?.mimeType).toBe("text/markdown");
        expect(mockFetch).toHaveBeenCalledWith(
          "http://localhost:8090/api/v1/servers/github/resources/content?uri=file%3A%2F%2F%2Frepo%2FREADME.md",
          expect.objectContaining({
            headers: expect.any(Object),
          }),
        );
      });

      it("should handle blob content", async () => {
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

        // Resource content with blob.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              uri: "file:///repo/logo.png",
              blob: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              mimeType: "image/png",
            },
          ],
        });

        const contents = await client.servers.github!.readResource(
          "file:///repo/logo.png",
        );

        expect(contents).toHaveLength(1);
        expect(contents[0]?.blob).toBeDefined();
        expect(contents[0]?.mimeType).toBe("image/png");
      });
    });

    describe("Pattern: client.servers.foo.hasResource(uri)", () => {
      it("should return true when resource exists", async () => {
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

        // Resources list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            resources: [
              {
                name: "readme",
                uri: "file:///repo/README.md",
                description: "Project readme",
              },
            ],
          }),
        });

        const exists = await client.servers.github!.hasResource(
          "file:///repo/README.md",
        );

        expect(exists).toBe(true);
      });

      it("should return false when resource does not exist", async () => {
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

        // Resources list.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            resources: [
              {
                name: "readme",
                uri: "file:///repo/README.md",
              },
            ],
          }),
        });

        const exists = await client.servers.github!.hasResource(
          "file:///repo/nonexistent.md",
        );

        expect(exists).toBe(false);
      });

      it("should return false on error (safe predicate)", async () => {
        // Health check returns error.
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => JSON.stringify({ detail: "Server error" }),
        });

        const exists = await client.servers.github!.hasResource(
          "file:///repo/README.md",
        );

        expect(exists).toBe(false);
      });
    });
  });
});
