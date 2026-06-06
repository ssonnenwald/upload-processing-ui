import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChunkStatus, RunStatus } from '@core/models/run.models';

/**
 * Colored pill that renders a run or chunk status. The color tokens map 1:1
 * onto the status strings via CSS so adding a new status only requires a
 * `--up-status-{name}` definition in styles.scss.
 */
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [attr.data-status]="statusKey()">
      {{ status() }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 500;
      line-height: 18px;
      border-radius: 999px;
      background: var(--badge-bg, var(--up-status-pending));
      color: white;
      letter-spacing: 0.2px;
      white-space: nowrap;
    }

    /*
     * Map each status enum value to its CSS variable. The data-status attribute
     * is the lower-cased status string so a single rule per value drives the bg.
     */
    .badge[data-status="pending"]             { --badge-bg: var(--up-status-pending); }
    .badge[data-status="chunking"]            { --badge-bg: var(--up-status-chunking); }
    .badge[data-status="inprogress"]          { --badge-bg: var(--up-status-inprogress); }
    .badge[data-status="succeeded"]           { --badge-bg: var(--up-status-succeeded); }
    .badge[data-status="completed"]           { --badge-bg: var(--up-status-completed); }
    .badge[data-status="completedwitherrors"] { --badge-bg: var(--up-status-completedwitherrors); }
    .badge[data-status="failed"]              { --badge-bg: var(--up-status-failed); }
  `,
})
export class StatusBadge {
  readonly status = input.required<RunStatus | ChunkStatus>();

  protected statusKey(): string {
    return this.status().toLowerCase();
  }
}
