import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FunctionBuilder } from '../../src/functionBuilder';
import { McpdClient } from '../../src/client';
import { ValidationError } from '../../src/errors';
import type { ToolSchema } from '../../src/types';

describe('FunctionBuilder', () => {
  let mockClient: McpdClient;
  let builder: FunctionBuilder;

  beforeEach(() => {
    mockClient = {
      _performCall: vi.fn(),
    } as any;
    builder = new FunctionBuilder(mockClient);
  });

  describe('createFunctionFromSchema', () => {
    it('should create a basic function from schema', () => {
      const schema: ToolSchema = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'A message to process',
            },
          },
          required: ['message'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'test_server');

      expect(func).toBeDefined();
      expect(func.__name__).toBe('test_server__test_tool');
      expect(func.__doc__).toContain('A test tool');
      expect(func._schema).toBe(schema);
      expect(func._serverName).toBe('test_server');
      expect(func._toolName).toBe('test_tool');
    });

    it('should create function with safe names', () => {
      const schema: ToolSchema = {
        name: 'test-tool@123',
        description: 'Test tool',
      };

      const func = builder.createFunctionFromSchema(schema, 'test-server');

      expect(func.__name__).toBe('test_server__test_tool_123');
    });

    it('should cache functions', () => {
      const schema: ToolSchema = {
        name: 'test_tool',
        description: 'Test tool',
      };

      const func1 = builder.createFunctionFromSchema(schema, 'test_server');
      const func2 = builder.createFunctionFromSchema(schema, 'test_server');

      expect(func1).toBe(func2); // Same function instance
      expect(builder.getCacheSize()).toBe(1);
    });

    it('should handle functions without input schema', () => {
      const schema: ToolSchema = {
        name: 'simple_tool',
        description: 'A simple tool with no parameters',
      };

      const func = builder.createFunctionFromSchema(schema, 'server');

      expect(func).toBeDefined();
      expect(func.__doc__).toContain('A simple tool with no parameters');
    });
  });

  describe('generated function execution', () => {
    beforeEach(() => {
      vi.mocked(mockClient._performCall).mockResolvedValue({ result: 'success' });
    });

    it('should execute function with named parameters', async () => {
      const schema: ToolSchema = {
        name: 'echo',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            count: { type: 'number' },
          },
          required: ['message'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'test');
      const result = await func({ message: 'hello', count: 3 });

      expect(result).toEqual({ result: 'success' });
      expect(mockClient._performCall).toHaveBeenCalledWith('test', 'echo', {
        message: 'hello',
        count: 3,
      });
    });

    it('should execute function with positional parameters', async () => {
      const schema: ToolSchema = {
        name: 'echo',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            count: { type: 'number' },
          },
          required: ['message'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'test');
      const result = await func('hello', 3);

      expect(result).toEqual({ result: 'success' });
      expect(mockClient._performCall).toHaveBeenCalledWith('test', 'echo', {
        message: 'hello',
        count: 3,
      });
    });

    it('should validate required parameters', async () => {
      const schema: ToolSchema = {
        name: 'echo',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'test');

      await expect(func({})).rejects.toThrow(ValidationError);
      await expect(func({ message: null })).rejects.toThrow(ValidationError);
      await expect(func({ message: undefined })).rejects.toThrow(ValidationError);
    });

    it('should validate parameter types', async () => {
      const schema: ToolSchema = {
        name: 'echo',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            count: { type: 'integer' },
          },
          required: ['message'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'test');

      // Valid call
      await func({ message: 'hello', count: 5 });

      // Invalid types
      await expect(func({ message: 123 })).rejects.toThrow(ValidationError);
      await expect(func({ message: 'hello', count: 3.14 })).rejects.toThrow(ValidationError);
    });

    it('should handle enum validation', async () => {
      const schema: ToolSchema = {
        name: 'echo',
        inputSchema: {
          type: 'object',
          properties: {
            level: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
          },
          required: ['level'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'test');

      // Valid enum value
      await func({ level: 'medium' });

      // Invalid enum value
      await expect(func({ level: 'invalid' })).rejects.toThrow(ValidationError);
    });

    it('should filter out null/undefined parameters', async () => {
      const schema: ToolSchema = {
        name: 'echo',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            optional: { type: 'string' },
          },
          required: ['message'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'test');
      await func({ message: 'hello', optional: null });

      expect(mockClient._performCall).toHaveBeenCalledWith('test', 'echo', {
        message: 'hello',
      });
    });

    it('should handle functions with no parameters', async () => {
      const schema: ToolSchema = {
        name: 'ping',
        description: 'Simple ping function',
      };

      const func = builder.createFunctionFromSchema(schema, 'test');
      await func();

      expect(mockClient._performCall).toHaveBeenCalledWith('test', 'ping', {});
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      const schema: ToolSchema = { name: 'test', description: 'test' };

      builder.createFunctionFromSchema(schema, 'server1');
      builder.createFunctionFromSchema(schema, 'server2');

      expect(builder.getCacheSize()).toBe(2);

      builder.clearCache();

      expect(builder.getCacheSize()).toBe(0);
    });

    it('should create new functions after cache clear', () => {
      const schema: ToolSchema = { name: 'test', description: 'test' };

      const func1 = builder.createFunctionFromSchema(schema, 'server');
      builder.clearCache();
      const func2 = builder.createFunctionFromSchema(schema, 'server');

      expect(func1).not.toBe(func2); // Different instances
      expect(func1.__name__).toBe(func2.__name__); // Same name
    });
  });

  describe('docstring generation', () => {
    it('should generate comprehensive docstring', () => {
      const schema: ToolSchema = {
        name: 'complex_tool',
        description: 'A complex tool with parameters',
        inputSchema: {
          type: 'object',
          properties: {
            required_param: {
              type: 'string',
              description: 'This parameter is required',
            },
            optional_param: {
              type: 'number',
              description: 'This parameter is optional',
            },
          },
          required: ['required_param'],
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'server');

      expect(func.__doc__).toContain('A complex tool with parameters');
      expect(func.__doc__).toContain('required_param (string): This parameter is required');
      expect(func.__doc__).toContain('optional_param (number): This parameter is optional (optional)');
      expect(func.__doc__).toContain('Returns:');
      expect(func.__doc__).toContain('Throws:');
      expect(func.__doc__).toContain('ValidationError');
      expect(func.__doc__).toContain('McpdError');
    });

    it('should handle missing descriptions', () => {
      const schema: ToolSchema = {
        name: 'minimal_tool',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
        },
      };

      const func = builder.createFunctionFromSchema(schema, 'server');

      expect(func.__doc__).toContain('No description provided');
      expect(func.__doc__).toContain('param (string): No description provided (optional)');
    });
  });
});