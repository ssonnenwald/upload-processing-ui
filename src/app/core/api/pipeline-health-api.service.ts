import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '@env/environment';
import type {
  DlqId,
  DlqMessagesResponse,
  DlqReplayRequest,
  DlqReplayResponse,
  PipelineHealthResponse,
} from '../models/pipeline-health.models';

/**
 * Typed client for the pipeline-health endpoints exposed by PipelineHealthController.
 *
 * Same pattern as RunsApi / LogsApi: `providedIn: 'root'`, `inject()` for HttpClient,
 * env-based base URL.
 */
@Injectable({ providedIn: 'root' })
export class PipelineHealthApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /**
   * GET /api/pipeline/health
   * Depth of every pipeline queue and DLQ.
   */
  getHealth(): Observable<PipelineHealthResponse> {
    return this.http.get<PipelineHealthResponse>(
      `${this.base}/api/pipeline/health`,
    );
  }

  /**
   * GET /api/pipeline/dlq/{dlq}/messages
   * Peeks the messages currently stuck in a DLQ (does not remove them).
   */
  getDlqMessages(dlq: DlqId): Observable<DlqMessagesResponse> {
    return this.http.get<DlqMessagesResponse>(
      `${this.base}/api/pipeline/dlq/${dlq}/messages`,
    );
  }

  /**
   * POST /api/pipeline/dlq/orchestration/replay
   * Moves one message from the orchestration DLQ back to the source queue.
   * Only the orchestration DLQ supports replay.
   */
  replayOrchestrationMessage(
    request: DlqReplayRequest,
  ): Observable<DlqReplayResponse> {
    return this.http.post<DlqReplayResponse>(
      `${this.base}/api/pipeline/dlq/orchestration/replay`,
      request,
    );
  }
}
