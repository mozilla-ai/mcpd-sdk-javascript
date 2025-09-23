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

const { McpdClient, McpdError } = require('@mozilla-ai/mcpd');

async function main() {
  // Initialize the client
  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
    // apiKey: 'your-api-key', // Uncomment if authentication is required
  });

  try {
    // List all available servers
    console.log('Available servers:');
    const servers = await client.getServers();
    console.log(servers);
    console.log();

    // Get health status for all servers
    console.log('Server health:');
    const health = await client.getServerHealth();
    for (const [serverName, serverHealth] of Object.entries(health)) {
      console.log(`  ${serverName}: ${serverHealth.status}`);
    }
    console.log();

    // If we have a 'time' server, demonstrate using it
    if (servers.includes('time')) {
      // Get tools for the time server
      console.log('Time server tools:');
      const tools = await client.getTools('time');
      for (const tool of tools) {
        console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
      }
      console.log();

      // Check if get_current_time tool exists
      if (await client.hasTool('time', 'get_current_time')) {
        // Call the tool
        console.log('Getting current time in different timezones:');

        const utcTime = await client.call.time.get_current_time({ timezone: 'UTC' });
        console.log('  UTC:', utcTime);

        const tokyoTime = await client.call.time.get_current_time({ timezone: 'Asia/Tokyo' });
        console.log('  Tokyo:', tokyoTime);

        const nyTime = await client.call.time.get_current_time({ timezone: 'America/New_York' });
        console.log('  New York:', nyTime);
      }
    }

    // Demonstrate error handling
    console.log('\nError handling example:');
    try {
      // Try to call a non-existent tool
      await client.call.nonexistent_server.nonexistent_tool();
    } catch (error) {
      if (error instanceof McpdError) {
        console.log(`  Caught expected error: ${error.name} - ${error.message}`);
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
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };