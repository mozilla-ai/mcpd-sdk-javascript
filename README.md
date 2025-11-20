# mcpd-sdk-javascript

`mcpd-sdk-javascript` is a TypeScript/JavaScript SDK for interacting with the [mcpd](https://github.com/mozilla-ai/mcpd) application.

A daemon that exposes MCP server tools via a simple HTTP API.

This SDK provides high-level and dynamic access to those tools, making it easy to integrate with scripts, applications, or agentic frameworks.

## Features

- Discover and list available `mcpd` hosted MCP servers
- Retrieve tool, prompt, and resource definitions from individual servers
- Dynamically invoke any tool using a clean, attribute-based syntax
- Unified AI framework integration - works directly with LangChain JS and Vercel AI SDK via `getAgentTools()`
- Generate self-contained, framework-compatible tool functions without conversion layers
- Multiple output formats (`'array'`, `'object'`, `'map'`) for different framework needs
- Full TypeScript support with comprehensive type definitions and overloads
- Minimal dependencies (`lru-cache` for caching, `zod` for schema validation)
- Works in both Node.js and browser environments
- Clean API wrapper over mcpd HTTP endpoints - no opinionated aggregation logic

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
const tools = await client.servers.time.getTools();
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
import { McpdClient, McpdError, Tool } from "@mozilla-ai/mcpd";

const client = new McpdClient({
  apiEndpoint: "http://localhost:8090",
  apiKey: "optional-key", // Optional API key
  healthCacheTtl: 10, // Cache health checks for 10 seconds
});

// Full type safety and autocomplete
const servers: string[] = await client.listServers();

// Get tools with proper typing
const tools: Tool[] = await client.servers.time.getTools();

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
  timeout: 30000, // Optional: Request timeout in ms (default: 30000)
});
```

### Logging

The SDK includes optional logging for warnings about unhealthy or non-existent servers that are skipped during operations.

**Important:** Logging is disabled by default. Only enable logging in non-MCP-server contexts. MCP servers using stdio transport for JSON-RPC communication should never enable logging, as it will contaminate stdout/stderr and break the protocol.

#### Using Environment Variable

Set the `MCPD_LOG_LEVEL` environment variable to control logging:

```bash
# Valid levels: trace, debug, info, warn, error, off (default)
export MCPD_LOG_LEVEL=warn
```

**Available Log Levels:**

| Level   | Description                                                     |
| ------- | --------------------------------------------------------------- |
| `trace` | Verbose information (includes `debug`, `info`, `warn`, `error`) |
| `debug` | Debug information (includes `info`, `warn`, `error`)            |
| `info`  | General informational messages (includes `warn`, `error`)       |
| `warn`  | Warning messages only (includes `error`)                        |
| `error` | Error messages only                                             |
| `off`   | (...or unset) Logging disabled (default)                        |

```typescript
// Logging is automatically enabled based on MCPD_LOG_LEVEL
const client = new McpdClient({
  apiEndpoint: "http://localhost:8090",
});
```

#### Using Custom Logger

For advanced use cases, inject your own logger implementation.

**Partial Logger Support:** You can provide only the methods you want to customize. Any omitted methods will fall back to the default logger, which respects `MCPD_LOG_LEVEL`.

```typescript
import { McpdClient } from "@mozilla-ai/mcpd";

// Full custom logger
const client = new McpdClient({
  apiEndpoint: "http://localhost:8090",
  logger: {
    trace: (...args) => myLogger.trace(args),
    debug: (...args) => myLogger.debug(args),
    info: (...args) => myLogger.info(args),
    warn: (...args) => myLogger.warn(args),
    error: (...args) => myLogger.error(args),
  },
});

// Partial logger: custom warn/error, default (MCPD_LOG_LEVEL-aware) for others
const client2 = new McpdClient({
  apiEndpoint: "http://localhost:8090",
  logger: {
    warn: (msg) => console.warn(`[mcpd] ${msg}`),
    error: (msg) => console.error(`[mcpd] ${msg}`),
    // trace, debug, info use default logger (respects MCPD_LOG_LEVEL)
  },
});
```

#### Disabling Logging

To disable logging, simply ensure `MCPD_LOG_LEVEL` is unset or set to `off` (the default):

```typescript
// Logging is disabled by default (no configuration needed)
const client = new McpdClient({
  apiEndpoint: "http://localhost:8090",
});
```

If you need to disable logging even when `MCPD_LOG_LEVEL` is set (rare case), provide a custom logger with no-op implementations:

```typescript
// Override MCPD_LOG_LEVEL to force disable
const client = new McpdClient({
  apiEndpoint: "http://localhost:8090",
  logger: {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
});
```

When logging is enabled, warnings are emitted for:

- Unhealthy servers that are skipped (e.g., status `timeout`, `unreachable`)
- Non-existent servers specified in filter options

Example warning messages:

```text
Skipping unhealthy server 'time' with status 'timeout'
Skipping non-existent server 'unknown'
```

### Core Methods

#### `client.listServers()`

Returns a list of all configured server names.

```typescript
const servers = await client.listServers();
// Returns: ['time', 'fetch', 'git']
```

#### `client.servers.<server>.getTools()`

Returns tool schemas for a specific server.

```typescript
// Get tools for a specific server
const timeTools = await client.servers.time.getTools();
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
```

#### `client.servers.<server>.getTools()`

Get all tools available on a specific server.

```typescript
// List tools for a server using property access
const tools = await client.servers.time.getTools();
for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}`);
}

// Useful in loops with dynamic server names
const servers = await client.listServers();
for (const serverName of servers) {
  const tools = await client.servers[serverName].getTools();
  console.log(`${serverName}: ${tools.length} tools`);
}
```

#### `client.servers.<server>.callTool(toolName, args?)`

Call a tool by name with the given arguments. This is useful for programmatic tool invocation when the tool name is in a variable.

```typescript
// Call with dynamic tool name
const toolName = "get_current_time";
const result = await client.servers.time.callTool(toolName, {
  timezone: "UTC",
});

// Using with dynamic server name too
const serverName = "time";
const result2 = await client.servers[serverName].callTool(toolName, {
  timezone: "UTC",
});
```

#### `client.servers.<server>.hasTool(toolName)`

Check if a specific tool exists on a server. Tool names must match exactly as returned by the MCP server.

```typescript
// Check if tool exists before calling it
if (await client.servers.time.hasTool("get_current_time")) {
  const result = await client.servers.time.callTool("get_current_time", {
    timezone: "UTC",
  });
}

// Using with dynamic server names
const serverName = "time";
if (await client.servers[serverName].hasTool("get_current_time")) {
  const result = await client.servers[serverName].tools.get_current_time();
}
```

#### `client.servers.<server>.getPrompts()`

Returns prompt schemas for a specific server.

```typescript
// Get prompts for a specific server
const githubPrompts = await client.servers.github.getPrompts();
// Returns: [{ name: 'create_pr', description: '...', arguments: [...] }]
```

#### `client.servers.<server>.prompts.<prompt>(args)`

Dynamically generate any prompt using natural syntax via the `.prompts` namespace. Prompt names must match exactly as returned by the MCP server.

```typescript
// Generate a prompt with parameters using property access (recommended)
const result = await client.servers.github.prompts.create_pr({
  title: "Fix bug",
  description: "Fixed authentication issue",
});

// Generate without parameters (if prompt has no required args)
const result = await client.servers.templates.prompts.default_template();
```

#### `client.servers.<server>.generatePrompt(promptName, args?)`

Generate a prompt by name with the given arguments. This is useful for programmatic prompt generation when the prompt name is in a variable.

```typescript
// Generate with dynamic prompt name
const promptName = "create_pr";
const result = await client.servers.github.generatePrompt(promptName, {
  title: "Fix bug",
  description: "Fixed authentication issue",
});

// Using with dynamic server name too
const serverName = "github";
const result2 = await client.servers[serverName].generatePrompt(promptName, {
  title: "Fix bug",
});
```

#### `client.servers.<server>.hasPrompt(promptName)`

Check if a specific prompt exists on a server. Prompt names must match exactly as returned by the MCP server.

```typescript
// Check if prompt exists before generating it
if (await client.servers.github.hasPrompt("create_pr")) {
  const result = await client.servers.github.generatePrompt("create_pr", {
    title: "Fix bug",
  });
}

// Using with dynamic server names
const serverName = "github";
if (await client.servers[serverName].hasPrompt("create_pr")) {
  const result = await client.servers[serverName].prompts.create_pr({
    title: "Fix bug",
  });
}
```

#### `client.servers.<server>.getResources()`

Returns resource schemas for a specific server.

```typescript
// Get resources for a specific server
const githubResources = await client.servers.github.getResources();
// Returns: [{ name: 'readme', uri: 'file:///repo/README.md', ... }]
```

#### `client.servers.<server>.getResourceTemplates()`

Returns resource template schemas for a specific server.

```typescript
// Get resource templates for a specific server
const githubTemplates = await client.servers.github.getResourceTemplates();
// Returns: [{ name: 'file', uriTemplate: 'file:///{path}', ... }]
```

#### `client.servers.<server>.readResource(uri)`

Read resource content by URI from a specific server.

```typescript
// Read resource content by URI
const contents = await client.servers.github.readResource(
  "file:///repo/README.md",
);
for (const content of contents) {
  if (content.text) {
    console.log(content.text);
  } else if (content.blob) {
    console.log("Binary content (base64):", content.blob);
  }
}
```

#### `client.servers.<server>.hasResource(uri)`

Check if a specific resource exists on a server. Resource URIs must match exactly as returned by the MCP server.

```typescript
// Check if resource exists before reading it
if (await client.servers.github.hasResource("file:///repo/README.md")) {
  const contents = await client.servers.github.readResource(
    "file:///repo/README.md",
  );
}

// Using with dynamic server names
const serverName = "github";
if (await client.servers[serverName].hasResource("file:///repo/README.md")) {
  const contents = await client.servers[serverName].readResource(
    "file:///repo/README.md",
  );
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

Generate (cached) callable functions that work directly with AI agent frameworks. No conversion layers needed.

> [!IMPORTANT]  
> If you want to get agent tools mutiple times using different filter options, you need to call `client.clearAgentToolsCache()` to force regeneration.

##### Supports filtering by servers and by tools

AI agents perform better with focused tool sets they need to complete the given task.
Tool filtering enables progressive disclosure - operators can expose a subset of server tools via `mcpd` configuration,
then agents can further narrow down to only the tools needed for their specific task.
This prevents overwhelming the model's context window and improves response quality.

##### Examples

```typescript
// Options: { servers?: string[], tools?: string[], format?: 'array' | 'object' | 'map' }
// Default format is 'array' (for LangChain)
```

LangChain

```typescript
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
```

Vercel-AI

```typescript
// Use with Vercel AI SDK (expects object format)
import { generateText } from "ai";

const vercelTools = await client.getAgentTools({ format: "object" });
const result = await generateText({
  model: openai("gpt-4o-mini"),
  tools: vercelTools,
  prompt: "What time is it in Tokyo?",
});
```

Filtering examples

```typescript
// Filter to specific servers
const timeTools = await client.getAgentTools({
  servers: ["time"],
  format: "array",
});
```

```typescript
// Filter by tool names (cross-cutting across all servers)
const mathTools = await client.getAgentTools({
  tools: ["add", "multiply"],
});
```

```typescript
// Filter by qualified tool names (server-specific)
const specificTools = await client.getAgentTools({
  tools: ["time__get_current_time", "math__add"],
});
```

```typescript
// Combine server and tool filtering
const filteredTools = await client.getAgentTools({
  servers: ["time", "math"],
  tools: ["add", "get_current_time"],
});
```

```typescript
// Tool filtering works with different formats
const toolsObject = await client.getAgentTools({
  tools: ["add", "multiply"],
  format: "object",
});

// Clear cached generated functions before recreating
client.clearAgentToolsCache();

// Use with Map for efficient lookups
const toolMap = await client.getAgentTools({ format: "map" });
const timeTool = toolMap.get("time__get_current_time");
if (timeTool) {
  const result = await timeTool({ timezone: "UTC" });
}

// Clear cached generated functions before recreating
client.clearAgentToolsCache();

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
// Clear cache to regenerate tools with latest schemas, or latest client side server/tool filters.
client.clearAgentToolsCache();
const freshTools = await client.getAgentTools();
```

#### `client.clearServerHealthCache()`

Clear the server health cache, forcing fresh health checks on next call.

```typescript
// Force fresh health check
client.clearServerHealthCache();
const health = await client.getServerHealth("time");
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
# Run all checks (format, lint, typecheck, test, build)
npm run check

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
