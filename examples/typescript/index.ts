/**
 * TypeScript example of using the mcpd SDK.
 *
 * This example demonstrates:
 * - Full TypeScript types and autocomplete
 * - Async/await patterns
 * - Proper error handling with types
 * - Server health checking
 */

import {
  McpdClient,
  McpdError,
  ToolSchema,
  ServerHealth,
  ToolNotFoundError,
  ConnectionError,
  AuthenticationError,
} from '@mozilla-ai/mcpd';

interface TimeResult {
  time: string;
  timezone: string;
}

async function demonstrateBasicUsage(): Promise<void> {
  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
    serverHealthCacheTtl: 15, // Cache health for 15 seconds
    timeout: 10000, // 10 second timeout
  });

  // List servers with full type safety
  const servers: string[] = await client.getServers();
  console.log('Available servers:', servers);

  // Get tools with proper typing
  const allTools: Record<string, ToolSchema[]> = await client.getTools();
  console.log('All tools:', Object.keys(allTools));

  // Check server health
  const health: Record<string, ServerHealth> = await client.getServerHealth();
  for (const [serverName, serverHealth] of Object.entries(health)) {
    const isHealthy = await client.isServerHealthy(serverName);
    console.log(`${serverName}: ${serverHealth.status} (healthy: ${isHealthy})`);
  }
}

async function demonstrateToolCalling(): Promise<void> {
  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
  });

  try {
    // Check if server and tool exist before calling
    if (await client.hasTool('time', 'get_current_time')) {
      // TypeScript knows this could be any type since tools can return anything
      const result: any = await client.call.time.get_current_time({
        timezone: 'UTC',
      });

      // In a real app, you'd validate/cast the result based on the tool's schema
      const timeResult = result as TimeResult;
      console.log('Current time:', timeResult.time);
    }

    // Demonstrate parallel tool calls
    const [utcTime, tokyoTime, londonTime] = await Promise.all([
      client.call.time.get_current_time({ timezone: 'UTC' }),
      client.call.time.get_current_time({ timezone: 'Asia/Tokyo' }),
      client.call.time.get_current_time({ timezone: 'Europe/London' }),
    ]);

    console.log('Times:', { utcTime, tokyoTime, londonTime });
  } catch (error) {
    // TypeScript error handling with specific error types
    if (error instanceof ToolNotFoundError) {
      console.error(`Tool '${error.toolName}' not found on server '${error.serverName}'`);
    } else if (error instanceof McpdError) {
      console.error('McpdError:', error.message);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

async function demonstrateErrorHandling(): Promise<void> {
  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
  });

  // Comprehensive error handling
  try {
    await client.call.nonexistent.tool({ invalid: 'params' });
  } catch (error) {
    switch (true) {
      case error instanceof ConnectionError:
        console.error('Connection failed:', error.message);
        console.error('Is mcpd running? Try: mcpd start');
        break;

      case error instanceof AuthenticationError:
        console.error('Auth failed:', error.message);
        console.error('Check your API key configuration');
        break;

      case error instanceof ToolNotFoundError: {
        console.error(`Tool not found: ${error.toolName} on ${error.serverName}`);
        // Get available tools
        if (error.serverName) {
          const tools = await client.getTools(error.serverName);
          console.error('Available tools:', tools.map((t) => t.name));
        }
        break;
      }

      case error instanceof McpdError:
        console.error('mcpd SDK error:', error.message);
        if (error.cause) {
          console.error('Caused by:', error.cause);
        }
        break;

      default:
        console.error('Unexpected error:', error);
    }
  }
}

async function main(): Promise<void> {
  console.log('🚀 TypeScript mcpd SDK Example\n');

  try {
    console.log('1. Basic Usage:');
    await demonstrateBasicUsage();
    console.log();

    console.log('2. Tool Calling:');
    await demonstrateToolCalling();
    console.log();

    console.log('3. Error Handling:');
    await demonstrateErrorHandling();
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };