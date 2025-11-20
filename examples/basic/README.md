# Basic mcpd SDK Example

Basic example demonstrating core features of the mcpd JavaScript/TypeScript SDK.

## Features Demonstrated

- Connecting to an mcpd daemon
- Listing available servers
- Checking server health
- Listing tools for a specific server
- Calling tools dynamically
- Error handling

## Requirements

- [Node.js](https://nodejs.org/) (version 22.10 LTS or higher)
- [mcpd](https://mozilla-ai.github.io/mcpd/installation/) - install via: `brew install mcpd`

## Installing mcpd

The easiest way to install mcpd is via Homebrew:

```bash
brew tap mozilla-ai/tap
brew install mcpd
```

For other installation methods, see the [mcpd installation guide](https://mozilla-ai.github.io/mcpd/installation/).

## Starting mcpd

### Execution context config file

`~/.config/mcpd/secrets.dev.toml` is the file that is used to provide user specific configuration to MCP servers via `mcpd`.

Here is an example of some custom configuration for the `mcp-server-time` (time) server:

```toml
[servers]
  [servers.time]
    args = ["--local-timezone=Europe/London"]
```

Run the following command to create this file if you don't want the time MCP Server to use defaults:

```bash
mcpd config args set time -- --local-timezone=Europe/London
```

### Project configuration file

The `.mcpd.toml` file in this folder is used to start specific versions of MCP servers:

```bash
mcpd daemon --log-level=DEBUG --log-path=$(pwd)/mcpd.log
```

The `mcpd` daemon will start the servers, emitting messages to the terminal. You can tail the log to see more info:

```bash
tail -f mcpd.log
```

## Running the Example

### 1. Install dependencies

```bash
npm install
```

### 2. Run the example

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
