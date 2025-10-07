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
const { McpdClient, McpdError } = require('@mozilla-ai/mcpd');

const client = new McpdClient({
  apiEndpoint: 'http://localhost:8090'
});

// List available servers
const servers = await client.getServers();
console.log(servers);
// Example: ['time', 'fetch', 'git']

// List tool definitions for a specific server
const tools = await client.getTools('time');
console.log(tools);

// Dynamically call a tool
try {
  const result = await client.servers.time.get_current_time({ timezone: 'UTC' });
  console.log(result);
} catch (error) {
  if (error instanceof McpdError) {
    console.error('Error:', error.message);
  }
}
```

### TypeScript

```typescript
import { McpdClient, McpdError, ToolSchema } from '@mozilla-ai/mcpd';

const client = new McpdClient({
  apiEndpoint: 'http://localhost:8090',
  apiKey: 'optional-key', // Optional API key
  healthCacheTtl: 10, // Cache health checks for 10 seconds
  serverCacheTtl: 60, // Cache server/tool metadata for 60 seconds
});

// Full type safety and autocomplete
const servers: string[] = await client.getServers();

// Get tools with proper typing
const tools: ToolSchema[] = await client.getTools('time');

// Dynamic tool invocation with error handling
try {
  const result = await client.servers.time.get_current_time({
    timezone: 'UTC'
  });
  console.log(result);
} catch (error) {
  if (error instanceof McpdError) {
    console.error('Operation failed:', error.message);
  }
}
```

## API

### Initialization

```typescript
import { McpdClient } from '@mozilla-ai/mcpd';

// Initialize the client with your mcpd API endpoint
const client = new McpdClient({
  apiEndpoint: 'http://localhost:8090', // Required
  apiKey: 'optional-key',                // Optional: API key for authentication
  healthCacheTtl: 10,                     // Optional: TTL in seconds for health cache (default: 10)
  serverCacheTtl: 60,                     // Optional: TTL in seconds for server/tools cache (default: 60)
  timeout: 30000,                         // Optional: Request timeout in ms (default: 30000)
});
```

### Core Methods

#### `client.getServers()`
Returns a list of all configured server names.

```typescript
const servers = await client.getServers();
// Returns: ['time', 'fetch', 'git']
```

#### `client.getTools(serverName?: string)`
Returns tool schemas for one or all servers.

```typescript
// Get tools for all servers
const allTools = await client.getTools();
// Returns: { time: [...], fetch: [...], git: [...] }

// Get tools for specific server
const timeTools = await client.getTools('time');
// Returns: [{ name: 'get_current_time', description: '...', inputSchema: {...} }]
```

#### `client.servers.<server>.<tool>(args)`
Dynamically invoke any tool using natural syntax. Supports both snake_case and camelCase.

```typescript
// Call a tool with parameters (snake_case)
const result = await client.servers.weather.get_forecast({
  city: 'Tokyo',
  days: 3
});

// Call with camelCase (automatically converts to snake_case)
const result2 = await client.servers.weather.getForecast({
  city: 'London',
  days: 5
});

// Call without parameters
const time = await client.servers.time.get_current_time();
// Or using camelCase
const time2 = await client.servers.time.getCurrentTime();
```

#### `client.getServer(serverName: string)`
Get a ServerProxy for programmatic access. Useful in loops or when server name is dynamic.

```typescript
// Explicit server access
const timeServer = client.getServer('time');
const result = await timeServer.get_current_time({ timezone: 'UTC' });

// Useful in loops
const servers = await client.getServers();
for (const serverName of servers) {
  const server = client.getServer(serverName);
  const tools = await client.getTools(serverName);
  console.log(`${serverName}: ${tools.length} tools`);
}
```

#### `server.hasTool(toolName: string)`
Check if a specific tool exists on a server. Supports both snake_case and camelCase.

```typescript
// Check if tool exists
if (await client.servers.time.hasTool('get_current_time')) {
  const result = await client.servers.time.get_current_time();
}

// Also works with camelCase
if (await client.servers.time.hasTool('getCurrentTime')) {
  const result = await client.servers.time.getCurrentTime();
}

// Using getServer() for programmatic access
const server = client.getServer('time');
if (await server.hasTool('get_current_time')) {
  const result = await server.get_current_time();
}
```

#### `client.getServerHealth(serverName?: string)`
Get health information for one or all servers.

```typescript
// Get health for all servers
const allHealth = await client.getServerHealth();
// Returns: { time: { status: 'ok' }, fetch: { status: 'ok' } }

// Get health for specific server
const timeHealth = await client.getServerHealth('time');
// Returns: { status: 'ok' }
```

#### `client.isServerHealthy(serverName: string)`
Check if a specific server is healthy.

```typescript
if (await client.isServerHealthy('time')) {
  // Server is healthy, safe to use
  const result = await client.servers.time.get_current_time();
}
```

#### `client.getAgentTools(format?)`
Generate callable functions that work directly with AI agent frameworks. No conversion layers needed.

```typescript
// TypeScript overloads provide proper type inference:
// getAgentTools(): Promise<AgentFunction[]>
// getAgentTools('array'): Promise<AgentFunction[]>
// getAgentTools('object'): Promise<Record<string, AgentFunction>>
// getAgentTools('map'): Promise<Map<string, AgentFunction>>

// Use with LangChain JS (expects array format)
import { ChatOpenAI } from '@langchain/openai';

const langchainTools = await client.getAgentTools('array');

// Bind tools to model
const model = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
const modelWithTools = model.bindTools(langchainTools);

// Or use with agents
import { createOpenAIToolsAgent } from 'langchain/agents';
const agent = await createOpenAIToolsAgent({
  llm,
  tools: langchainTools,
  prompt
});

// Use with Vercel AI SDK (expects object format)
import { generateText } from 'ai';

const vercelTools = await client.getAgentTools('object');
const result = await generateText({
  model: openai('gpt-4o-mini'),
  tools: vercelTools,
  prompt: 'What time is it in Tokyo?'
});

// Use with Map for efficient lookups
const toolMap = await client.getAgentTools('map');
const timeTool = toolMap.get('time__get_current_time');
if (timeTool) {
  const result = await timeTool({ timezone: 'UTC' });
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
  McpdError,           // Base error class
  ConnectionError,     // Cannot connect to mcpd daemon
  AuthenticationError, // Auth failed (invalid API key)
  ServerNotFoundError, // Server doesn't exist
  ServerUnhealthyError,// Server is unhealthy
  ToolNotFoundError,   // Tool doesn't exist
  ToolExecutionError,  // Tool execution failed
  ValidationError,     // Input validation failed
  TimeoutError        // Operation timed out
} from '@mozilla-ai/mcpd';

try {
  const result = await client.servers.unknown.tool();
} catch (error) {
  if (error instanceof ToolNotFoundError) {
    console.error(`Tool not found: ${error.toolName} on server ${error.serverName}`);
  } else if (error instanceof ConnectionError) {
    console.error('Cannot connect to mcpd daemon. Is it running?');
  } else if (error instanceof McpdError) {
    console.error('Operation failed:', error.message);
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