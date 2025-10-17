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

  // Prompts
  SERVER_PROMPTS: (serverName: string, cursor?: string) => {
    const base = `${SERVERS_BASE}/${encodeURIComponent(serverName)}/prompts`;
    return cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
  },
  PROMPT_GET_GENERATED: (serverName: string, promptName: string) =>
    `${SERVERS_BASE}/${encodeURIComponent(serverName)}/prompts/${encodeURIComponent(promptName)}`,

  // Resources
  SERVER_RESOURCES: (serverName: string, cursor?: string) => {
    const base = `${SERVERS_BASE}/${encodeURIComponent(serverName)}/resources`;
    return cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
  },
  SERVER_RESOURCE_TEMPLATES: (serverName: string, cursor?: string) => {
    const base = `${SERVERS_BASE}/${encodeURIComponent(serverName)}/resources/templates`;
    return cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
  },
  RESOURCE_CONTENT: (serverName: string, uri: string) =>
    `${SERVERS_BASE}/${encodeURIComponent(serverName)}/resources/content?uri=${encodeURIComponent(uri)}`,

  // Health
  HEALTH_ALL: HEALTH_SERVERS_BASE,
  HEALTH_SERVER: (serverName: string) =>
    `${HEALTH_SERVERS_BASE}/${encodeURIComponent(serverName)}`,
} as const;
