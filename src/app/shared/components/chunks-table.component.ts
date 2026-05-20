import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChunkSummary } from '@core/models/run.models';
import { StatusBadgeComponent } from './status-badge.component';

/**
 * Renders the per-chunk breakdown. Used by both watcher and details pages.
 *
 * Data updates from SignalR mutate the chunks array on the parent's signal, so
 * this component reactively re-renders when chunks change — `track` on chunkSk
 * lets Angular reuse rows even as their status flips.
 */
@Component({
  selector: 'app-chunks-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatTooltipModule,
    StatusBadgeComponent,
  ],
  template: `
    <mat-card appearance="outlined" class="chunks">
      <mat-card-content>
        <header class="chunks__header">
          <h3>Chunks ({{ chunks().length }})</h3>
        </header>

        @if (chunks().length === 0) {
          <p class="chunks__empty">
            The orchestrator hasn't created chunks yet. They'll appear here as
            soon as the file is split.
          </p>
        } @else {
          <table mat-table [dataSource]="chunks()" class="chunks__table">
            <ng-container matColumnDef="index">
              <th mat-header-cell *matHeaderCellDef>#</th>
              <td mat-cell *matCellDef="let c">{{ c.chunkIndex }}</td>
            </ng-container>

            <ng-container matColumnDef="rows">
              <th mat-header-cell *matHeaderCellDef>Rows</th>
              <td mat-cell *matCellDef="let c" class="chunks__rows">
                {{ c.startingRow }}–{{ c.endingRow }}
              </td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let c">
                <app-status-badge [status]="c.status" />
              </td>
            </ng-container>

            <ng-container matColumnDef="attempts">
              <th mat-header-cell *matHeaderCellDef>Attempts</th>
              <td
                mat-cell
                *matCellDef="let c"
                [class.chunks__retry]="c.attemptCount > 1"
              >
                {{ c.attemptCount }}
              </td>
            </ng-container>

            <ng-container matColumnDef="succeeded">
              <th mat-header-cell *matHeaderCellDef>OK</th>
              <td mat-cell *matCellDef="let c">{{ c.succeeded }}</td>
            </ng-container>

            <ng-container matColumnDef="failedValid">
              <th mat-header-cell *matHeaderCellDef>Failed</th>
              <td
                mat-cell
                *matCellDef="let c"
                [class.chunks__has-failures]="c.failedValid > 0"
              >
                {{ c.failedValid }}
              </td>
            </ng-container>

            <ng-container matColumnDef="invalid">
              <th mat-header-cell *matHeaderCellDef>Invalid</th>
              <td
                mat-cell
                *matCellDef="let c"
                [class.chunks__has-failures]="c.invalid > 0"
              >
                {{ c.invalid }}
              </td>
            </ng-container>

            <ng-container matColumnDef="skipped">
              <th mat-header-cell *matHeaderCellDef>Skip</th>
              <td mat-cell *matCellDef="let c">{{ c.skipped }}</td>
            </ng-container>

            <ng-container matColumnDef="completedAt">
              <th mat-header-cell *matHeaderCellDef>Completed</th>
              <td mat-cell *matCellDef="let c">
                @if (c.completedAt) {
                  <span [matTooltip]="c.completedAt | date: 'medium'">
                    {{ c.completedAt | date: 'shortTime' }}
                  </span>
                } @else {
                  <span class="chunks__pending">—</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="error">
              <th mat-header-cell *matHeaderCellDef>Error</th>
              <td mat-cell *matCellDef="let c" class="chunks__error-cell">
                @if (c.errorSummary) {
                  <span [matTooltip]="c.errorSummary">{{
                    c.errorSummary
                  }}</span>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .chunks {
      display: block;
    }

    .chunks__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--up-space-2);

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
    }

    .chunks__empty {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
      padding: var(--up-space-3) 0;
      font-style: italic;
    }

    .chunks__table {
      width: 100%;
      font-variant-numeric: tabular-nums;
    }

    .chunks__rows {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .chunks__retry {
      color: var(--up-status-completedwitherrors);
      font-weight: 500;
    }

    .chunks__has-failures {
      color: var(--up-status-failed);
      font-weight: 500;
    }

    .chunks__pending {
      color: var(--mat-sys-on-surface-variant);
    }

    .chunks__error-cell {
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--up-status-failed);
      font-size: 12px;
    }
  `,
})
export class ChunksTableComponent {
  readonly chunks = input.required<readonly ChunkSummary[]>();

  protected readonly columns = [
    'index',
    'rows',
    'status',
    'attempts',
    'succeeded',
    'failedValid',
    'invalid',
    'skipped',
    'completedAt',
    'error',
  ];
}
