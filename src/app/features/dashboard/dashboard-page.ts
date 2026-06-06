import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RunsApi } from '@core/api/runs-api';
import { PipelineHealthApi } from '@core/api/pipeline-health-api';
import { friendlyApiError } from '@core/api/friendly-error';
import { TERMINAL_RUN_STATUSES } from '@core/models/run.models';
import type { RunListItem, RunStatus } from '@core/models/run.models';
import type { RunSummaryResponse } from '@core/models/run-summary.models';
import type { QueueDepth } from '@core/models/pipeline-health.models';
import { StatusBadge } from '@shared/components/status-badge';

/** One status tile on the dashboard — count plus the route that filters to it. */
interface StatusTile {
  readonly status: RunStatus;
  readonly label: string;
  readonly count: number;
}

/** Display order for the status tiles — pipeline order, terminal states last. */
const STATUS_ORDER: ReadonlyArray<{ status: RunStatus; label: string }> = [
  { status: 'Pending', label: 'Pending' },
  { status: 'Chunking', label: 'Chunking' },
  { status: 'InProgress', label: 'In progress' },
  { status: 'Completed', label: 'Completed' },
  { status: 'CompletedWithErrors', label: 'With errors' },
  { status: 'Failed', label: 'Failed' },
];

/**
 * Dashboard / home page — the landing view for the admin UI.
 *
 * Composes two existing endpoints: GET /api/runs/summary (run counts by status +
 * most recent run) and GET /api/pipeline/health (queue depths, for the DLQ widget).
 * The two load independently so a failure in one doesn't blank the other.
 *
 * Read-only and lightweight: a single load on entry, with a manual Refresh. No
 * polling here — the pipeline-health page owns live queue monitoring; this is an
 * at-a-glance overview, not a monitor.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    StatusBadge,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly runsApi = inject(RunsApi);
  private readonly healthApi = inject(PipelineHealthApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  // --- Run summary ----------------------------------------------------------
  protected readonly summary = signal<RunSummaryResponse | null>(null);
  protected readonly summaryLoading = signal(true);
  protected readonly summaryError = signal<string | null>(null);

  // --- Queue health (for the DLQ widget) ------------------------------------
  protected readonly dlqs = signal<readonly QueueDepth[]>([]);
  protected readonly healthLoading = signal(true);
  protected readonly healthError = signal<string | null>(null);

  // --- Active runs (the non-terminal statuses) ------------------------------
  protected readonly activeRuns = signal<readonly RunListItem[]>([]);
  protected readonly activeLoading = signal(true);
  protected readonly activeError = signal<string | null>(null);

  /** The non-terminal statuses, queried for the active-runs list. */
  private static readonly ACTIVE_STATUSES: readonly RunStatus[] = [
    'Pending',
    'Chunking',
    'InProgress',
  ];

  /** Max active runs to show in the list before it gets unwieldy. */
  private static readonly ACTIVE_LIMIT = 10;

  /** Status tiles in display order, each carrying its count from the summary. */
  protected readonly tiles = computed<StatusTile[]>(() => {
    const counts = this.summary()?.counts ?? [];
    const byStatus = new Map(counts.map((c) => [c.status, c.count]));
    return STATUS_ORDER.map(({ status, label }) => ({
      status,
      label,
      count: byStatus.get(status) ?? 0,
    }));
  });

  /** Count of runs that are still active (non-terminal) — the "live" headline. */
  protected readonly activeCount = computed(() =>
    this.tiles()
      .filter((t) => !TERMINAL_RUN_STATUSES.has(t.status))
      .reduce((sum, t) => sum + t.count, 0),
  );

  /** DLQs with messages stuck in them — drives the health widget's alert state. */
  protected readonly stuckDlqs = computed(() =>
    this.dlqs().filter(
      (q) => q.configured && q.error === null && q.visibleMessages > 0,
    ),
  );

  constructor() {
    this.loadAll();
  }

  /** Loads the run summary, active runs, and queue health. */
  protected loadAll(): void {
    this.loadSummary();
    this.loadActiveRuns();
    this.loadHealth();
  }

  /**
   * Loads the currently-active runs. The history endpoint filters by a single
   * status, so this fans out one query per non-terminal status and merges the
   * results — newest first, capped at ACTIVE_LIMIT.
   */
  private loadActiveRuns(): void {
    this.activeLoading.set(true);
    this.activeError.set(null);

    const queries = DashboardPage.ACTIVE_STATUSES.map((status) =>
      this.runsApi.listRuns({ status }),
    );

    forkJoin(queries)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          // Flatten the per-status lists, sort newest-first (UploadedAt is an
          // ISO string so a string comparison is chronological), and cap.
          const merged = results
            .flat()
            .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
            .slice(0, DashboardPage.ACTIVE_LIMIT);
          this.activeRuns.set(merged);
          this.activeLoading.set(false);
        },
        error: (err: unknown) => {
          this.activeError.set(
            friendlyApiError(err, 'Active runs could not be loaded.'),
          );
          this.activeLoading.set(false);
        },
      });
  }

  private loadSummary(): void {
    this.summaryLoading.set(true);
    this.summaryError.set(null);

    this.runsApi
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.summary.set(response);
          this.summaryLoading.set(false);
        },
        error: (err: unknown) => {
          this.summaryError.set(
            friendlyApiError(err, 'The run summary could not be loaded.'),
          );
          this.summaryLoading.set(false);
        },
      });
  }

  private loadHealth(): void {
    this.healthLoading.set(true);
    this.healthError.set(null);

    this.healthApi
      .getHealth()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          // The dashboard widget only cares about the DLQs, not the source queue.
          this.dlqs.set(response.queues.filter((q) => q.role === 'dlq'));
          this.healthLoading.set(false);
        },
        error: (err: unknown) => {
          this.healthError.set(
            friendlyApiError(err, 'Queue health could not be loaded.'),
          );
          this.healthLoading.set(false);
        },
      });
  }

  /** Navigates to the run-history page filtered to one status. */
  protected openStatus(status: RunStatus): void {
    this.router.navigate(['/runs'], { queryParams: { status } });
  }

  /** Navigates to a single run's detail page. */
  protected openRun(run: RunListItem): void {
    this.router.navigate(['/runs', run.runId]);
  }
}
