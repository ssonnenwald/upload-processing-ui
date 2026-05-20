import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RunListItem, RunStatus } from '@core/models/run.models';
import { RunHistoryStore } from '@core/stores/run-history.store';
import { StatusBadgeComponent } from '@shared/components/status-badge.component';

/**
 * Selectable status filters. 'All' is intentionally NOT listed here — it is the
 * store's internal "nothing selected" sentinel and is never shown as an option.
 * The template maps 'All' to a null mat-select value so the placeholder shows.
 */
const STATUS_OPTIONS: ReadonlyArray<{
  value: RunStatus;
  label: string;
}> = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Chunking', label: 'Chunking' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Completed', label: 'Completed' },
  { value: 'CompletedWithErrors', label: 'Completed with errors' },
  { value: 'Failed', label: 'Failed' },
];

@Component({
  selector: 'app-run-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    StatusBadgeComponent,
  ],
  templateUrl: './run-history-page.component.html',
  styleUrl: './run-history-page.component.scss',
})
export class RunHistoryPageComponent {
  private readonly router = inject(Router);
  protected readonly history = inject(RunHistoryStore);

  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly columns = [
    'runId',
    'function',
    'status',
    'uploadedBy',
    'uploadedAt',
    'progress',
    'actions',
  ];

  constructor() {
    // Trigger the first load on page visit. The store caches across navigations,
    // so coming back to this page doesn't re-hit the API unless the user clicks
    // Refresh or changes a filter.
    this.history.ensureLoaded();
  }

  protected openRun(runId: string): void {
    void this.router.navigate(['/runs', runId]);
  }

  protected progressPercent(run: RunListItem): number {
    if (run.totalChunks <= 0) return 0;
    return Math.min(
      100,
      Math.round((run.chunksCompleted / run.totalChunks) * 100),
    );
  }
}
