/**
 * JSON Schema to JavaScript type conversion and validation utilities.
 *
 * This module provides the TypeConverter class that handles conversion between
 * JSON Schema type definitions and JavaScript runtime type information. It supports
 * all standard JSON Schema types including complex constructs like unions (anyOf)
 * and provides runtime validation of values against their schemas.
 *
 * Used primarily by the FunctionBuilder for parameter validation and generating
 * human-readable type descriptions for dynamically generated functions.
 */

import type { JsonSchema } from '../types';

/**
 * Maps JSON Schema types to JavaScript/TypeScript types.
 */
export class TypeConverter {
  /**
   * Convert JSON schema types to JavaScript type names.
   *
   * Maps JSON Schema types to their JavaScript equivalents:
   * - "string" → "string"
   * - "integer" → "number"
   * - "number" → "number"
   * - "boolean" → "boolean"
   * - "array" → "array"
   * - "object" → "object"
   * - "null" → "null"
   * - unknown types → "any"
   */
  static jsonTypeToJavaScriptType(jsonType: string, schemaDef: JsonSchema): string {
    switch (jsonType) {
      case 'string':
        if (schemaDef.enum && Array.isArray(schemaDef.enum)) {
          // For enums, we'll use string but note the allowed values
          return 'string';
        }
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        return 'array';
      case 'object':
        return 'object';
      case 'null':
        return 'null';
      default:
        return 'any';
    }
  }

  /**
   * Parse a schema definition and return the appropriate JavaScript type name.
   */
  static parseSchemaType(schemaDef: JsonSchema): string {
    if (schemaDef.anyOf && Array.isArray(schemaDef.anyOf)) {
      // For unions, we'll use the first type or 'any' if complex
      const firstType = schemaDef.anyOf[0];
      if (firstType && typeof firstType === 'object' && firstType.type) {
        return this.jsonTypeToJavaScriptType(firstType.type, firstType);
      }
      return 'any';
    }

    if (schemaDef.type) {
      return this.jsonTypeToJavaScriptType(schemaDef.type, schemaDef);
    }

    return 'any';
  }

  /**
   * Get a human-readable description of the expected type.
   */
  static getTypeDescription(schemaDef: JsonSchema): string {
    const baseType = this.parseSchemaType(schemaDef);

    if (schemaDef.enum && Array.isArray(schemaDef.enum)) {
      return `one of: ${schemaDef.enum.map((v) => JSON.stringify(v)).join(', ')}`;
    }

    if (schemaDef.type === 'array' && schemaDef.items) {
      const itemType = this.parseSchemaType(schemaDef.items);
      return `array of ${itemType}`;
    }

    return baseType;
  }

  /**
   * Validate a value against a JSON schema type.
   * Returns true if valid, false otherwise.
   */
  static validateValue(value: unknown, schemaDef: JsonSchema): boolean {
    if (value === null || value === undefined) {
      // Null/undefined handling depends on whether the schema allows null
      return schemaDef.type === 'null' || (schemaDef.anyOf?.some((s: JsonSchema) => s.type === 'null') ?? false);
    }

    if (schemaDef.enum && Array.isArray(schemaDef.enum)) {
      return schemaDef.enum.includes(value);
    }

    if (schemaDef.anyOf && Array.isArray(schemaDef.anyOf)) {
      return schemaDef.anyOf.some((subSchema) => this.validateValue(value, subSchema));
    }

    if (!schemaDef.type) {
      return true; // No type constraint
    }

    switch (schemaDef.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && isFinite(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        if (!Array.isArray(value)) return false;
        if (schemaDef.items) {
          return value.every((item) => this.validateValue(item, schemaDef.items!));
        }
        return true;
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true; // Unknown type, allow anything
    }
  }
}