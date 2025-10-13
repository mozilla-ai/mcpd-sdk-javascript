# mcpd-sdk-javascript

`mcpd-sdk-javascript` is a TypeScript/JavaScript SDK for interacting with the [mcpd](https://github.com/mozilla-ai/mcpd) application.

A daemon that exposes MCP server tools via a simple HTTP API.

This SDK provides high-level and dynamic access to those tools, making it easy to integrate with scripts, applications, or agentic frameworks.

## Features

- Discover and list available `mcpd` hosted MCP servers
- Retrieve tool definitions and schemas for one or all servers
- Dynamically invoke any tool using a clean, attribute-based syntax
- Unified AI framework integration - works directly with LangChain JS and Vercel AI SDK
- Generate self-contained, framework-compatible tool functions without conversion layers
- Multiple output formats (`'array'`, `'object'`, `'map'`) for different framework needs
- Full TypeScript support with comprehensive type definitions and overloads
- Minimal dependencies (`lru-cache` for caching, `zod` for schema validation)
- Works in both Node.js and browser environments

## Installation

```bash
npm install @mozilla-ai/mcpd
# or
yarn add @mozilla-ai/mcpd
# or
pnpm add @mozilla-ai/mcpd
```

## Quick Start

> **Note:** This SDK works seamlessly with both JavaScript and TypeScript. TypeScript users automatically get full type safety and autocomplete via the included `.d.ts` type definitions—no additional setup required.

### JavaScript

```javascript
const { McpdClient, McpdError } = require("@mozilla-ai/mcpd");

const client = new McpdClient({
  apiEndpoint: "http://localhost:8090",
});

// List available servers
const servers = await client.listServers();
console.log(servers);
// Example: ['time', 'fetch', 'git']

// List tool definitions for a specific server
const tools = await client.servers.time.listTools();
console.log(tools);

// Dynamically call a tool via the .tools namespace
try {
  const result = await client.servers.time.tools.get_current_time({
    timezone: "UTC",
  });
  console.log(result);
} catch (error) {
  if (error instanceof McpdError) {
    console.error("Error:", error.message);
  }
}
```

### TypeScript

```typescript
import { McpdClient, McpdError, ToolSchema } from "@mozilla-ai/mcpd";

const client = new McpdClient({
  apiEndpoint: "http://localhost:8090",
  apiKey: "optional-key", // Optional API key
  healthCacheTtl: 10, // Cache health checks for 10 seconds
  serverCacheTtl: 60, // Cache server/tool metadata for 60 seconds
});

// Full type safety and autocomplete
const servers: string[] = await client.listServers();

// Get tools with proper typing
const tools: ToolSchema[] = await client.servers.time.listTools();

// Dynamic tool invocation with error handling via .tools namespace
try {
  const result = await client.servers.time.tools.get_current_time({
    timezone: "UTC",
  });
  console.log(result);
} catch (error) {
  if (error instanceof McpdError) {
    console.error("Operation failed:", error.message);
  }
}
```

## API

### Initialization

```typescript
import { McpdClient } from "@mozilla-ai/mcpd";

// Initialize the client with your mcpd API endpoint
const client = new McpdClient({
  apiEndpoint: "http://localhost:8090", // Required
  apiKey: "optional-key", // Optional: API key for authentication
  healthCacheTtl: 10, // Optional: TTL in seconds for health cache (default: 10)
  serverCacheTtl: 60, // Optional: TTL in seconds for server/tools cache (default: 60)
  timeout: 30000, // Optional: Request timeout in ms (default: 30000)
});
```

### Core Methods

#### `client.listServers()`

Returns a list of all configured server names.

```typescript
const servers = await client.listServers();
// Returns: ['time', 'fetch', 'git']
```

#### `client.servers.<server>.listTools()`

Returns tool schemas for a specific server.

```typescript
// Get tools for a specific server
const timeTools = await client.servers.time.listTools();
// Returns: [{ name: 'get_current_time', description: '...', inputSchema: {...} }]
```

#### `client.servers.<server>.tools.<tool>(args)`

Dynamically invoke any tool using natural syntax via the `.tools` namespace. Tool names must match exactly as returned by the MCP server.

```typescript
// Call a tool with parameters using property access (recommended)
const result = await client.servers.weather.tools.get_forecast({
  city: "Tokyo",
  days: 3,
});

// Call without parameters
const time = await client.servers.time.tools.get_current_time();

// Alternative: Use callTool() for dynamic tool names
const toolName = "get_forecast";
const result2 = await client.servers.weather.tools.callTool(toolName, {
  city: "London",
  days: 5,
});
```

#### `client.servers.<server>.listTools()`

List all tools available on a specific server.

```typescript
// List tools for a server using property access
const tools = await client.servers.time.listTools();
for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}`);
}

// Useful in loops with dynamic server names
const servers = await client.listServers();
for (const serverName of servers) {
  const tools = await client.servers[serverName].listTools();
  console.log(`${serverName}: ${tools.length} tools`);
}
```

#### `client.servers.<server>.tools.hasTool(toolName: string)`

Check if a specific tool exists on a server. Tool names must match exactly as returned by the MCP server.

```typescript
// Check if tool exists before calling it
if (await client.servers.time.tools.hasTool("get_current_time")) {
  const result = await client.servers.time.tools.get_current_time({
    timezone: "UTC",
  });
}

// Using with dynamic server names
const serverName = "time";
if (await client.servers[serverName].tools.hasTool("get_current_time")) {
  const result = await client.servers[serverName].tools.get_current_time();
}
```

#### `client.getServerHealth(serverName?: string)`

Get health information for one or all servers.

```typescript
// Get health for all servers
const allHealth = await client.getServerHealth();
// Returns: { time: { status: 'ok' }, fetch: { status: 'ok' } }

// Get health for specific server
const timeHealth = await client.getServerHealth("time");
// Returns: { status: 'ok' }
```

#### `client.isServerHealthy(serverName: string)`

Check if a specific server is healthy.

```typescript
if (await client.isServerHealthy("time")) {
  // Server is healthy, safe to use
  const result = await client.servers.time.tools.get_current_time({
    timezone: "UTC",
  });
}
```

#### `client.getAgentTools(options?)`

Generate callable functions that work directly with AI agent frameworks. No conversion layers needed.

```typescript
// Options: { servers?: string[], format?: 'array' | 'object' | 'map' }
// Default format is 'array' (for LangChain)

// Use with LangChain JS (array format is default)
import { ChatOpenAI } from "@langchain/openai";

const langchainTools = await client.getAgentTools({ format: "array" });
// Or simply: const langchainTools = await client.getAgentTools();

// Bind tools to model
const model = new ChatOpenAI({ modelName: "gpt-4o-mini" });
const modelWithTools = model.bindTools(langchainTools);

// Or use with agents
import { createOpenAIToolsAgent } from "langchain/agents";
const agent = await createOpenAIToolsAgent({
  llm,
  tools: langchainTools,
  prompt,
});

// Use with Vercel AI SDK (expects object format)
import { generateText } from "ai";

const vercelTools = await client.getAgentTools({ format: "object" });
const result = await generateText({
  model: openai("gpt-4o-mini"),
  tools: vercelTools,
  prompt: "What time is it in Tokyo?",
});

// Filter to specific servers
const timeTools = await client.getAgentTools({
  servers: ["time"],
  format: "array",
});

// Use with Map for efficient lookups
const toolMap = await client.getAgentTools({ format: "map" });
const timeTool = toolMap.get("time__get_current_time");
if (timeTool) {
  const result = await timeTool({ timezone: "UTC" });
}

// Each function has metadata for both frameworks
const tools = await client.getAgentTools();
for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}`);
  console.log(`Server: ${tool._serverName}, Tool: ${tool._toolName}`);
  // LangChain properties: tool.schema, tool.invoke, tool.lc_namespace
  // Vercel AI properties: tool.inputSchema, tool.execute
}
```

#### `client.clearAgentToolsCache()`

Clear the cache of generated agent tools functions.

```typescript
// Clear cache to regenerate tools with latest schemas
client.clearAgentToolsCache();
const freshTools = await client.getAgentTools();
```

## Error Handling

The SDK provides a comprehensive error hierarchy for different failure scenarios:

```typescript
import {
  McpdError, // Base error class
  ConnectionError, // Cannot connect to mcpd daemon
  AuthenticationError, // Auth failed (invalid API key)
  ServerNotFoundError, // Server doesn't exist
  ServerUnhealthyError, // Server is unhealthy
  ToolNotFoundError, // Tool doesn't exist
  ToolExecutionError, // Tool execution failed
  ValidationError, // Input validation failed
  TimeoutError, // Operation timed out
} from "@mozilla-ai/mcpd";

try {
  const result = await client.servers.unknown.tools.tool();
} catch (error) {
  if (error instanceof ToolNotFoundError) {
    console.error(
      `Tool not found: ${error.toolName} on server ${error.serverName}`,
    );
  } else if (error instanceof ConnectionError) {
    console.error("Cannot connect to mcpd daemon. Is it running?");
  } else if (error instanceof McpdError) {
    console.error("Operation failed:", error.message);
  }
}
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/mozilla-ai/mcpd-sdk-javascript.git
cd mcpd-sdk-javascript

# Install dependencies
npm install
```

### Building

```bash
# Build the project
npm run build

# Build in watch mode
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## License

Apache-2.0

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## Related Projects

- [mcpd](https://github.com/mozilla-ai/mcpd) - The MCP daemon this SDK connects to
- [mcpd-sdk-python](https://github.com/mozilla-ai/mcpd-sdk-python) - Python version of this SDK
