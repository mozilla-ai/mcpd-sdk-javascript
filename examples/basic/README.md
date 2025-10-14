# Basic mcpd SDK Example

Basic example demonstrating core features of the mcpd JavaScript/TypeScript SDK.

## Features Demonstrated

- Connecting to an mcpd daemon
- Listing available servers
- Checking server health
- Listing tools for a specific server
- Calling tools dynamically
- Error handling

## Prerequisites

- Node.js 22 LTS or higher
- mcpd daemon running locally on port 8090
- At least one MCP server configured (example uses 'time' server)

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

Or with auto-reload during development:

```bash
npm run dev
```

## What This Example Shows

The example connects to a local mcpd daemon and demonstrates:

1. **Server Discovery** - Lists all configured MCP servers
2. **Health Checking** - Checks health status of all servers
3. **Tool Discovery** - Lists available tools on the 'time' server
4. **Dynamic Tool Calls** - Calls the `get_current_time` tool with different timezones
5. **Error Handling** - Demonstrates proper error handling with typed exceptions

## Expected Output

```
Available servers:
[ 'time', 'fetch', ... ]

Server health:
  time: ok
  fetch: ok

Time server tools:
  - get_current_time: Get current time in a specific timezone

Getting current time in different timezones:
  UTC: { content: [...], isError: false }
  Tokyo: { content: [...], isError: false }
  New York: { content: [...], isError: false }
```

## Learn More

- [Main SDK Documentation](../../README.md)
- [LangChain Example](../langchain/)
- [Vercel AI Example](../vercel-ai/)
