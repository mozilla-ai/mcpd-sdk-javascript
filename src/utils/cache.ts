/**
 * Cache utilities for the mcpd SDK.
 */

import { LRUCache } from 'lru-cache';

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
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function createCache<K extends {} = string, V extends {} = any>(options: CacheOptions = {}): LRUCache<K, V> {
  return new LRUCache<K, V>({
    max: options.max ?? 100,
    ttl: options.ttl ?? 10000, // Default 10 seconds
    updateAgeOnGet: false,
    updateAgeOnHas: false,
  });
}

/**
 * Cache decorator for async methods.
 * Caches successful results and certain error types.
 */
export function cached<T extends (...args: any[]) => Promise<any>>(
  cache: LRUCache<string, any>,
  keyGenerator: (...args: Parameters<T>) => string,
  cacheableErrors?: Set<new (...args: any[]) => Error>
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: Parameters<T>): Promise<ReturnType<T>> {
      const cacheKey = keyGenerator(...args);

      // Check if we have a cached value
      const cachedValue = cache.get(cacheKey);
      if (cachedValue !== undefined) {
        // If it's a cached error, throw it
        if (cachedValue instanceof Error) {
          throw cachedValue;
        }
        return cachedValue;
      }

      try {
        // Call the original method
        const result = await originalMethod.apply(this, args);

        // Cache the successful result
        cache.set(cacheKey, result);

        return result;
      } catch (error) {
        // Check if this error type should be cached
        if (cacheableErrors && error instanceof Error) {
          for (const errorType of cacheableErrors) {
            if (error instanceof errorType) {
              cache.set(cacheKey, error);
              break;
            }
          }
        }

        throw error;
      }
    };

    return descriptor;
  };
}