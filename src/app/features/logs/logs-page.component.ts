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
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { LogsApi } from '@core/api/logs-api.service';
import { friendlyApiError } from '@core/api/friendly-error';
import type {
  LogEventsResponse,
  LogGroupCatalogEntry,
  LogMinLevel,
} from '@core/models/logs.models';
import { JsonTreeComponent } from './json-tree.component';

/** minLevel options for the severity-floor dropdown. */
const MIN_LEVEL_OPTIONS: ReadonlyArray<{
  value: LogMinLevel | 'All';
  label: string;
}> = [
  { value: 'All', label: 'All levels' },
  { value: 'Debug', label: 'Debug and above' },
  { value: 'Information', label: 'Information and above' },
  { value: 'Warning', label: 'Warning and above' },
  { value: 'Error', label: 'Error and above' },
  { value: 'Critical', label: 'Critical only' },
];

/** Lookback-window options for the sinceMinutes filter. */
const SINCE_OPTIONS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: 'All time' },
  { value: 15, label: 'Last 15 minutes' },
  { value: 60, label: 'Last hour' },
  { value: 240, label: 'Last 4 hours' },
  { value: 1440, label: 'Last 24 hours' },
];

/**
 * Diagnostics page: reads CloudWatch logs for the pipeline Lambdas via
 * LogsController and renders the parsed events.
 *
 * This is the UI counterpart of Get-UploadProcessingLogs.ps1 — the same log
 * groups, the same JSON-block detection and severity classification, the same
 * stream-count / minLevel / runId controls — but in the browser instead of a
 * console. Heavy console-only features of the script (the plain-text -OutFile
 * copy, the DynamoDB CHUNK# scan) are intentionally not duplicated here; the
 * DynamoDB side already lives on the run details page.
 *
 * State is signal-based and the data fetch is imperative (a button-driven
 * load) rather than resource()-based, because a log read is an explicit
 * diagnostic action — we don't want it re-firing on every control change.
 */
@Component({
  selector: 'app-logs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    JsonTreeComponent,
  ],
  templateUrl: './logs-page.component.html',
  styleUrl: './logs-page.component.scss',
})
export class LogsPageComponent {
  private readonly api = inject(LogsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly minLevelOptions = MIN_LEVEL_OPTIONS;
  protected readonly sinceOptions = SINCE_OPTIONS;

  // --- Catalog of known log groups ------------------------------------------
  protected readonly functions = signal<readonly LogGroupCatalogEntry[]>([]);
  protected readonly catalogLoading = signal(true);
  protected readonly catalogError = signal<string | null>(null);

  // --- Filter state ---------------------------------------------------------
  protected readonly selectedGroup = signal<string | null>(null);
  protected readonly streams = signal<number>(1);
  protected readonly minLevel = signal<LogMinLevel | 'All'>('All');
  protected readonly sinceMinutes = signal<number | null>(null);
  protected readonly runId = signal<string>('');

  // --- Results --------------------------------------------------------------
  protected readonly result = signal<LogEventsResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** True once a fetch has completed (success or failure) — drives empty state. */
  protected readonly hasFetched = signal(false);

  /** The friendly name of the selected group, for the results header. */
  protected readonly selectedGroupName = computed(() => {
    const group = this.selectedGroup();
    return this.functions().find((f) => f.group === group)?.name ?? group ?? '';
  });

  /** Total event count across all streams in the current result. */
  protected readonly totalEvents = computed(() =>
    (this.result()?.streams ?? []).reduce((sum, s) => sum + s.events.length, 0),
  );

  /** Disable the Load button until a group is chosen and no fetch is running. */
  protected readonly canLoad = computed(
    () => this.selectedGroup() !== null && !this.loading(),
  );

  constructor() {
    this.loadCatalog();
  }

  /** Fetches the known pipeline log groups for the picker. */
  private loadCatalog(): void {
    this.catalogLoading.set(true);
    this.catalogError.set(null);

    this.api
      .listFunctions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (functions) => {
          this.functions.set(functions);
          // Pre-select the first group so the page is one click from useful.
          if (functions.length > 0 && this.selectedGroup() === null) {
            this.selectedGroup.set(functions[0].group);
          }
          this.catalogLoading.set(false);
        },
        error: (err: unknown) => {
          this.catalogError.set(
            friendlyApiError(err, 'The log group list could not be loaded.'),
          );
          this.catalogLoading.set(false);
        },
      });
  }

  /** Retry handler for a failed catalog load. */
  protected retryCatalog(): void {
    this.loadCatalog();
  }

  /** Fetches and parses log events for the current filter selection. */
  protected loadLogs(): void {
    const group = this.selectedGroup();
    if (group === null) return;

    this.loading.set(true);
    this.error.set(null);

    const minLevel = this.minLevel();
    const trimmedRunId = this.runId().trim();

    this.api
      .getEvents({
        group,
        streams: this.streams(),
        minLevel: minLevel === 'All' ? undefined : minLevel,
        runId: trimmedRunId === '' ? undefined : trimmedRunId,
        sinceMinutes: this.sinceMinutes() ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.result.set(response);
          this.loading.set(false);
          this.hasFetched.set(true);
        },
        error: (err: unknown) => {
          this.result.set(null);
          this.error.set(
            friendlyApiError(err, 'The logs could not be loaded.'),
          );
          this.loading.set(false);
          this.hasFetched.set(true);
        },
      });
  }
}
