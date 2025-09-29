/**
 * Example demonstrating mcpd SDK integration with Vercel AI SDK.
 *
 * This example shows how to:
 * - Connect to mcpd daemon
 * - Get tools from MCP servers
 * - Use Vercel AI SDK's generateText with mcpd tools
 * - Execute an AI query using available tools
 */

import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
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

    // Get agent tools from mcpd in Vercel AI SDK format (object format)
    console.log('🛠️  Fetching tools from MCP servers...');
    const tools = await mcpdClient.getAgentTools('object');
    console.log(`Found ${Object.keys(tools).length} tools from MCP servers`);

    if (Object.keys(tools).length === 0) {
      console.log('[WARNING] No tools found. Make sure mcpd daemon is running with MCP servers.');
      console.log('Start mcpd with: mcpd daemon --log-level=DEBUG');
      return;
    }

    // List available tools
    console.log('Available tools:');
    for (const toolName of Object.keys(tools)) {
      // Clean up description - take only the first line and remove extra whitespace
      const cleanDescription = tools[toolName].description
        .split('\n')[0]  // Take only first line (actual newline)
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .trim();
      console.log(`  - ${toolName}: ${cleanDescription}`);
    }

    // Use Vercel AI SDK to answer a question using tools
    console.log('--- Using Vercel AI SDK with MCP tools (Example query) ---');
    const query = 'What time is it in Tokyo?';
    console.log(`Query: ${query}`);

    console.log('🔍 Generating text with tools...');
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: query,
      tools: tools,
      maxToolRoundtrips: 5,
    });

    console.log('📋 AI Response:');
    console.log(`Text: ${result.text || 'No text response generated'}`);

    // Check tool calls
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('🔧 Tool calls requested:');
      for (const { toolName, input } of result.toolCalls) {
        console.log(`  Tool: ${toolName}`);
        console.log(`  Input: ${JSON.stringify(input)}`);
      }
    }

    // Check tool results
    if (result.toolResults && result.toolResults.length > 0) {
      console.log('📊 Tool results:');
      for (const toolResult of result.toolResults) {
        console.log(`  Tool: ${toolResult.toolName}`);
        console.log(`  Input: ${JSON.stringify(toolResult.input)}`);
        console.log(`  Output: ${JSON.stringify(toolResult.output)}`);
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