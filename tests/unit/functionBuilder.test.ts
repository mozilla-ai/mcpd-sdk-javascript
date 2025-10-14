import { describe, it, expect, beforeEach, vi } from "vitest";
import { FunctionBuilder } from "../../src/functionBuilder";
import { ValidationError } from "../../src/errors";
import type { Tool, PerformCallFn } from "../../src/types";

describe("FunctionBuilder", () => {
  let mockPerformCall: PerformCallFn;
  let builder: FunctionBuilder;

  beforeEach(() => {
    mockPerformCall = vi.fn();
    builder = new FunctionBuilder(mockPerformCall);
  });

  describe("createFunctionFromSchema", () => {
    it("should create a basic function from schema", () => {
      const schema: Tool = {
        name: "test_tool",
        description: "A test tool",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "A message to process",
            },
          },
          required: ["message"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "test_server");

      expect(func).toBeDefined();
      expect(func.name).toBe("test_server__test_tool");
      expect(func.description).toContain("A test tool");
      expect(func._schema).toBe(schema);
      expect(func._serverName).toBe("test_server");
      expect(func._toolName).toBe("test_tool");
    });

    it("should create function with safe names", () => {
      const schema: Tool = {
        name: "test-tool@123",
        description: "Test tool",
        inputSchema: { type: "object" },
      };

      const func = builder.createFunctionFromSchema(schema, "test-server");

      expect(func.name).toBe("test_server__test_tool_123");
    });

    it("should cache functions", () => {
      const schema: Tool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: { type: "object" },
      };

      const func1 = builder.createFunctionFromSchema(schema, "test_server");
      const func2 = builder.createFunctionFromSchema(schema, "test_server");

      expect(func1).toBe(func2); // Same function instance
      expect(builder.getCacheSize()).toBe(1);
    });

    it("should handle functions without input schema", () => {
      const schema: Tool = {
        name: "simple_tool",
        description: "A simple tool with no parameters",
        inputSchema: { type: "object" },
      };

      const func = builder.createFunctionFromSchema(schema, "server");

      expect(func).toBeDefined();
      expect(func.description).toContain("A simple tool with no parameters");
    });
  });

  describe("generated function execution", () => {
    beforeEach(() => {
      vi.mocked(mockPerformCall).mockResolvedValue({ result: "success" });
    });

    it("should execute function with named parameters", async () => {
      const schema: Tool = {
        name: "echo",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
            count: { type: "number" },
          },
          required: ["message"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "test");
      const result = await func({ message: "hello", count: 3 });

      expect(result).toEqual({ result: "success" });
      expect(mockPerformCall).toHaveBeenCalledWith("test", "echo", {
        message: "hello",
        count: 3,
      });
    });

    it("should execute function with positional parameters", async () => {
      const schema: Tool = {
        name: "echo",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
            count: { type: "number" },
          },
          required: ["message"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "test");
      const result = await func("hello", 3);

      expect(result).toEqual({ result: "success" });
      expect(mockPerformCall).toHaveBeenCalledWith("test", "echo", {
        message: "hello",
        count: 3,
      });
    });

    it("should validate required parameters", async () => {
      const schema: Tool = {
        name: "echo",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
          required: ["message"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "test");

      await expect(func({})).rejects.toThrow(ValidationError);
      await expect(func({ message: null })).rejects.toThrow(ValidationError);
      await expect(func({ message: undefined })).rejects.toThrow(
        ValidationError,
      );
    });

    it("should validate parameter types", async () => {
      const schema: Tool = {
        name: "echo",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
            count: { type: "integer" },
          },
          required: ["message"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "test");

      // Valid call
      await func({ message: "hello", count: 5 });

      // Invalid types
      await expect(func({ message: 123 })).rejects.toThrow(ValidationError);
      await expect(func({ message: "hello", count: 3.14 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("should handle enum validation", async () => {
      const schema: Tool = {
        name: "echo",
        inputSchema: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
          },
          required: ["level"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "test");

      // Valid enum value
      await func({ level: "medium" });

      // Invalid enum value
      await expect(func({ level: "invalid" })).rejects.toThrow(ValidationError);
    });

    it("should filter out null/undefined parameters", async () => {
      const schema: Tool = {
        name: "echo",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
            optional: { type: "string" },
          },
          required: ["message"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "test");
      await func({ message: "hello", optional: null });

      expect(mockPerformCall).toHaveBeenCalledWith("test", "echo", {
        message: "hello",
      });
    });

    it("should handle functions with no parameters", async () => {
      const schema: Tool = {
        name: "ping",
        description: "Simple ping function",
        inputSchema: { type: "object" },
      };

      const func = builder.createFunctionFromSchema(schema, "test");
      await func();

      expect(mockPerformCall).toHaveBeenCalledWith("test", "ping", {});
    });
  });

  describe("cache management", () => {
    it("should clear cache", () => {
      const schema: Tool = {
        name: "test",
        description: "test",
        inputSchema: { type: "object" },
      };

      builder.createFunctionFromSchema(schema, "server1");
      builder.createFunctionFromSchema(schema, "server2");

      expect(builder.getCacheSize()).toBe(2);

      builder.clearCache();

      expect(builder.getCacheSize()).toBe(0);
    });

    it("should create new functions after cache clear", () => {
      const schema: Tool = {
        name: "test",
        description: "test",
        inputSchema: { type: "object" },
      };

      const func1 = builder.createFunctionFromSchema(schema, "server");
      builder.clearCache();
      const func2 = builder.createFunctionFromSchema(schema, "server");

      expect(func1).not.toBe(func2); // Different instances
      expect(func1.name).toBe(func2.name); // Same name
    });
  });

  describe("docstring generation", () => {
    it("should generate comprehensive docstring", () => {
      const schema: Tool = {
        name: "complex_tool",
        description: "A complex tool with parameters",
        inputSchema: {
          type: "object",
          properties: {
            required_param: {
              type: "string",
              description: "This parameter is required",
            },
            optional_param: {
              type: "number",
              description: "This parameter is optional",
            },
          },
          required: ["required_param"],
        },
      };

      const func = builder.createFunctionFromSchema(schema, "server");

      expect(func.description).toContain("A complex tool with parameters");
      expect(func._schema).toBe(schema);
      expect(func.schema).toBeDefined(); // Zod schema
      expect(func.inputSchema).toBeDefined(); // Zod schema for Vercel AI
    });

    it("should handle missing descriptions", () => {
      const schema: Tool = {
        name: "minimal_tool",
        inputSchema: {
          type: "object",
          properties: {
            param: { type: "string" },
          },
        },
      };

      const func = builder.createFunctionFromSchema(schema, "server");

      expect(func.description).toContain("No description provided");
      expect(func._schema).toBeDefined();
    });
  });
});
