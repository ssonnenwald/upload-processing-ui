import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LiveRunStore } from '@core/stores/live-run-store';
import { RunSummaryCard } from '@shared/components/run-summary-card';
import { ChunksTable } from '@shared/components/chunks-table';
import { ChunkTimeline } from '@features/chunk-timeline/chunk-timeline';

/**
 * Drill-in view for a single run. Functionally similar to the watcher but:
 *   - default landing for completed runs (no "live" affordances at the top)
 *   - exposes a "Watch live" button if the run is still in flight
 *
 * Both pages use LiveRunStore. The store only opens a SignalR subscription if
 * the run is not yet terminal — so for a finished run, this page is REST-only.
 */
@Component({
  selector: 'app-run-details-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    RunSummaryCard,
    ChunksTable,
    ChunkTimeline,
  ],
  providers: [LiveRunStore],
  templateUrl: './run-details-page.html',
  styleUrl: './run-details-page.scss',
})
export class RunDetailsPage {
  protected readonly run = inject(LiveRunStore);

  readonly runId = input.required<string>();

  constructor() {
    effect(() => {
      const id = this.runId();
      if (id) this.run.load(id);
    });
  }
}
