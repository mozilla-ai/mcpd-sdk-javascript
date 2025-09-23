# mcpd-sdk-javascript

`mcpd-sdk-javascript` is a TypeScript/JavaScript SDK for interacting with the [mcpd](https://github.com/mozilla-ai/mcpd) application.

A daemon that exposes MCP server tools via a simple HTTP API.

This SDK provides high-level and dynamic access to those tools, making it easy to integrate with scripts, applications, or agentic frameworks.

## Features

- Discover and list available `mcpd` hosted MCP servers
- Retrieve tool definitions and schemas for one or all servers
- Dynamically invoke any tool using a clean, attribute-based syntax
- Generate self-contained, deepcopy-safe tool functions for AI agent frameworks
- Full TypeScript support with comprehensive type definitions
- Minimal dependencies (only `lru-cache` for caching)
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
  const result = await client.call.time.get_current_time({ timezone: 'UTC' });
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
  serverHealthCacheTtl: 10, // Cache health checks for 10 seconds
});

// TypeScript provides full type safety and autocomplete
const servers: string[] = await client.getServers();

// Get tools with proper typing
const tools: ToolSchema[] = await client.getTools('time');

// Dynamic tool invocation with error handling
try {
  const result = await client.call.time.get_current_time({
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
  serverHealthCacheTtl: 10,               // Optional: TTL in seconds for health cache (default: 10)
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

#### `client.call.<server>.<tool>(args)`
Dynamically invoke any tool using natural syntax.

```typescript
// Call a tool with parameters
const result = await client.call.weather.get_forecast({
  city: 'Tokyo',
  days: 3
});

// Call without parameters
const time = await client.call.time.get_current_time();
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
  const result = await client.call.time.get_current_time();
}
```

#### `client.hasTool(serverName: string, toolName: string)`
Check if a specific tool exists on a server.

```typescript
if (await client.hasTool('time', 'get_current_time')) {
  // Tool exists, safe to call
  const result = await client.call.time.get_current_time();
}
```

#### `client.getAgentTools()`
Generate callable functions for use with AI agent frameworks.

```typescript
// Get all tools as callable functions
const tools = await client.getAgentTools();

// Each function has metadata
for (const tool of tools) {
  console.log(`${tool.__name__}: ${tool.__doc__}`);
  console.log(`Server: ${tool._serverName}, Tool: ${tool._toolName}`);
}

// Call tools directly
const timeFunction = tools.find(t => t._toolName === 'get_current_time');
if (timeFunction) {
  const result = await timeFunction({ timezone: 'UTC' });
}

// Use with AI frameworks
const agent = new SomeAIFramework({
  tools: tools,
  model: 'gpt-4'
});
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
  const result = await client.call.unknown.tool();
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