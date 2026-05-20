/**
 * Frontend models for the dashboard summary endpoint (RunsController.Summary.cs).
 * Mirror the C# records in UploadProcessing.Api.Contracts 1:1, in camelCase.
 */
import type { RunListItem, RunStatus } from './run.models';

/** Run count for a single status. */
export interface RunStatusCount {
  readonly status: RunStatus;
  readonly count: number;
}

/**
 * Result of GET /api/runs/summary — the dashboard's aggregate view.
 */
export interface RunSummaryResponse {
  /** Sum of all per-status counts; a floor when `isApproximate` is true. */
  readonly totalRuns: number;
  /**
   * True when a status hit the server-side read cap, so its count — and the
   * total — is a lower bound. The UI shows a "500+"-style hint when set.
   */
  readonly isApproximate: boolean;
  readonly counts: readonly RunStatusCount[];
  /** Newest run across all statuses, or null when there are no runs. */
  readonly mostRecentRun: RunListItem | null;
  /**
   * Newest run in a failure status (Failed or CompletedWithErrors), or null
   * when nothing has failed — for the "most recent failure" widget.
   */
  readonly mostRecentFailure: RunListItem | null;
}
