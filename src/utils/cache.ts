/**
 * Cache utilities for the mcpd SDK.
 */

import { LRUCache } from "lru-cache";

/**
 * Options for creating a TTL cache.
 */
export interface CacheOptions {
  /**
   * Maximum number of items to store in the cache.
   */
  max?: number;

  /**
   * TTL in milliseconds for cached items.
   */
  ttl?: number;
}

/**
 * Creates a new LRU cache with TTL support.
 *
 * @param options - Cache configuration options
 * @returns A configured LRU cache instance
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
export function createCache<K extends {} = string, V extends {} = any>(
  options: CacheOptions = {},
): LRUCache<K, V> {
  return new LRUCache<K, V>({
    max: options.max ?? 100,
    ttl: options.ttl ?? 10000, // Default 10 seconds
    updateAgeOnGet: false,
    updateAgeOnHas: false,
  });
}
