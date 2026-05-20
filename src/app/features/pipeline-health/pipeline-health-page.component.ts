import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { EMPTY, fromEvent, interval, merge } from 'rxjs';
import { catchError, filter, switchMap } from 'rxjs/operators';
import { PipelineHealthApi } from '@core/api/pipeline-health-api.service';
import { friendlyApiError } from '@core/api/friendly-error';
import type {
  DlqId,
  DlqMessage,
  DlqMessagesResponse,
  PipelineHealthResponse,
  QueueDepth,
} from '@core/models/pipeline-health.models';

/** UI state for one DLQ panel — its messages plus per-panel load/error/expansion. */
interface DlqPanelState {
  readonly id: DlqId;
  readonly title: string;
  /** Explains the panel's purpose and (for StreamBridge) why it is inspect-only. */
  readonly blurb: string;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  response: DlqMessagesResponse | null;
}

/**
 * Pipeline health page: queue depths for the whole pipeline, plus dead-letter-queue
 * inspection and (orchestration only) replay.
 *
 * The two DLQs are deliberately asymmetric — see PipelineHealthController. The
 * orchestration DLQ holds real upload messages and supports replay; the StreamBridge
 * DLQ holds stream-failure metadata, is inspect-only, and the panel says so.
 *
 * Replay is gated behind an inline confirm step (expand message → Replay → Confirm)
 * rather than a bare button, because it re-injects a message into the live pipeline.
 */
@Component({
  selector: 'app-pipeline-health-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
  ],
  templateUrl: './pipeline-health-page.component.html',
  styleUrl: './pipeline-health-page.component.scss',
})
export class PipelineHealthPageComponent {
  private readonly api = inject(PipelineHealthApi);
  private readonly destroyRef = inject(DestroyRef);

  // --- Queue health ---------------------------------------------------------
  protected readonly health = signal<PipelineHealthResponse | null>(null);
  protected readonly healthLoading = signal(true);
  protected readonly healthError = signal<string | null>(null);

  /** When the queue depths were last successfully refreshed. */
  protected readonly lastUpdated = signal<Date | null>(null);

  /** Whether the 30s auto-refresh poll is active. User-toggleable; on by default. */
  protected readonly autoRefresh = signal(true);

  /** Auto-refresh cadence. 30s is frequent enough to catch a filling DLQ promptly. */
  private static readonly RefreshIntervalMs = 30_000;

  /** True when any DLQ has visible messages — drives the page-level warning banner. */
  protected readonly hasStuckMessages = computed(() =>
    (this.health()?.queues ?? []).some(
      (q) =>
        q.role === 'dlq' &&
        q.configured &&
        q.error === null &&
        q.visibleMessages > 0,
    ),
  );

  // --- DLQ panels -----------------------------------------------------------
  protected readonly panels = signal<DlqPanelState[]>([
    {
      id: 'orchestration',
      title: 'Orchestration DLQ',
      blurb:
        'Holds uploads that failed before they could be chunked. These can be ' +
        'replayed — the message goes back to the orchestration queue and the ' +
        'upload is reprocessed.',
      loading: false,
      error: null,
      loaded: false,
      response: null,
    },
    {
      id: 'streambridge',
      title: 'StreamBridge DLQ',
      blurb:
        'Holds StreamBridge stream-processing failures. These are inspect-only: ' +
        'a missed StreamBridge event only affects live UI updates, not the run ' +
        'data in DynamoDB. Refresh the run page to resync.',
      loading: false,
      error: null,
      loaded: false,
      response: null,
    },
  ]);

  /** The message currently awaiting replay confirmation (by messageId), if any. */
  protected readonly pendingReplayId = signal<string | null>(null);
  /** The message currently being replayed (by messageId), if any. */
  protected readonly replayingId = signal<string | null>(null);

  constructor() {
    // Initial load — shows the progress bar.
    this.loadHealth();

    // Auto-refresh: tick every RefreshIntervalMs, but only while the toggle is on
    // AND the browser tab is visible (no point polling a tab nobody's watching).
    // A `visibilitychange` that lands on 'visible' triggers an immediate catch-up
    // refresh — so returning to a backgrounded tab shows fresh depths at once.
    // No startWith here: the constructor's loadHealth() already does the first load.
    const becameVisible$ = fromEvent(document, 'visibilitychange').pipe(
      filter(() => document.visibilityState === 'visible'),
    );

    merge(
      interval(PipelineHealthPageComponent.RefreshIntervalMs),
      becameVisible$,
    )
      .pipe(
        // Drop ticks when auto-refresh is off or the tab is hidden.
        filter(
          () => this.autoRefresh() && document.visibilityState === 'visible',
        ),
        // switchMap: if a poll is still in flight when the next tick lands, cancel
        // the stale one — we only ever care about the freshest depths.
        switchMap(() =>
          this.api.getHealth().pipe(
            // catchError lives INSIDE switchMap on purpose: a failed poll surfaces
            // the error but completes this inner observable, so the outer interval
            // keeps ticking. catchError on the outer stream would kill polling for
            // good on the first transient failure.
            catchError((err: unknown) => {
              this.healthError.set(
                friendlyApiError(
                  err,
                  'Pipeline health could not be refreshed.',
                ),
              );
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => this.applyHealth(response));
  }

  // --- Queue health ---------------------------------------------------------

  /**
   * Fetches queue depths and shows the progress bar — used for the initial load
   * and the manual Refresh button. The 30s poll uses applyHealth directly so it
   * never flips the loading bar (a silent background refresh).
   */
  protected loadHealth(): void {
    this.healthLoading.set(true);
    this.healthError.set(null);

    this.api
      .getHealth()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.applyHealth(response);
          this.healthLoading.set(false);
        },
        error: (err: unknown) => {
          this.healthError.set(
            friendlyApiError(err, 'Pipeline health could not be loaded.'),
          );
          this.healthLoading.set(false);
        },
      });
  }

  /** Stores a successful health result and stamps the refresh time. */
  private applyHealth(response: PipelineHealthResponse): void {
    this.health.set(response);
    this.lastUpdated.set(new Date());
    // A successful refresh clears any stale error from a previous failed poll.
    this.healthError.set(null);
  }

  // --- DLQ panels -----------------------------------------------------------

  /** Loads (peeks) the messages for one DLQ panel. */
  protected loadDlq(id: DlqId): void {
    this.patchPanel(id, { loading: true, error: null });

    this.api
      .getDlqMessages(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.patchPanel(id, {
            loading: false,
            loaded: true,
            response,
          });
        },
        error: (err: unknown) => {
          this.patchPanel(id, {
            loading: false,
            loaded: true,
            error: friendlyApiError(err, 'DLQ messages could not be loaded.'),
          });
        },
      });
  }

  // --- Replay ---------------------------------------------------------------

  /** Arms the inline confirm step for a message. */
  protected askReplay(messageId: string): void {
    this.pendingReplayId.set(messageId);
  }

  /** Cancels a pending replay confirmation. */
  protected cancelReplay(): void {
    this.pendingReplayId.set(null);
  }

  /** Confirms and performs the replay, then refreshes the panel and health. */
  protected confirmReplay(message: DlqMessage): void {
    this.pendingReplayId.set(null);
    this.replayingId.set(message.messageId);

    this.api
      .replayOrchestrationMessage({
        receiptHandle: message.receiptHandle,
        body: message.body,
        messageId: message.messageId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.replayingId.set(null);
          // The message left the DLQ — re-peek the panel and refresh depths.
          this.loadDlq('orchestration');
          this.loadHealth();
        },
        error: (err: unknown) => {
          this.replayingId.set(null);
          this.patchPanel('orchestration', {
            error: friendlyApiError(err, 'The message could not be replayed.'),
          });
        },
      });
  }

  // --- Helpers --------------------------------------------------------------

  /** Immutably patches one panel's state by id. */
  private patchPanel(id: DlqId, patch: Partial<DlqPanelState>): void {
    this.panels.update((panels) =>
      panels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  /** Severity class for a queue row — 'alert' when a DLQ has messages. */
  protected queueSeverity(queue: QueueDepth): 'alert' | 'warn' | 'ok' {
    if (queue.error !== null || !queue.configured) return 'warn';
    if (queue.role === 'dlq' && queue.visibleMessages > 0) return 'alert';
    return 'ok';
  }
}
