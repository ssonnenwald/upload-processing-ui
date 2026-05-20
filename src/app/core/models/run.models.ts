// Mirrors the C# records in UploadProcessing.Api/Contracts/Contracts.cs.
// Field names match the JSON wire format ASP.NET Core emits (camelCase) for
// System.Text.Json's default serializer settings.

/**
 * Run-level status. Mirrors the backend status string in the RUN#META item's
 * `status` attribute. Treat unknown values as 'Pending' in the UI rather than
 * throwing — old runs from before a status was added should still render.
 */
export type RunStatus =
  | 'Pending'
  | 'Chunking'
  | 'InProgress'
  | 'Completed'
  | 'CompletedWithErrors'
  | 'Failed';

export type ChunkStatus = 'Pending' | 'InProgress' | 'Succeeded' | 'Failed';

/** A run is terminal (no more updates expected) in these states. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'Completed',
  'CompletedWithErrors',
  'Failed',
]);

export interface ChunkSummary {
  readonly chunkSk: string;          // "CHUNK#0001"
  readonly chunkIndex: number;
  readonly startingRow: number;
  readonly endingRow: number;
  readonly status: ChunkStatus;
  readonly attemptCount: number;
  readonly succeeded: number;
  readonly failedValid: number;
  readonly invalid: number;
  readonly skipped: number;
  readonly errorSummary: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

/** GET /api/runs/{runId} response. */
export interface RunDetailsResponse {
  readonly runId: string;
  readonly function: string;
  readonly status: RunStatus;
  readonly uploadedBy: string;
  readonly uploadedAt: string;        // ISO
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly totalRows: number;
  readonly totalChunks: number;
  readonly chunksCompleted: number;
  readonly succeeded: number;
  readonly failedValid: number;
  readonly invalid: number;
  readonly skipped: number;
  readonly options: Readonly<Record<string, unknown>>;
  readonly chunks: readonly ChunkSummary[];
}

/** Projected row used by run-history listings (subset of RunDetailsResponse). */
export interface RunListItem {
  readonly runId: string;
  readonly function: string;
  readonly status: RunStatus;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly totalRows: number;
  readonly totalChunks: number;
  readonly chunksCompleted: number;
}

// -----------------------------------------------------------------------------
// SignalR event payloads — must match what RunStatusNotifier sends on the server.
// -----------------------------------------------------------------------------

export interface ChunkUpdate {
  readonly runId: string;
  readonly chunkSk: string;
  readonly chunkIndex: number;
  readonly status: ChunkStatus;
  readonly attemptCount: number;
  readonly succeeded: number;
  readonly failedValid: number;
  readonly invalid: number;
  readonly skipped: number;
  readonly errorSummary: string | null;
  readonly completedAt: string | null;
}

export interface RunStatusChanged {
  readonly runId: string;
  readonly status: RunStatus;
  readonly chunksCompleted: number;
  readonly totalChunks: number;
  readonly succeeded: number;
  readonly failedValid: number;
  readonly invalid: number;
  readonly skipped: number;
}

export interface RunSummary {
  readonly runId: string;
  readonly function: string;
  readonly status: RunStatus;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly completedAt: string | null;
  readonly totalRows: number;
  readonly totalChunks: number;
  readonly succeeded: number;
  readonly failedValid: number;
  readonly invalid: number;
  readonly skipped: number;
}

/**
 * Upload request payload. Matches the multipart/form-data fields the API expects
 * on POST /api/uploads/{function}. `options` is a JSON-serialized map of the
 * upload definition's `options` toggles (e.g. `{ retetherDiamondPrices: true }`).
 */
export interface UploadRequest {
  readonly function: string;
  readonly file: File;
  readonly uploadedBy: string;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface UploadResponse {
  readonly runId: string;
  readonly function: string;
  readonly status: RunStatus;
  readonly totalRows?: number;
}

/**
 * Subset of the upload definition needed to render the upload form.
 * The API exposes this via GET /api/functions/{function}/definition so the UI
 * doesn't have to hardcode column lists or option toggles. If your backend
 * doesn't expose this endpoint yet, the UI falls back to a generic file picker.
 */
export interface UploadDefinitionView {
  readonly function: string;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly file: {
    readonly format: string;
    readonly namingPattern: string;
  };
  readonly columns: ReadonlyArray<{
    readonly name: string;
    readonly header: string;
    readonly dataType: string;
    readonly required: boolean;
  }>;
  readonly options: Readonly<Record<string, UploadDefinitionOption>>;
}

export interface UploadDefinitionOption {
  readonly type: 'boolean' | 'string' | 'number';
  readonly default: unknown;
  readonly userEditable: boolean;
  readonly label: string;
}

/** Catalog entry for the dropdown on the upload page. */
export interface FunctionCatalogEntry {
  readonly function: string;
  readonly displayName: string;
  readonly description: string;
}
