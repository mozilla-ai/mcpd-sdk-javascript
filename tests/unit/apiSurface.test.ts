import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpdClient } from "../../src/client";

/**
 * Comprehensive API Surface Tests.
 *
 * These tests validate ONLY the documented public API patterns.
 * Each test explicitly covers one specific way to access the SDK.
 * This prevents regressions and ensures the API surface stays stable.
 */
describe("API Surface - Complete Test Coverage", () => {
  let client: McpdClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    client = new McpdClient({ apiEndpoint: "http://localhost:8090" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("client.listServers()", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ["time", "fetch"],
    });

    const servers = await client.listServers();
    expect(servers).toEqual(["time", "fetch"]);
  });

  it("client.getServerHealth() - all servers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [{ name: "time", status: "ok", latency: "2ms" }],
      }),
    });

    const health = await client.getServerHealth();
    expect(health.time).toBeDefined();
  });

  it("client.getServerHealth(name) - specific server", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "time",
        status: "ok",
        latency: "2ms",
      }),
    });

    const health = await client.getServerHealth("time");
    expect(health.status).toBe("ok");
  });

  it("client.isServerHealthy(name)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "time",
        status: "ok",
        latency: "2ms",
      }),
    });

    const isHealthy = await client.isServerHealthy("time");
    expect(isHealthy).toBe(true);
  });

  it("client.servers.foo.listTools()", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "tool1" }] }),
    });

    const tools = await client.servers.time!.listTools();
    expect(tools).toHaveLength(1);
  });

  it('client.servers["foo"].listTools()', async () => {
    const serverName = "time";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "tool1" }] }),
    });

    const tools = await client.servers[serverName]!.listTools();
    expect(tools).toHaveLength(1);
  });

  it("client.servers.foo.callTool(name, args)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "12:00" }),
    });

    const result = await client.servers.time!.callTool("get_time", {});
    expect(result).toEqual({ result: "12:00" });
  });

  it('client.servers["foo"].callTool(name, args)', async () => {
    const serverName = "time";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "12:00" }),
    });

    const result = await client.servers[serverName]!.callTool("get_time", {});
    expect(result).toEqual({ result: "12:00" });
  });

  it("client.servers.foo.hasTool(name)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });

    const exists = await client.servers.time!.hasTool("get_time");
    expect(exists).toBe(true);
  });

  it('client.servers["foo"].hasTool(name)', async () => {
    const serverName = "time";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });

    const exists = await client.servers[serverName]!.hasTool("get_time");
    expect(exists).toBe(true);
  });

  it("client.servers.foo.tools.bar(args)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "12:00" }),
    });

    const result = await client.servers.time!.tools.get_time!({});
    expect(result).toEqual({ result: "12:00" });
  });

  it('client.servers.foo.tools["bar"](args)', async () => {
    const toolName = "get_time";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "12:00" }),
    });

    const result = await client.servers.time!.tools[toolName]!({});
    expect(result).toEqual({ result: "12:00" });
  });

  it('client.servers["foo"].tools["bar"](args)', async () => {
    const serverName = "time";
    const toolName = "get_time";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "12:00" }),
    });

    const result = await client.servers[serverName]!.tools[toolName]!({});
    expect(result).toEqual({ result: "12:00" });
  });

  it('client.servers["foo"].tools.bar(args)', async () => {
    const serverName = "time";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [{ name: "get_time" }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "12:00" }),
    });

    const result = await client.servers[serverName]!.tools.get_time!({});
    expect(result).toEqual({ result: "12:00" });
  });

  it("client.getToolSchemas() - no options", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ["time"],
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [{ name: "time", status: "ok" }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tools: [{ name: "get_time", inputSchema: { type: "object" } }],
      }),
    });

    const schemas = await client.getToolSchemas();
    expect(schemas[0]?.name).toBe("time__get_time");
  });

  it("client.getToolSchemas(options) - with servers filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [{ name: "time", status: "ok" }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tools: [{ name: "get_time", inputSchema: { type: "object" } }],
      }),
    });

    const schemas = await client.getToolSchemas({ servers: ["time"] });
    expect(schemas[0]?.name).toBe("time__get_time");
  });

  it("client.getAgentTools()", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ["time"],
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [{ name: "time", status: "ok" }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tools: [
          {
            name: "get_time",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      }),
    });

    const tools = await client.getAgentTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools[0]?.name).toBe("time__get_time");
  });

  it("client.clearAgentToolsCache()", () => {
    expect(() => client.clearAgentToolsCache()).not.toThrow();
  });

  it("client.clearServerHealthCache()", () => {
    expect(() => client.clearServerHealthCache()).not.toThrow();
  });
});
