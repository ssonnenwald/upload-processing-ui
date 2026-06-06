import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { RunStatusHub } from '@core/signalr/run-status-hub';
import { RunSummaryCard } from '@shared/components/run-summary-card';
import { ChunksTable } from '@shared/components/chunks-table';

/**
 * Live view of an in-flight run. The runId comes in as a route input thanks to
 * `withComponentInputBinding()` in the app config.
 *
 * The LiveRunStore is page-scoped (not providedIn root) so navigating away
 * tears down the SignalR subscription via the store's onDestroy hook.
 * The hub itself is app-scoped and stays open.
 */
@Component({
  selector: 'app-run-watcher-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    RunSummaryCard,
    ChunksTable,
  ],
  providers: [LiveRunStore],
  templateUrl: './run-watcher-page.html',
  styleUrl: './run-watcher-page.scss',
})
export class RunWatcherPage {
  protected readonly run = inject(LiveRunStore);
  protected readonly hub = inject(RunStatusHub);

  // Bound from /runs/:runId/watch — same name as the route param.
  readonly runId = input.required<string>();

  protected readonly hubState = this.hub.state;

  protected readonly statusMessage = computed(() => {
    if (this.run.snapshot() === null) return '';
    if (this.run.isTerminal()) {
      return `This run finished. Live updates have stopped — you're now viewing the final state.`;
    }
    return `Live updates are streaming in. This page will update on every chunk change.`;
  });

  constructor() {
    // Re-load whenever the route's runId changes. effect() tracks the input signal.
    effect(() => {
      const id = this.runId();
      if (id) this.run.load(id);
    });
  }
}
