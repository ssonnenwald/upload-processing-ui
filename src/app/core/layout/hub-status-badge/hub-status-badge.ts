import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RunStatusHub } from '@core/signalr/run-status-hub';

/**
 * Live-connection indicator shown in the layout's nav footer.
 *
 * The hub connects lazily — it only opens a connection when a page subscribes
 * to a run — so before that the state is 'idle', shown neutrally as
 * "Live: ready" rather than the alarming "disconnected". 'disconnected' is
 * reserved for a connection that was established and then genuinely lost.
 */
@Component({
  selector: 'app-hub-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule],
  templateUrl: './hub-status-badge.html',
  styleUrl: './hub-status-badge.scss',
})
export class HubStatusBadge {
  private readonly hub = inject(RunStatusHub);

  protected readonly hubState = this.hub.state;

  /** Human-readable label for the live badge. */
  protected readonly hubLabel = computed(() => {
    switch (this.hubState()) {
      case 'connected':
        return 'Live: connected';
      case 'connecting':
        return 'Live: connecting\u2026';
      case 'reconnecting':
        return 'Live: reconnecting\u2026';
      case 'disconnected':
        return 'Live: disconnected';
      case 'idle':
      default:
        return 'Live: ready';
    }
  });

  /** Tooltip copy explaining the current state. */
  protected readonly hubTooltip = computed(() => {
    switch (this.hubState()) {
      case 'connected':
        return 'Live updates are flowing.';
      case 'reconnecting':
        return 'Lost the live connection \u2014 retrying.';
      case 'connecting':
        return 'Establishing the live connection.';
      case 'disconnected':
        return 'The live connection was lost. Updates will resume on reconnect.';
      case 'idle':
      default:
        return 'Live updates connect automatically when you open a run.';
    }
  });
}
