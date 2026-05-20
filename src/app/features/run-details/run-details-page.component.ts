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
import { LiveRunStore } from '@core/stores/live-run.store';
import { RunSummaryCardComponent } from '@shared/components/run-summary-card.component';
import { ChunksTableComponent } from '@shared/components/chunks-table.component';
import { ChunkTimelineComponent } from '@features/chunk-timeline/chunk-timeline.component';

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
    RunSummaryCardComponent,
    ChunksTableComponent,
    ChunkTimelineComponent,
  ],
  providers: [LiveRunStore],
  templateUrl: './run-details-page.component.html',
  styleUrl: './run-details-page.component.scss',
})
export class RunDetailsPageComponent {
  protected readonly run = inject(LiveRunStore);

  readonly runId = input.required<string>();

  constructor() {
    effect(() => {
      const id = this.runId();
      if (id) this.run.load(id);
    });
  }
}
