/**
 * Basic example of using the mcpd SDK in JavaScript.
 *
 * This example demonstrates:
 * - Connecting to an mcpd daemon
 * - Listing available servers
 * - Getting tool schemas
 * - Dynamically calling tools
 * - Error handling
 */

import { McpdClient, McpdError } from '@mozilla-ai/mcpd';

async function main() {
  // Initialize the client
  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
    // apiKey: 'your-api-key', // Uncomment if authentication is required
  });

  try {
    // List all available servers
    console.log('Available servers:');
    const servers = await client.listServers();
    console.log(servers);

    // Get health status for all servers
    console.log('Server health:');
    const healthByServer = await client.getServerHealth();
    for (const [serverName, serverHealth] of Object.entries(healthByServer)) {
      console.log(`  ${serverName}: ${serverHealth.status}`);
    }

    // If we have a 'time' server, demonstrate using it
    if (servers.includes('time')) {
      // Get tools for the time server
      console.log('Time server tools:');
      const tools = await client.servers.time.listTools();
      for (const tool of tools) {
        console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
      }

      // Check if a tool exists before calling it
      const hasTool = await client.servers.time.hasTool('get_current_time');
      console.log(`Has tool 'get_current_time': ${hasTool}`);

      if (hasTool) {
        console.log('Getting current time in different timezones:');

        // Call tools using property access (recommended)
        const utcTime = await client.servers.time.tools.get_current_time({ timezone: 'UTC' });
        console.log('UTC:');
        console.log(utcTime);

        const tokyoTime = await client.servers.time.tools.get_current_time({ timezone: 'Asia/Tokyo' });
        console.log('Tokyo:');
        console.log(tokyoTime);

        // Alternative: Use callTool() for dynamic tool names
        const toolName = 'get_current_time';
        const nyTime = await client.servers.time.callTool(toolName, { timezone: 'America/New_York' });
        console.log('New York:');
        console.log(nyTime);
      }
    }

    // Demonstrate error handling
    console.log('Error handling example:');
    try {
      // Try to call a non-existent tool
      await client.servers.nonexistent_server.tools.nonexistent_tool();
    } catch (error) {
      if (error instanceof McpdError) {
        console.log(`... Caught expected error: ${error.name} - ${error.message}`);
      } else {
        throw error;
      }
    }

  } catch (error) {
    if (error instanceof McpdError) {
      console.error('mcpd error:', error.message);

      // Show specific error handling
      if (error.name === 'ConnectionError') {
        console.error('Cannot connect to mcpd daemon. Is it running?');
        console.error('Start it with: mcpd start');
      } else if (error.name === 'AuthenticationError') {
        console.error('Authentication failed. Check your API key.');
      }
    } else {
      console.error('Unexpected error:', error);
    }
    process.exit(1); 
  }
}

// Run the example
  main().catch(console.error);

export default { main };