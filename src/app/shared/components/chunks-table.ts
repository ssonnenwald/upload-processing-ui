import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChunkSummary } from '@core/models/run.models';
import { StatusBadge } from './status-badge';
import {
  ChunkDetailsDialog,
  ChunkDetailsDialogData,
} from './chunk-details-dialog';

/**
 * Renders the per-chunk breakdown. Used by both watcher and details pages.
 *
 * Data updates from SignalR mutate the chunks array on the parent's signal, so
 * this component reactively re-renders when chunks change — `track` on chunkSk
 * lets Angular reuse rows even as their status flips.
 *
 * Each row has a drill-in action that opens <app-chunk-details-dialog> for the
 * chunk's per-row outcomes; that needs the runId, which the parent passes in.
 */
@Component({
  selector: 'app-chunks-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    StatusBadge,
  ],
  templateUrl: './chunks-table.html',
  styleUrl: './chunks-table.scss',
})
export class ChunksTable {
  readonly chunks = input.required<readonly ChunkSummary[]>();
  /** Needed to fetch per-chunk detail; passed in by the parent page. */
  readonly runId = input.required<string>();

  private readonly dialog = inject(MatDialog);

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
    'details',
  ];

  protected openDetails(chunk: ChunkSummary): void {
    this.dialog.open(ChunkDetailsDialog, {
      data: { runId: this.runId(), chunk } satisfies ChunkDetailsDialogData,
      width: 'min(900px, 95vw)',
      maxHeight: '85vh',
      autoFocus: false,
      // Tags the overlay pane so a global rule can clip the dialog SURFACE's
      // phantom horizontal scrollbar. The surface is a Material ancestor of
      // this component's host, so encapsulated styles can't reach it — the
      // override lives in global styles.scss, keyed off this class.
      panelClass: 'chunk-detail-panel',
    });
  }
}
