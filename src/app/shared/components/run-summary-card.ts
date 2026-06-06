import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { RunDetailsResponse } from '@core/models/run.models';
import { StatusBadge } from './status-badge';
import { RunProgress } from './run-progress';
import { RowCounts } from './row-counts';

/**
 * Header card showing run-level summary info — used identically by the watcher
 * and details pages, so it lives in `shared/`. Pure render component: the data
 * comes in via input(), nothing fetches from here.
 */
@Component({
  selector: 'app-run-summary-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatCardModule,
    StatusBadge,
    RunProgress,
    RowCounts,
  ],
  template: `
    @let r = run();
    <mat-card appearance="outlined" class="summary">
      <mat-card-content>
        <header class="summary__header">
          <div class="summary__title">
            <h2 class="summary__function">{{ r.function }}</h2>
            <code class="summary__run-id">{{ r.runId }}</code>
          </div>
          <app-status-badge [status]="r.status" />
        </header>

        <div class="summary__meta">
          <div class="summary__meta-item">
            <span class="summary__meta-label">Uploaded by</span>
            <span>{{ r.uploadedBy }}</span>
          </div>
          <div class="summary__meta-item">
            <span class="summary__meta-label">Uploaded</span>
            <span>{{ r.uploadedAt | date:'medium' }}</span>
          </div>
          @if (r.startedAt) {
            <div class="summary__meta-item">
              <span class="summary__meta-label">Started</span>
              <span>{{ r.startedAt | date:'medium' }}</span>
            </div>
          }
          @if (r.completedAt) {
            <div class="summary__meta-item">
              <span class="summary__meta-label">Completed</span>
              <span>{{ r.completedAt | date:'medium' }}</span>
            </div>
          }
          <div class="summary__meta-item">
            <span class="summary__meta-label">Total rows</span>
            <span>{{ r.totalRows | number }}</span>
          </div>
        </div>

        <div class="summary__progress">
          <app-run-progress
            [completed]="r.chunksCompleted"
            [total]="r.totalChunks"
          />
        </div>

        <app-row-counts
          [succeeded]="r.succeeded"
          [failedValid]="r.failedValid"
          [invalid]="r.invalid"
          [skipped]="r.skipped"
        />

        @if (asEntries(r.options).length > 0) {
          <div class="summary__options">
            <span class="summary__options-label">Options</span>
            <ul>
              @for (entry of asEntries(r.options); track entry.key) {
                <li>
                  <code>{{ entry.key }}</code>: {{ entry.value }}
                </li>
              }
            </ul>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .summary { display: block; }

    .summary__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--up-space-3);
      margin-bottom: var(--up-space-3);
    }

    .summary__title { min-width: 0; }

    .summary__function {
      font-size: 22px;
      font-weight: 500;
      margin: 0 0 4px;
    }

    .summary__run-id {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .summary__meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--up-space-3);
      padding: var(--up-space-3) 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .summary__meta-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 14px;
    }

    .summary__meta-label {
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary__progress {
      padding: var(--up-space-3) 0;
    }

    .summary__options {
      margin-top: var(--up-space-3);
      padding-top: var(--up-space-3);
      border-top: 1px solid var(--mat-sys-outline-variant);
      font-size: 13px;
    }

    .summary__options-label {
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: var(--up-space-1);
    }

    .summary__options ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--up-space-2) var(--up-space-3);
    }

    .summary__options code {
      background: var(--mat-sys-surface-container);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 11px;
    }
  `,
})
export class RunSummaryCard {
  readonly run = input.required<RunDetailsResponse>();

  /**
   * Helper that turns options into an array of {key, value} for @for tracking.
   * Using the keyvalue pipe directly would order alphabetically by default;
   * the JSON insertion order from the backend is more meaningful here.
   */
  protected asEntries(opts: Readonly<Record<string, unknown>>): { key: string; value: unknown }[] {
    return Object.entries(opts).map(([key, value]) => ({ key, value }));
  }
}
