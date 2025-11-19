/**
 * Test utilities for mocking API responses.
 */
import { vi } from "vitest";

/**
 * Create a fetch mock that responds based on route patterns.
 *
 * Routes are matched by checking if the URL ends with the route key.
 * This allows matching both full URLs and relative paths.
 *
 * @param routes - Map of route patterns to response payloads.
 * @returns Mock fetch function.
 *
 * @example
 * ```typescript
 * const fetchMock = createFetchMock({
 *   [API_PATHS.SERVERS]: ["time", "math"],
 *   [API_PATHS.HEALTH_ALL]: {
 *     servers: [
 *       { name: "time", status: "ok" },
 *       { name: "math", status: "ok" },
 *     ],
 *   },
 * });
 *
 * global.fetch = fetchMock;
 * ```
 */
export function createFetchMock(routes: Record<string, unknown>): typeof fetch {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();

    const match = Object.entries(routes).find(([path]) => url.endsWith(path));

    if (match) {
      const [, payload] = match;
      return { ok: true, json: async () => payload } as Response;
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        title: "Not Found",
        detail: "Route not found",
        type: "about:blank",
      }),
    } as Response;
  });

  return fn as unknown as typeof fetch;
}
