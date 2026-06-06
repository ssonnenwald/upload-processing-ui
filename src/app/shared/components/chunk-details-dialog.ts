import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChunkDetailsStore } from '@core/stores/chunk-details-store';
import {
  ChunkRowFilter,
  ChunkRowOutcome,
  ChunkSummary,
} from '@core/models/run.models';

/** Data handed to the dialog when opened from the chunks table. */
export interface ChunkDetailsDialogData {
  readonly runId: string;
  readonly chunk: ChunkSummary;
}

/**
 * Drill-in view for a single chunk: the per-row outcomes (row number, status,
 * reason) with a status filter. Opened from <app-chunks-table>. Loads its data
 * on construction via ChunkDetailsStore, which is provided per-dialog.
 *
 * The row list is virtualized with a CDK virtual-scroll viewport so a large
 * chunk (thousands of rows) only mounts the visible rows. A fixed CSS-grid
 * header sits above the viewport; rows share the same grid track definition so
 * columns stay aligned without a scrolling table.
 */
@Component({
  selector: 'app-chunk-details-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ScrollingModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  providers: [ChunkDetailsStore],
  templateUrl: './chunk-details-dialog.html',
  styleUrl: './chunk-details-dialog.scss',
})
export class ChunkDetailsDialog {
  protected readonly store = inject(ChunkDetailsStore);
  protected readonly data = inject<ChunkDetailsDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<ChunkDetailsDialog>,
  );

  /** Row height in px — must match the viewport's itemSize. */
  protected readonly rowHeight = 44;

  constructor() {
    const { runId, chunk } = this.data;
    this.store.load({ runId, chunkSk: chunk.chunkSk });
  }

  protected setFilter(filter: ChunkRowFilter): void {
    this.store.setFilter(filter);
  }

  protected trackRow = (_: number, row: ChunkRowOutcome): number => row.row;

  protected close(): void {
    this.dialogRef.close();
  }
}
