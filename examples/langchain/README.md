# Example App - `mcpd` JavaScript SDK with LangChain

This sample application demonstrates how to run `mcpd` in daemon mode to start MCP servers and then use LangChain with the mcpd SDK to call tools on those MCP servers through an AI agent.

## Requirements

- [Node.js](https://nodejs.org/) (version 22 LTS or higher)
- [mcpd](https://mozilla-ai.github.io/mcpd/installation/) - install via Homebrew
- `OPENAI_API_KEY` exported - this will be used by LangChain's ChatOpenAI

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

## Running our LangChain app

To run our application which will showcase how to integrate mcpd tools with LangChain:

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

### 2. Direct LangChain Compatibility

- mcpd agent tools work directly with LangChain (no conversion needed)
- Built-in Zod schemas for parameter validation
- Compatible `invoke()` methods and metadata

### 3. AI Agent Execution

- Binds tools to ChatOpenAI model using `.bindTools()`
- Sends a natural language query: "What time is it in Tokyo?"
- Demonstrates how the model decides to call appropriate tools
- Executes tool calls and shows results

### 4. Error Handling

- Handles connection errors to mcpd daemon
- Manages tool execution failures
- Provides helpful error messages and setup guidance

## Key Code Structure

```javascript
// 1. Connect to mcpd
const mcpdClient = new McpdClient({ apiEndpoint: "http://localhost:8090" });

// 2. Get agent tools in array format (LangChain-compatible!)
const tools = await mcpdClient.getAgentTools({ format: "array" });

// 3. Create model with tools
const model = new ChatOpenAI({ modelName: "gpt-4o-mini" });
const modelWithTools = model.bindTools(tools);

// 5. Ask question and execute tools
const response = await modelWithTools.invoke([
  {
    role: "user",
    content: "What time is it in Tokyo?",
  },
]);
```

## Comparison with Python AnyAgent Example

This JavaScript/LangChain example provides equivalent functionality to the Python AnyAgent example:

| Python (AnyAgent)           | JavaScript (LangChain)        |
| --------------------------- | ----------------------------- |
| `any_agent.AgentConfig`     | `ChatOpenAI.bindTools()`      |
| `mcpd_client.agent_tools()` | `mcpd_client.getAgentTools()` |
| `AnyAgent.create().run()`   | `modelWithTools.invoke()`     |
| `gpt-4.1-nano`              | `gpt-4o-mini`                 |

## Next Steps

- Experiment with different LangChain models and configurations
- Add conversation memory and multi-turn interactions
- Integrate with LangChain agents for more complex workflows
- Add custom tool validation and result processing
- Explore LangChain's streaming capabilities for real-time responses
