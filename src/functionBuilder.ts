/**
 * Function generation from MCP tool schemas.
 *
 * This module provides the FunctionBuilder class that dynamically generates
 * callable JavaScript functions from MCP tool JSON Schema definitions. These
 * functions can be used with AI agent frameworks and include proper parameter
 * validation and comprehensive metadata.
 *
 * The generated functions are self-contained and cached for performance.
 */

import { McpdError, ValidationError } from './errors';
import type { ToolSchema } from './types';
import { TypeConverter } from './utils/typeConverter';
import type { McpdClient } from './client';

/**
 * Interface for generated agent functions with metadata.
 */
export interface AgentFunction {
  (...args: any[]): Promise<any>;
  __name__: string;
  __doc__: string;
  _schema: ToolSchema;
  _serverName: string;
  _toolName: string;
}

/**
 * Builds callable JavaScript functions from MCP tool JSON schemas.
 *
 * This class generates self-contained functions that can be used with AI agent
 * frameworks. The generated functions include parameter validation and
 * comprehensive metadata based on the tool's JSON Schema definition.
 *
 * The generated functions are cached for performance, with cache invalidation
 * controlled by the owning McpdClient via clearCache().
 */
export class FunctionBuilder {
  private client: McpdClient;
  private functionCache: Map<string, AgentFunction> = new Map();

  /**
   * Initialize a FunctionBuilder for the given client.
   *
   * @param client - The McpdClient instance that will be used to execute
   *                the generated functions via _performCall().
   */
  constructor(client: McpdClient) {
    this.client = client;
  }

  /**
   * Convert a string into a safe JavaScript identifier.
   *
   * This method sanitizes arbitrary strings (like server names or tool names) to create
   * valid JavaScript identifiers that can be used as function names.
   * It replaces non-word characters and handles edge cases like leading digits.
   *
   * @param name - The string to convert into a safe identifier
   * @returns A string that is a valid JavaScript identifier
   */
  private safeName(name: string): string {
    // Replace non-word characters and leading digits
    return name.replace(/\W|^(?=\d)/g, '_');
  }

  /**
   * Generate a unique function name from server and tool names.
   *
   * This method creates a qualified function name by combining the server name
   * and tool name with a double underscore separator. Both names are sanitized
   * using safeName() to ensure the result is a valid JavaScript identifier.
   *
   * @param serverName - The name of the MCP server hosting the tool
   * @param schemaName - The name of the tool from the schema definition
   * @returns A qualified function name in the format "{safe_server}__{safe_tool}"
   */
  private functionName(serverName: string, schemaName: string): string {
    return `${this.safeName(serverName)}__${this.safeName(schemaName)}`;
  }

  /**
   * Create a callable JavaScript function from an MCP tool's JSON Schema definition.
   *
   * This method generates a self-contained, callable function that validates parameters
   * and executes the corresponding MCP tool. The function includes proper parameter
   * validation and comprehensive metadata based on the tool's JSON Schema.
   *
   * Generated functions are cached for performance. If a function for the same
   * server/tool combination already exists in the cache, it returns the cached function.
   *
   * @param schema - The MCP tool's JSON Schema definition
   * @param serverName - The name of the MCP server hosting this tool
   * @returns A callable JavaScript function with metadata
   */
  createFunctionFromSchema(schema: ToolSchema, serverName: string): AgentFunction {
    const cacheKey = `${serverName}__${schema.name}`;

    // Return cached function if it exists
    if (this.functionCache.has(cacheKey)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.functionCache.get(cacheKey)!;
    }

    try {
      const generatedFunction = this.buildFunction(schema, serverName);
      this.functionCache.set(cacheKey, generatedFunction);
      return generatedFunction;
    } catch (error) {
      throw new McpdError(`Error creating function ${cacheKey}: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Build the actual function from the schema.
   *
   * @param schema - The tool schema
   * @param serverName - The server name
   * @returns The generated function with metadata
   */
  private buildFunction(schema: ToolSchema, serverName: string): AgentFunction {
    const inputSchema = schema.inputSchema || {};
    const properties = inputSchema.properties || {};
    const required = new Set(inputSchema.required || []);

    // Create the function implementation
    const implementation = async (...args: any[]): Promise<any> => {
      // Handle both positional and named arguments
      let params: Record<string, any> = {};

      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
        // Single object argument (named parameters)
        params = args[0];
      } else {
        // Positional arguments - map to schema properties in order
        const propertyNames = Object.keys(properties);
        for (let i = 0; i < args.length && i < propertyNames.length; i++) {
          const propertyName = propertyNames[i];
          if (propertyName) {
            params[propertyName] = args[i];
          }
        }
      }

      // Validate required parameters
      const missingParams: string[] = [];
      for (const paramName of required) {
        if (!(paramName in params) || params[paramName] === null || params[paramName] === undefined) {
          missingParams.push(paramName);
        }
      }

      if (missingParams.length > 0) {
        throw new ValidationError(
          `Missing required parameters: ${missingParams.join(', ')}`,
          missingParams
        );
      }

      // Validate parameter types
      const validationErrors: string[] = [];
      for (const [paramName, paramValue] of Object.entries(params)) {
        const paramSchema = properties[paramName];
        if (paramValue !== null && paramValue !== undefined && paramSchema) {
          if (!TypeConverter.validateValue(paramValue, paramSchema)) {
            const expectedType = TypeConverter.getTypeDescription(paramSchema);
            validationErrors.push(`Parameter '${paramName}' should be ${expectedType}, got ${typeof paramValue}`);
          }
        }
      }

      if (validationErrors.length > 0) {
        throw new ValidationError(`Parameter validation failed: ${validationErrors.join('; ')}`, validationErrors);
      }

      // Filter out null/undefined values
      const cleanParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
          cleanParams[key] = value;
        }
      }

      // Make the API call
      return this.client._performCall(serverName, schema.name, cleanParams);
    };

    // Add metadata to the function
    const qualifiedName = this.functionName(serverName, schema.name);
    const docstring = this.createDocstring(schema);

    // Cast to AgentFunction and add metadata
    const agentFunction = implementation as AgentFunction;
    agentFunction.__name__ = qualifiedName;
    agentFunction.__doc__ = docstring;
    agentFunction._schema = schema;
    agentFunction._serverName = serverName;
    agentFunction._toolName = schema.name;

    return agentFunction;
  }

  /**
   * Generate a comprehensive docstring for the dynamically created function.
   *
   * This method builds a properly formatted docstring that includes the
   * tool's description, parameter documentation with optional/required status,
   * return value information, and exception documentation.
   *
   * @param schema - The MCP tool's JSON Schema definition
   * @returns A multi-line string containing the complete docstring text
   */
  private createDocstring(schema: ToolSchema): string {
    const description = schema.description || 'No description provided';
    const inputSchema = schema.inputSchema || {};
    const properties = inputSchema.properties || {};
    const required = new Set(inputSchema.required || []);

    const docstringParts = [description];

    if (Object.keys(properties).length > 0) {
      docstringParts.push('');
      docstringParts.push('Parameters:');

      for (const [paramName, paramInfo] of Object.entries(properties)) {
        const isRequired = required.has(paramName);
        const paramDesc = paramInfo.description || 'No description provided';
        const paramType = TypeConverter.getTypeDescription(paramInfo);
        const requiredText = isRequired ? '' : ' (optional)';
        docstringParts.push(`  ${paramName} (${paramType}): ${paramDesc}${requiredText}`);
      }
    }

    docstringParts.push('');
    docstringParts.push('Returns:');
    docstringParts.push('  Promise<any>: Function execution result');
    docstringParts.push('');
    docstringParts.push('Throws:');
    docstringParts.push('  ValidationError: If required parameters are missing or invalid');
    docstringParts.push('  McpdError: If the API call fails');

    return docstringParts.join('\n');
  }

  /**
   * Clear the function cache.
   *
   * This method clears all cached generated functions, forcing them to be
   * regenerated on the next call to createFunctionFromSchema().
   */
  clearCache(): void {
    this.functionCache.clear();
  }

  /**
   * Get the current cache size.
   *
   * @returns The number of functions currently cached
   */
  getCacheSize(): number {
    return this.functionCache.size;
  }
}