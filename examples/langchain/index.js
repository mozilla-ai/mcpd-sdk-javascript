/**
 * Example demonstrating mcpd SDK integration with LangChain.
 *
 * This example shows how to:
 * - Connect to mcpd daemon
 * - Get tools from MCP servers
 * - Convert mcpd tools to LangChain tools
 * - Use LangChain ChatOpenAI with bound tools
 * - Execute an agent query using available tools
 */

import { ChatOpenAI } from '@langchain/openai';
import { McpdClient, McpdError } from '@mozilla-ai/mcpd';


/**
 * Main function demonstrating the integration.
 */
async function main() {
  // Configuration
  const mcpdEndpoint = process.env.MCPD_ADDR || 'http://localhost:8090';
  const mcpdApiKey = process.env.MCPD_API_KEY; // NOTE: Not used at present
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    console.error('[ERROR] OPENAI_API_KEY environment variable is required');
    console.error('Please export your OpenAI API key before running this example');
    process.exit(1);
  }

  try {
    // Initialize mcpd client
    console.log('🔗 Connecting to mcpd daemon...');
    const mcpdClient = new McpdClient({
      apiEndpoint: mcpdEndpoint,
      apiKey: mcpdApiKey,
    });

    // Get agent tools from mcpd in LangChain format (array format is default)
    console.log('🛠️  Fetching tools from MCP servers...');
    const tools = await mcpdClient.getAgentTools({ format: 'array' });
    console.log(`Found ${tools.length} tools from MCP servers`);

    if (tools.length === 0) {
      console.log('[WARNING] No tools found. Make sure mcpd daemon is running with MCP servers.');
      console.log('Start mcpd with: mcpd daemon --log-level=DEBUG');
      return;
    }

    // List available tools
    console.log('Available tools:');
    for (const tool of tools) {
      // Clean up description - take only the first line and remove extra whitespace
      const cleanDescription = tool.description
        .split('\n')[0]  // Take only first line (actual newline)
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .trim();
      console.log(`  - ${tool.name}: ${cleanDescription}`);
    }

    // Initialize LangChain model with tools
    console.log('🤖 Initializing LangChain model with tools...');
    const model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0,
      openAIApiKey: openaiApiKey,
    });

    const modelWithTools = model.bindTools(tools);

    // Use the model to answer a question using tools
    console.log('--- Using LangChain with MCP tools (Example query) ---');
    const query = 'What time is it in Tokyo?';
    console.log(`Query: ${query}`);

    console.log('🔍 Sending query to model...');
    const response = await modelWithTools.invoke([
      {
        role: 'user',
        content: query,
      },
    ]);

    console.log('📋 Model response:');
    console.log(`Content: ${response.content}`);

    // Check if the model wants to call tools
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log('🔧 Model requested tool calls:');
      for (const toolCall of response.tool_calls) {
        console.log(`  Tool: ${toolCall.name}`);
        console.log(`  Args: ${JSON.stringify(toolCall.args)}`);

        // Execute the tool call
        const tool = tools.find(t => t.name === toolCall.name);
        if (tool) {
          try {
            const toolResult = await tool.invoke(toolCall.args);
            console.log(`  Result: ${JSON.stringify(toolResult)}`);
          } catch (error) {
            console.log(`  Error: ${error.message}`);
          }
        }
      }
    }

    console.log('✅ Example completed successfully!');

  } catch (error) {
    if (error instanceof McpdError) {
      console.error('------------------------------');
      console.error(`[MCPD ERROR] ${error.message}`);
      console.error('------------------------------');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('------------------------------');
      console.error(`[CONNECTION ERROR] Could not connect to mcpd daemon at ${mcpdEndpoint}`);
      console.error('Please ensure the mcpd application is running with the "daemon" command.');
      console.error('------------------------------');
    } else {
      console.error('[UNEXPECTED ERROR]', error);
    }
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);