/**
 * Internal logging infrastructure for the mcpd SDK.
 *
 * This module provides a logging shim controlled by the MCPD_LOG_LEVEL environment
 * variable.
 *
 * Logging is disabled by default.
 *
 * NOTE: It is recommended that you only enable MCPD_LOG_LEVEL in non-MCP-server contexts.
 * MCP servers using stdio transport for JSON-RPC communication should avoid enabling logging
 * to avoid contaminating stdout/stderr.
 */

/**
 * Valid {@link LogLevel} values for MCPD_LOG_LEVEL environment variable.
 */
export const LogLevels = {
  TRACE: "trace" as const,
  DEBUG: "debug" as const,
  INFO: "info" as const,
  WARN: "warn" as const,
  ERROR: "error" as const,
  OFF: "off" as const,
};

/**
 * Log level type.
 */
export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

/**
 * Logger interface defining the SDK's logging contract.
 *
 * Each method accepts a message and optional arguments for string formatting.
 * A full Logger implementation provides all methods.
 */
export interface Logger {
  /**
   * Log a trace-level message (most verbose).
   *
   * @param args - Message and optional formatting arguments.
   */
  trace(...args: unknown[]): void;

  /**
   * Log a debug-level message.
   *
   * @param args - Message and optional formatting arguments.
   */
  debug(...args: unknown[]): void;

  /**
   * Log an info-level message.
   *
   * @param args - Message and optional formatting arguments.
   */
  info(...args: unknown[]): void;

  /**
   * Log a warning-level message.
   *
   * @param args - Message and optional formatting arguments.
   */
  warn(...args: unknown[]): void;

  /**
   * Log an error-level message.
   *
   * @param args - Message and optional formatting arguments.
   */
  error(...args: unknown[]): void;
}

// Numeric ranks for log levels (lower = more verbose).
const ranks: Record<LogLevel, number> = {
  trace: 5,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  off: 1000,
};

// Attempts to resolve log level from a (case insensitive) environment variable value.
// Defaults to "off" if unrecognized.
function resolve(raw: string | undefined): LogLevel {
  const candidate = raw?.toLowerCase() as LogLevel | undefined;
  return candidate && candidate in ranks ? candidate : LogLevels.OFF;
}

// Lazily resolve the level at call time to support testing.
function getLevel(): LogLevel {
  return resolve(
    typeof process !== "undefined" ? process.env.MCPD_LOG_LEVEL : undefined,
  );
}

// Default logger implementation using console methods.
function defaultLogger(): Logger {
  return {
    trace: (...args) => {
      const lvl = getLevel();
      if (lvl !== LogLevels.OFF && ranks[lvl] <= ranks.trace)
        console.trace(...args);
    },
    debug: (...args) => {
      const lvl = getLevel();
      if (lvl !== LogLevels.OFF && ranks[lvl] <= ranks.debug)
        console.debug(...args);
    },
    info: (...args) => {
      const lvl = getLevel();
      if (lvl !== LogLevels.OFF && ranks[lvl] <= ranks.info)
        console.info(...args);
    },
    warn: (...args) => {
      const lvl = getLevel();
      if (lvl !== LogLevels.OFF && ranks[lvl] <= ranks.warn)
        console.warn(...args);
    },
    error: (...args) => {
      const lvl = getLevel();
      if (lvl !== LogLevels.OFF && ranks[lvl] <= ranks.error)
        console.error(...args);
    },
  };
}

/**
 * Create a logger, optionally using a custom implementation.
 *
 * This function allows SDK users to inject their own logger implementation.
 * Supports partial implementations - any omitted methods will fall back to the
 * default logger, which respects the MCPD_LOG_LEVEL environment variable.
 *
 * @param impl - Custom Logger implementation or partial implementation.
 *               If not provided, uses default logger controlled by MCPD_LOG_LEVEL.
 *               If partially provided, custom methods are used and omitted methods
 *               fall back to default logger (which respects MCPD_LOG_LEVEL).
 * @returns A Logger instance with all methods implemented.
 *
 * @example
 * ```typescript
 * // Use default logger (controlled by MCPD_LOG_LEVEL).
 * const logger = createLogger();
 *
 * // Partial logger: custom warn/error, default (MCPD_LOG_LEVEL-aware) for others.
 * const logger = createLogger({
 *   warn: (msg) => myCustomLogger.warning(msg),
 *   error: (msg) => myCustomLogger.error(msg),
 *   // trace, debug, info fall back to default logger (respects MCPD_LOG_LEVEL)
 * });
 * ```
 */
export function createLogger(impl?: Partial<Logger>): Logger {
  const base = defaultLogger();
  return {
    trace: impl?.trace ?? base.trace,
    debug: impl?.debug ?? base.debug,
    info: impl?.info ?? base.info,
    warn: impl?.warn ?? base.warn,
    error: impl?.error ?? base.error,
  };
}
