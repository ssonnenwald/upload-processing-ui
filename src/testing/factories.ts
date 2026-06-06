/**
 * Shared typed test factories.
 *
 * Each `make*` function returns a fully valid model object built from the real
 * interface (no `as` casts), and accepts a `Partial<T>` of overrides for the
 * fields a given test cares about. Because the return type is the real
 * interface, TypeScript verifies every field — if a model gains a required
 * field, the factory fails to compile here, in one place, instead of silently
 * across every spec.
 *
 * Usage:
 *   import { makeRunDetails } from '@testing/factories';
 *   const run = makeRunDetails({ status: 'Failed' });
 *
 * Baseline values are deliberately generic. Where two specs historically
 * disagreed on a default (e.g. RunsApi used runId 'RUN#abc', LiveRunStore used
 * 'RUN#1'), the more widely-assumed baseline was chosen; call sites that need a
 * specific value already pass it as an override, so they are unaffected.
 */
import type {
  ChunkDetailsResponse,
  ChunkRowOutcome,
  ChunkSummary,
  ChunkUpdate,
  FunctionCatalogEntry,
  RunDetailsResponse,
  RunListItem,
  RunStatusChanged,
  RunSummary,
  UploadDefinitionView,
  UploadRequest,
  UploadResponse,
} from '@core/models/run.models';
import type {
  RunStatusCount,
  RunSummaryResponse,
} from '@core/models/run-summary.models';
import type {
  DlqMessage,
  DlqMessagesResponse,
  PipelineHealthResponse,
  QueueDepth,
} from '@core/models/pipeline-health.models';
import type {
  LogEventsResponse,
  LogGroupCatalogEntry,
  LogStreamEvents,
  ParsedLogEvent,
} from '@core/models/logs.models';

// --- run.models --------------------------------------------------------------

export function makeFunctionEntry(
  over: Partial<FunctionCatalogEntry> = {},
): FunctionCatalogEntry {
  return {
    function: 'PID_RECALC',
    displayName: 'PID Recalculation',
    description: 'Recalculates PID values.',
    file: { format: 'csv', namingPattern: '*.csv' },
    options: {},
    ...over,
  };
}

export function makeDefinition(
  over: Partial<UploadDefinitionView> = {},
): UploadDefinitionView {
  return {
    function: 'PID_RECALC',
    version: '1',
    displayName: 'PID Recalculation',
    description: 'Recalculates PID values.',
    file: { format: 'csv', namingPattern: '*.csv' },
    columns: [],
    options: {},
    ...over,
  };
}

export function makeRunListItem(over: Partial<RunListItem> = {}): RunListItem {
  return {
    runId: 'RUN#1',
    function: 'PID_RECALC',
    status: 'Completed',
    uploadedBy: 'jdoe',
    uploadedAt: '2026-05-17T22:23:52Z',
    totalRows: 200,
    totalChunks: 4,
    chunksCompleted: 4,
    ...over,
  };
}

export function makeChunk(over: Partial<ChunkSummary> = {}): ChunkSummary {
  return {
    chunkSk: 'CHUNK#0001',
    chunkIndex: 1,
    startingRow: 1,
    endingRow: 50,
    status: 'Succeeded',
    attemptCount: 1,
    succeeded: 50,
    failedValid: 0,
    invalid: 0,
    skipped: 0,
    errorSummary: null,
    startedAt: '2026-05-17T22:24:00Z',
    completedAt: '2026-05-17T22:24:30Z',
    ...over,
  };
}

export function makeChunkRowOutcome(
  over: Partial<ChunkRowOutcome> = {},
): ChunkRowOutcome {
  return {
    row: 1,
    status: 'succeeded',
    reason: null,
    ...over,
  };
}

export function makeChunkDetails(
  over: Partial<ChunkDetailsResponse> = {},
): ChunkDetailsResponse {
  return {
    runId: 'RUN#1',
    chunkSk: 'CHUNK#0001',
    chunkIndex: 1,
    startingRow: 1,
    endingRow: 50,
    status: 'Succeeded',
    detailsAvailable: true,
    detailsMessage: null,
    succeeded: 48,
    failedValid: 1,
    invalid: 1,
    skipped: 0,
    rows: [],
    ...over,
  };
}

export function makeRunDetails(
  over: Partial<RunDetailsResponse> = {},
): RunDetailsResponse {
  return {
    runId: 'RUN#1',
    function: 'PID_RECALC',
    status: 'InProgress',
    uploadedBy: 'jdoe',
    uploadedAt: '2026-05-17T22:23:52Z',
    startedAt: '2026-05-17T22:24:00Z',
    completedAt: null,
    totalRows: 200,
    totalChunks: 4,
    chunksCompleted: 0,
    succeeded: 0,
    failedValid: 0,
    invalid: 0,
    skipped: 0,
    options: {},
    chunks: [],
    ...over,
  };
}

export function makeChunkUpdate(over: Partial<ChunkUpdate> = {}): ChunkUpdate {
  return {
    runId: 'RUN#1',
    chunkSk: 'CHUNK#0001',
    chunkIndex: 1,
    status: 'Succeeded',
    attemptCount: 1,
    succeeded: 50,
    failedValid: 0,
    invalid: 0,
    skipped: 0,
    errorSummary: null,
    completedAt: '2026-05-17T22:24:30Z',
    ...over,
  };
}

export function makeStatusChange(
  over: Partial<RunStatusChanged> = {},
): RunStatusChanged {
  return {
    runId: 'RUN#1',
    status: 'InProgress',
    chunksCompleted: 2,
    totalChunks: 4,
    succeeded: 100,
    failedValid: 0,
    invalid: 0,
    skipped: 0,
    ...over,
  };
}

export function makeRunSummary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'RUN#1',
    function: 'PID_RECALC',
    status: 'Completed',
    uploadedBy: 'jdoe',
    uploadedAt: '2026-05-17T22:23:52Z',
    completedAt: '2026-05-17T22:30:00Z',
    totalRows: 200,
    totalChunks: 4,
    succeeded: 200,
    failedValid: 0,
    invalid: 0,
    skipped: 0,
    ...over,
  };
}

export function makeUploadResponse(
  over: Partial<UploadResponse> = {},
): UploadResponse {
  return {
    runId: 'RUN#new',
    function: 'PID_RECALC',
    status: 'Pending',
    ...over,
  };
}

export function makeUploadRequest(
  over: Partial<UploadRequest> = {},
): UploadRequest {
  return {
    function: 'PID_RECALC',
    file: new File(['hello'], 'data.csv', { type: 'text/csv' }),
    uploadedBy: 'jdoe',
    options: { recalcAll: true },
    ...over,
  };
}

// --- run-summary.models ------------------------------------------------------

/**
 * Builds a RunSummaryResponse. Accepts two call styles:
 *   makeSummary([{ status: 'Completed', count: 42 }])      // counts first
 *   makeSummary([...], { isApproximate: true })            // counts + overrides
 *   makeSummary({ totalRuns: 12, isApproximate: true })    // overrides only
 * When counts are supplied, totalRuns defaults to their sum (an explicit
 * totalRuns in the overrides still wins).
 */
export function makeSummary(
  countsOrOver: RunStatusCount[] | Partial<RunSummaryResponse> = [],
  over: Partial<RunSummaryResponse> = {},
): RunSummaryResponse {
  // Distinguish the two first-arg forms: an array is the counts list,
  // anything else is an overrides object.
  const counts: RunStatusCount[] = Array.isArray(countsOrOver)
    ? countsOrOver
    : ((countsOrOver.counts as RunStatusCount[]) ?? []);
  const overrides: Partial<RunSummaryResponse> = Array.isArray(countsOrOver)
    ? over
    : countsOrOver;

  return {
    totalRuns: counts.reduce((sum, c) => sum + c.count, 0),
    isApproximate: false,
    counts,
    mostRecentRun: null,
    mostRecentFailure: null,
    ...overrides,
  };
}

// --- pipeline-health.models --------------------------------------------------

export function makeQueue(over: Partial<QueueDepth> = {}): QueueDepth {
  return {
    name: 'queue',
    role: 'dlq',
    configured: true,
    visibleMessages: 0,
    inFlightMessages: 0,
    error: null,
    ...over,
  };
}

export function makeHealth(queues: QueueDepth[] = []): PipelineHealthResponse {
  return { queues };
}

export function makeDlqMessage(over: Partial<DlqMessage> = {}): DlqMessage {
  return {
    messageId: 'msg-1',
    receiptHandle: 'rh-1',
    body: '{"runId":"RUN#1"}',
    sentAt: '2026-05-17T12:00:00Z',
    receiveCount: 3,
    ...over,
  };
}

export function makeDlqResponse(
  messages: DlqMessage[] = [],
  over: Partial<DlqMessagesResponse> = {},
): DlqMessagesResponse {
  return {
    dlq: 'orchestration',
    replayable: true,
    messages,
    ...over,
  };
}

// --- logs.models -------------------------------------------------------------

export function makeLogCatalogEntry(
  over: Partial<LogGroupCatalogEntry> = {},
): LogGroupCatalogEntry {
  return {
    name: 'PID Recalc',
    group: '/aws/lambda/pid-recalc',
    description: 'The recalculation Lambda.',
    ...over,
  };
}

export function makeLogEvent(
  over: Partial<ParsedLogEvent> = {},
): ParsedLogEvent {
  return {
    timestamp: '2026-05-17T12:00:00Z',
    kind: 'text',
    severity: 'Information',
    text: 'a log line',
    json: null,
    suffix: null,
    ...over,
  };
}

export function makeLogStream(
  events: ParsedLogEvent[] = [],
  over: Partial<LogStreamEvents> = {},
): LogStreamEvents {
  return {
    streamName: 'stream-1',
    lastEventAt: '2026-05-17T12:00:00Z',
    events,
    ...over,
  };
}

export function makeLogEventsResponse(
  streams: LogStreamEvents[] = [],
  over: Partial<LogEventsResponse> = {},
): LogEventsResponse {
  return {
    group: '/aws/lambda/pid-recalc',
    streams,
    levelFiltered: 0,
    duplicatesCollapsed: 0,
    note: null,
    ...over,
  };
}
