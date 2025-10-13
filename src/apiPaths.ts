/**
 * Centralized API path constants for mcpd daemon endpoints.
 */

const API_BASE = "/api/v1";

const SERVERS_BASE = `${API_BASE}/servers`;
const HEALTH_SERVERS_BASE = `${API_BASE}/health/servers`;

export const API_PATHS = {
  // Server management
  SERVERS: SERVERS_BASE,

  // Tools
  SERVER_TOOLS: (serverName: string) =>
    `${SERVERS_BASE}/${encodeURIComponent(serverName)}/tools`,
  TOOL_CALL: (serverName: string, toolName: string) =>
    `${SERVERS_BASE}/${encodeURIComponent(serverName)}/tools/${encodeURIComponent(toolName)}`,

  // Health
  HEALTH_ALL: HEALTH_SERVERS_BASE,
  HEALTH_SERVER: (serverName: string) =>
    `${HEALTH_SERVERS_BASE}/${encodeURIComponent(serverName)}`,
} as const;
