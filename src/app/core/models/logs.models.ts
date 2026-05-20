/**
 * Frontend models for the CloudWatch Logs endpoints (LogsController).
 *
 * These mirror the C# records in UploadProcessing.Api.Contracts (LogsContracts.cs)
 * 1:1. ASP.NET Core serializes record properties as camelCase by default, so the
 * field names here are the camelCase form of the C# PascalCase properties.
 *
 * Kept separate from run.models.ts because logs are an independent concern — the
 * logs feature can evolve without touching the run/upload models.
 */

/** Severity strings the API attaches to a parsed log line. */
export type LogSeverity =
  // From a structured-log block's LogLevel field.
  | 'Trace'
  | 'Debug'
  | 'Information'
  | 'Warning'
  | 'Error'
  | 'Critical'
  | 'Unknown'
  // Heuristic classes the API assigns to plain (non-JSON) runtime lines.
  | 'Runtime'
  | 'Success';

/** The minLevel filter values accepted by GET /api/logs/groups/{group}/events. */
export type LogMinLevel =
  | 'Trace'
  | 'Debug'
  | 'Information'
  | 'Warning'
  | 'Error'
  | 'Critical';

/**
 * One of the three known pipeline log groups.
 * GET /api/logs/functions
 */
export interface LogGroupCatalogEntry {
  readonly name: string;
  readonly group: string;
  readonly description: string;
}

/**
 * A discovered CloudWatch log group.
 * GET /api/logs/groups
 */
export interface LogGroupInfo {
  readonly name: string;
  readonly storedBytes: number;
  /** ISO-8601 string, or null if the group has no creation time. */
  readonly createdAt: string | null;
  readonly retentionDays: number | null;
}

/**
 * A single stream within a log group.
 * GET /api/logs/groups/{group}/streams
 */
export interface LogStreamInfo {
  readonly name: string;
  readonly firstEventAt: string | null;
  readonly lastEventAt: string | null;
}

/**
 * A single parsed log line.
 *
 * `kind` discriminates the two shapes:
 *   - 'json' — an embedded structured-log block was found. `json` holds the
 *     parsed object; `text` is any text that preceded it on the line; `suffix`
 *     is any text that followed it.
 *   - 'text' — a plain line. `text` is the line itself; `json`/`suffix` are null.
 */
export interface ParsedLogEvent {
  /** ISO-8601 string, or null if CloudWatch reported no timestamp. */
  readonly timestamp: string | null;
  readonly kind: 'json' | 'text';
  readonly severity: LogSeverity;
  readonly text: string | null;
  /** The parsed structured-log object — present only when kind === 'json'. */
  readonly json: unknown | null;
  readonly suffix: string | null;
}

/** Parsed events for one stream. */
export interface LogStreamEvents {
  readonly streamName: string;
  readonly lastEventAt: string | null;
  readonly events: readonly ParsedLogEvent[];
}

/**
 * Top-level result of GET /api/logs/groups/{group}/events.
 */
export interface LogEventsResponse {
  readonly group: string;
  readonly streams: readonly LogStreamEvents[];
  /** Count of JSON blocks hidden by the minLevel filter. */
  readonly levelFiltered: number;
  /** Count of consecutive duplicate lines collapsed. */
  readonly duplicatesCollapsed: number;
  /** Human-readable note (e.g. "no streams found"); null when events were returned. */
  readonly note: string | null;
}

/** Query parameters for an events request — assembled by the logs page. */
export interface LogEventsQuery {
  readonly group: string;
  readonly streams?: number;
  readonly minLevel?: LogMinLevel;
  readonly runId?: string;
  readonly sinceMinutes?: number;
}
