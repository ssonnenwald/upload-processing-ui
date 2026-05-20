/**
 * Frontend models for the pipeline-health endpoints (PipelineHealthController).
 *
 * Mirror the C# records in UploadProcessing.Api.Contracts (PipelineHealthContracts.cs)
 * 1:1, in camelCase to match ASP.NET Core's default serialization.
 */

/** A logical dead-letter-queue identifier, as used in the route and UI. */
export type DlqId = 'orchestration' | 'streambridge';

/** Result of GET /api/pipeline/health. */
export interface PipelineHealthResponse {
  readonly queues: readonly QueueDepth[];
}

/**
 * Depth of a single queue. A DLQ with `visibleMessages` > 0 is the strongest
 * "something is wrong" signal on the page.
 */
export interface QueueDepth {
  readonly name: string;
  /** "source" for a processing queue, "dlq" for a dead-letter queue. */
  readonly role: 'source' | 'dlq';
  /** False when the queue's config key is unset — the depth is then meaningless. */
  readonly configured: boolean;
  readonly visibleMessages: number;
  readonly inFlightMessages: number;
  /** Non-null when the depth could not be read; the UI shows it instead of a count. */
  readonly error: string | null;
}

/** Result of GET /api/pipeline/dlq/{dlq}/messages. */
export interface DlqMessagesResponse {
  readonly dlq: DlqId;
  /** True only for the orchestration DLQ; drives whether a Replay button is shown. */
  readonly replayable: boolean;
  readonly messages: readonly DlqMessage[];
}

/** A single message peeked from a DLQ. */
export interface DlqMessage {
  readonly messageId: string;
  /** Short-lived handle needed to replay this message — re-peek if it expires. */
  readonly receiptHandle: string;
  readonly body: string;
  /** ISO-8601 string, or null if unknown. */
  readonly sentAt: string | null;
  /** How many delivery attempts were made before the message landed in the DLQ. */
  readonly receiveCount: number;
}

/** Body of POST /api/pipeline/dlq/orchestration/replay. */
export interface DlqReplayRequest {
  readonly receiptHandle: string;
  readonly body: string;
  readonly messageId: string;
}

/** Result of a successful replay. */
export interface DlqReplayResponse {
  readonly messageId: string | null;
  readonly replayed: boolean;
}
