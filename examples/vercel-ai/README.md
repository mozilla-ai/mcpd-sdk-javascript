# Example App - `mcpd` JavaScript SDK with Vercel AI SDK

This sample application demonstrates how to run `mcpd` in daemon mode to start MCP servers and then use Vercel AI SDK with the mcpd SDK to call tools on those MCP servers through an AI agent.

## Requirements

- [Node.js](https://nodejs.org/) (version 18 or higher)
- [mcpd](https://mozilla-ai.github.io/mcpd/installation/) - install via: `brew install --cask mozilla-ai/tap/mcpd`
- `OPENAI_API_KEY` exported - this will be used by Vercel AI SDK

## Installing mcpd

The easiest way to install mcpd is via Homebrew:

```bash
brew tap mozilla-ai/tap
brew install mcpd
```

For other installation methods, see the [mcpd installation guide](https://mozilla-ai.github.io/mcpd/installation/).

## Starting `mcpd`

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

The `.mcpd.toml` in this folder, is used alongside the following command to start specific versions of MCP servers:

```bash
mcpd daemon --log-level=DEBUG --log-path=$(pwd)/mcpd.log
```

We do this outside of code, and use the HTTP address given to us by `mcpd` to configure the SDK.

The `mcpd` daemon will start the servers, emitting messages to the terminal, but you can tail the log to see more info:

```bash
tail -f mcpd.log
```

## Running our Vercel AI SDK app

To run our application which will showcase how to integrate mcpd tools with Vercel AI SDK:

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

```bash
export OPENAI_API_KEY="your-openai-api-key-here"
# Optionally set mcpd endpoint if not using default
export MCPD_ADDR="http://localhost:8090"
```

### 3. Run the example

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

## What This Example Demonstrates

### 1. `mcpd` Integration

- Connects to the mcpd daemon
- Fetches available tools from MCP servers
- Gets agent-ready functions using `client.getAgentTools()`

### 2. Direct Vercel AI SDK Compatibility

- mcpd agent tools work directly with Vercel AI SDK (no conversion needed)
- Built-in Zod schemas for parameter validation
- Compatible `execute` methods and input schemas

### 3. AI Text Generation with Tools

- Uses Vercel AI SDK's `generateText` with bound tools
- Sends a natural language query: "What time is it in Tokyo?"
- Demonstrates automatic tool selection and execution
- Shows tool call results and final AI response

### 4. Error Handling

- Handles connection errors to mcpd daemon
- Manages tool execution failures
- Provides helpful error messages and setup guidance

## Key Code Structure

```javascript
// 1. Connect to mcpd
const mcpdClient = new McpdClient({ apiEndpoint: "http://localhost:8090" });

// 2. Get agent tools in object format (Vercel AI SDK-compatible!)
const tools = await mcpdClient.getAgentTools({ format: "object" });

// 3. Generate text with tools
const result = await generateText({
  model: openai("gpt-4o-mini"),
  prompt: "What time is it in Tokyo?",
  tools: tools,
  maxToolRoundtrips: 5,
});
```

## Comparison with LangChain Example

This Vercel AI SDK example provides equivalent functionality to the LangChain example:

| LangChain                      | Vercel AI SDK             |
| ------------------------------ | ------------------------- |
| `ChatOpenAI.bindTools()`       | `generateText({ tools })` |
| `modelWithTools.invoke()`      | `generateText()`          |
| Tool calling via `.tool_calls` | Automatic tool execution  |

## Framework Compatibility

The mcpd SDK's `getAgentTools(options)` method returns tools in different formats for different frameworks:

- `getAgentTools({ format: 'array' })` (default) - LangChain JS compatibility with `.bindTools()`
- `getAgentTools({ format: 'object' })` - Vercel AI SDK compatibility with `generateText({ tools })`
- `getAgentTools({ format: 'map' })` - Map format for efficient tool lookups
- Custom frameworks: Standard JavaScript functions with comprehensive metadata

## Next Steps

- Experiment with different Vercel AI SDK models and configurations
- Add streaming capabilities for real-time responses
- Integrate with Vercel AI SDK's conversation memory features
- Explore multi-modal capabilities
- Build web applications using the tools
