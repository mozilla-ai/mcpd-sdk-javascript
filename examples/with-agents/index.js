/**
 * Example of using mcpd SDK with AI agent frameworks.
 *
 * This example demonstrates:
 * - Generating agent-ready tools from MCP servers
 * - Function metadata and introspection
 * - Integration patterns for AI frameworks
 * - Error handling in agent contexts
 */

const { McpdClient, McpdError } = require('@mozilla-ai/mcpd');

async function demonstrateAgentTools() {
  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
  });

  try {
    console.log('🤖 Generating agent tools from MCP servers...\n');

    // Generate all available tools as callable functions
    const tools = await client.getAgentTools();

    console.log(`Generated ${tools.length} callable tools:`);

    // Display information about each tool
    for (const tool of tools) {
      console.log(`\n📋 ${tool.__name__}`);
      console.log(`   Server: ${tool._serverName}`);
      console.log(`   Tool: ${tool._toolName}`);
      console.log(`   Description: ${tool._schema.description || 'No description'}`);

      // Show parameters if they exist
      const inputSchema = tool._schema.inputSchema;
      if (inputSchema && inputSchema.properties) {
        const required = new Set(inputSchema.required || []);
        console.log(`   Parameters:`);

        for (const [paramName, paramInfo] of Object.entries(inputSchema.properties)) {
          const isRequired = required.has(paramName);
          const requiredMark = isRequired ? '*' : ' ';
          console.log(`     ${requiredMark} ${paramName} (${paramInfo.type}): ${paramInfo.description || 'No description'}`);
        }
      }
    }

    // Demonstrate calling a tool directly
    console.log(`\n🔧 Testing tool execution...\n`);

    // Find a time tool if available
    const timeTool = tools.find(t => t._serverName === 'time' && t._toolName === 'get_current_time');
    if (timeTool) {
      try {
        console.log('Calling time.get_current_time with timezone="UTC"...');
        const result = await timeTool({ timezone: 'UTC' });
        console.log('Result:', result);
      } catch (error) {
        console.error('Tool execution failed:', error.message);
      }
    }

    // Find a math tool if available
    const mathTool = tools.find(t => t._serverName === 'math' || t._toolName.includes('add'));
    if (mathTool) {
      try {
        console.log('\nCalling math tool with a=5, b=3...');
        const result = await mathTool({ a: 5, b: 3 });
        console.log('Result:', result);
      } catch (error) {
        console.error('Tool execution failed:', error.message);
      }
    }

  } catch (error) {
    if (error instanceof McpdError) {
      console.error('mcpd error:', error.message);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

async function demonstrateFrameworkIntegration() {
  console.log('\n\n🔗 Framework Integration Examples:\n');

  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
  });

  try {
    const tools = await client.getAgentTools();

    // Example 1: Simple tool registry
    console.log('1. Simple Tool Registry Pattern:');
    const toolRegistry = {};
    for (const tool of tools) {
      toolRegistry[tool.__name__] = tool;
    }
    console.log(`   Registered ${Object.keys(toolRegistry).length} tools in registry`);

    // Example 2: Tool categorization
    console.log('\n2. Tool Categorization:');
    const toolsByServer = {};
    for (const tool of tools) {
      if (!toolsByServer[tool._serverName]) {
        toolsByServer[tool._serverName] = [];
      }
      toolsByServer[tool._serverName].push(tool);
    }

    for (const [serverName, serverTools] of Object.entries(toolsByServer)) {
      console.log(`   ${serverName}: ${serverTools.length} tools`);
    }

    // Example 3: Tool validation wrapper
    console.log('\n3. Tool Validation Wrapper:');
    function createValidatedTool(originalTool) {
      return async (...args) => {
        try {
          console.log(`   Executing ${originalTool.__name__}...`);
          const result = await originalTool(...args);
          console.log(`   ✅ ${originalTool.__name__} succeeded`);
          return result;
        } catch (error) {
          console.log(`   ❌ ${originalTool.__name__} failed: ${error.message}`);
          throw error;
        }
      };
    }

    const validatedTools = tools.map(createValidatedTool);
    console.log(`   Created ${validatedTools.length} validated tool wrappers`);

    // Example 4: Mock framework integration
    console.log('\n4. Mock AI Framework Integration:');

    class MockAIFramework {
      constructor(tools) {
        this.tools = tools;
        this.toolMap = new Map();

        for (const tool of tools) {
          this.toolMap.set(tool.__name__, tool);
        }
      }

      async callTool(toolName, parameters) {
        const tool = this.toolMap.get(toolName);
        if (!tool) {
          throw new Error(`Tool '${toolName}' not found`);
        }

        return await tool(parameters);
      }

      listTools() {
        return Array.from(this.toolMap.keys());
      }

      getToolSchema(toolName) {
        const tool = this.toolMap.get(toolName);
        return tool ? tool._schema : null;
      }
    }

    const framework = new MockAIFramework(tools);
    console.log(`   Framework initialized with ${framework.listTools().length} tools`);
    console.log(`   Available tools: ${framework.listTools().join(', ')}`);

  } catch (error) {
    console.error('Framework integration demo failed:', error.message);
  }
}

async function demonstrateErrorHandling() {
  console.log('\n\n🚨 Error Handling Examples:\n');

  const client = new McpdClient({
    apiEndpoint: 'http://localhost:8090',
  });

  try {
    const tools = await client.getAgentTools();

    if (tools.length > 0) {
      const testTool = tools[0];

      console.log('1. Testing parameter validation:');
      try {
        // Try calling without required parameters
        await testTool({});
      } catch (error) {
        console.log(`   ✅ Caught validation error: ${error.message}`);
      }

      console.log('\n2. Testing type validation:');
      try {
        // Try calling with wrong types (if tool has parameters)
        const schema = testTool._schema.inputSchema;
        if (schema && schema.properties) {
          const firstParam = Object.keys(schema.properties)[0];
          const wrongTypeValue = schema.properties[firstParam].type === 'string' ? 123 : 'not-a-number';
          await testTool({ [firstParam]: wrongTypeValue });
        }
      } catch (error) {
        console.log(`   ✅ Caught type error: ${error.message}`);
      }
    }

    console.log('\n3. Framework-level error handling:');
    function createErrorHandlingWrapper(tool) {
      return async (...args) => {
        try {
          return await tool(...args);
        } catch (error) {
          // Log the error with context
          console.error(`Tool ${tool.__name__} failed:`, {
            server: tool._serverName,
            tool: tool._toolName,
            error: error.message,
            args: args,
          });

          // Return a standardized error response
          return {
            success: false,
            error: error.message,
            tool: tool.__name__,
          };
        }
      };
    }

    const safeTools = tools.map(createErrorHandlingWrapper);
    console.log(`   Created ${safeTools.length} error-safe tool wrappers`);

  } catch (error) {
    console.error('Error handling demo failed:', error.message);
  }
}

async function main() {
  console.log('🔧 mcpd SDK - Agent Integration Example\n');
  console.log('This example shows how to use mcpd SDK with AI agent frameworks.\n');

  try {
    await demonstrateAgentTools();
    await demonstrateFrameworkIntegration();
    await demonstrateErrorHandling();

    console.log('\n✨ Example completed successfully!');
    console.log('\nNext steps:');
    console.log('- Integrate these patterns into your AI framework');
    console.log('- Add tool result validation and caching');
    console.log('- Implement tool selection strategies');
    console.log('- Add metrics and monitoring');

  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  demonstrateAgentTools,
  demonstrateFrameworkIntegration,
  demonstrateErrorHandling,
  main
};