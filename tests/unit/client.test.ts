import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpdClient } from '../../src/client';
import {
  McpdError,
  ConnectionError,
  AuthenticationError,
} from '../../src/errors';
import { HealthStatusHelpers } from '../../src/types';

describe('McpdClient', () => {
  let client: McpdClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new McpdClient({
      apiEndpoint: 'http://localhost:8090',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with basic configuration', () => {
      const basicClient = new McpdClient({
        apiEndpoint: 'http://localhost:8090',
      });
      expect(basicClient).toBeDefined();
      expect(basicClient.servers).toBeDefined();
    });

    it('should strip trailing slash from endpoint', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ servers: [] }),
      });

      const clientWithSlash = new McpdClient({
        apiEndpoint: 'http://localhost:8090/',
      });

      clientWithSlash.getServers();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8090/api/v1/servers',
        expect.any(Object)
      );
    });

    it('should initialize with API key', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ servers: [] }),
      });

      const clientWithAuth = new McpdClient({
        apiEndpoint: 'http://localhost:8090',
        apiKey: 'test-key',
      });

      clientWithAuth.getServers();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8090/api/v1/servers',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });
  });

  describe('servers()', () => {
    it('should return list of servers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ['time', 'fetch', 'git'],
      });

      const servers = await client.getServers();

      expect(servers).toEqual(['time', 'fetch', 'git']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8090/api/v1/servers',
        expect.any(Object)
      );
    });

    it('should handle empty server list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const servers = await client.getServers();

      expect(servers).toEqual([]);
    });

    it('should throw ConnectionError when cannot connect', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.getServers()).rejects.toThrow(ConnectionError);
    });

    it('should throw AuthenticationError on 401', async () => {
      const errorModel = {
        detail: 'Authentication required',
        status: 401,
        title: 'Unauthorized',
        type: 'about:blank',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify(errorModel),
      });

      await expect(client.getServers()).rejects.toThrow(AuthenticationError);
    });
  });

  describe('tools()', () => {
    it('should return tools for all servers', async () => {
      const mockTools = {
        time: [{ name: 'get_current_time', description: 'Get current time' }],
        fetch: [{ name: 'fetch_url', description: 'Fetch URL content' }],
      };

      // First call: getServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ['time', 'fetch'],
      });

      // Second call: tools for 'time'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTools.time }),
      });

      // Third call: tools for 'fetch'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTools.fetch }),
      });

      const tools = await client.getTools();

      expect(tools).toEqual(mockTools);
    });

    it('should return tools for specific server', async () => {
      const timeTools = [
        { name: 'get_current_time', description: 'Get current time' },
      ];

      // First call for health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'time', status: 'ok', latency: '2ms', lastChecked: '2025-10-07T15:00:00Z', lastSuccessful: '2025-10-07T15:00:00Z' }),
      });

      // Second call for tools
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: timeTools }),
      });

      const tools = await client.getTools('time');

      expect(tools).toEqual(timeTools);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8090/api/v1/servers/time/tools',
        expect.any(Object)
      );
    });

    it('should throw ServerNotFoundError for non-existent server', async () => {
      // Health check returns not found
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Server not found',
      });

      await expect(client.getTools('nonexistent')).rejects.toThrow(Error);
    });
  });

  describe('serverHealth()', () => {
    it('should return health for all servers', async () => {
      const mockApiResponse = {
        $schema: 'http://localhost:8090/schemas/ServersHealthResponseBody.json',
        servers: [
          { name: 'time', status: 'ok', latency: '2ms', lastChecked: '2025-10-07T15:00:00Z', lastSuccessful: '2025-10-07T15:00:00Z' },
          { name: 'fetch', status: 'ok', latency: '1ms', lastChecked: '2025-10-07T15:00:00Z', lastSuccessful: '2025-10-07T15:00:00Z' },
        ],
      };

      const expectedHealth = {
        time: { status: 'ok', latency: '2ms', lastChecked: '2025-10-07T15:00:00Z', lastSuccessful: '2025-10-07T15:00:00Z' },
        fetch: { status: 'ok', latency: '1ms', lastChecked: '2025-10-07T15:00:00Z', lastSuccessful: '2025-10-07T15:00:00Z' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      });

      const health = await client.getServerHealth();

      expect(health).toEqual(expectedHealth);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8090/api/v1/health/servers',
        expect.any(Object)
      );
    });

    it('should return health for specific server', async () => {
      const serverHealth = {
        $schema: 'http://localhost:8090/schemas/ServerHealth.json',
        name: 'time',
        status: 'ok',
        latency: '2.262667ms',
        lastChecked: '2025-10-07T15:22:19.437833Z',
        lastSuccessful: '2025-10-07T15:22:19.437833Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverHealth,
      });

      const health = await client.getServerHealth('time');

      expect(health).toEqual(serverHealth);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8090/api/v1/health/servers/time',
        expect.any(Object)
      );
    });

    it('should cache health results', async () => {
      const serverHealth = {
        name: 'time',
        status: 'ok',
        latency: '2ms',
        lastChecked: '2025-10-07T15:00:00Z',
        lastSuccessful: '2025-10-07T15:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverHealth,
      });

      // First call
      await client.getServerHealth('time');
      // Second call (should use cache)
      await client.getServerHealth('time');

      // Should only call fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('isServerHealthy()', () => {
    it('should return true for healthy server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'time', status: 'ok', latency: '2ms', lastChecked: '2025-10-07T15:00:00Z', lastSuccessful: '2025-10-07T15:00:00Z' }),
      });

      const isHealthy = await client.isServerHealthy('time');

      expect(isHealthy).toBe(true);
    });

    it('should return false for unhealthy server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'time', status: 'unreachable', latency: '0ms', lastChecked: '2025-10-07T15:00:00Z' }),
      });

      const isHealthy = await client.isServerHealthy('time');

      expect(isHealthy).toBe(false);
    });
  });

  describe('_performCall()', () => {
    it('should execute tool successfully', async () => {
      // API returns JSON string directly (not wrapped)
      const toolResult = { time: '2024-01-15T10:30:00-05:00', timezone: 'America/New_York' };
      const mockResponse = JSON.stringify(toolResult);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client._performCall('time', 'get_current_time', {
        timezone: 'America/New_York',
      });

      expect(result).toEqual(toolResult);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8090/api/v1/servers/time/tools/get_current_time',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ timezone: 'America/New_York' }),
        })
      );
    });

    it('should throw ToolExecutionError on tool error', async () => {
      const errorModel = {
        detail: 'Tool execution failed: Invalid parameter',
        errors: [{
          location: 'body.timezone',
          message: 'Invalid parameter',
          value: null,
        }],
        status: 400,
        title: 'Bad Request',
        type: 'about:blank',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify(errorModel),
      });

      await expect(
        client._performCall('time', 'get_current_time', {})
      ).rejects.toThrow(McpdError);
    });
  });

  describe('agentTools()', () => {
    it('should generate callable functions for all tools', async () => {
      const mockAllTools = {
        time: [
          {
            name: 'get_current_time',
            description: 'Get current time',
            inputSchema: {
              type: 'object',
              properties: { timezone: { type: 'string' } },
              required: ['timezone'],
            },
          },
        ],
        math: [
          {
            name: 'add',
            description: 'Add two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
              },
              required: ['a', 'b'],
            },
          },
        ],
      };

      // First call: getServers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ['time', 'math'],
      });

      // Second call: tools for 'time'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockAllTools.time }),
      });

      // Third call: tools for 'math'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockAllTools.math }),
      });

      const tools = await client.getAgentTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('time__get_current_time');
      expect(tools[0].description).toContain('Get current time');
      expect(tools[0]._serverName).toBe('time');
      expect(tools[0]._toolName).toBe('get_current_time');

      expect(tools[1].name).toBe('math__add');
      expect(tools[1].description).toContain('Add two numbers');
      expect(tools[1]._serverName).toBe('math');
      expect(tools[1]._toolName).toBe('add');
    });

    it('should return empty array when no tools available', async () => {
      // First call: getServers() returns empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const tools = await client.getAgentTools();

      expect(tools).toHaveLength(0);
    });
  });

  describe('clearAgentToolsCache()', () => {
    it('should clear the function builder cache', () => {
      // This is more of an integration test to ensure the method exists and calls through
      expect(() => client.clearAgentToolsCache()).not.toThrow();
    });
  });
});

describe('HealthStatusHelpers', () => {
  describe('isHealthy()', () => {
    it('should return true for ok status', () => {
      expect(HealthStatusHelpers.isHealthy('ok')).toBe(true);
    });

    it('should return false for non-ok status', () => {
      expect(HealthStatusHelpers.isHealthy('timeout')).toBe(false);
      expect(HealthStatusHelpers.isHealthy('unreachable')).toBe(false);
      expect(HealthStatusHelpers.isHealthy('unknown')).toBe(false);
    });
  });

  describe('isTransient()', () => {
    it('should return true for transient statuses', () => {
      expect(HealthStatusHelpers.isTransient('timeout')).toBe(true);
      expect(HealthStatusHelpers.isTransient('unknown')).toBe(true);
    });

    it('should return false for non-transient statuses', () => {
      expect(HealthStatusHelpers.isTransient('ok')).toBe(false);
      expect(HealthStatusHelpers.isTransient('unreachable')).toBe(false);
    });
  });
});