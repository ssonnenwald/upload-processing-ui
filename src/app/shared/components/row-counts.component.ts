import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Compact summary of the four row count categories from the upload definition:
 * succeeded / failedValid / invalid / skipped. The categories themselves are
 * fixed by the backend so encoding them here is fine; styling is via class so
 * tweaks happen in one place.
 */
@Component({
  selector: 'app-row-counts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="counts">
      <div class="count count--succeeded">
        <span class="count__value">{{ succeeded() }}</span>
        <span class="count__label">Succeeded</span>
      </div>
      <div class="count count--failed">
        <span class="count__value">{{ failedValid() }}</span>
        <span class="count__label">Failed</span>
      </div>
      <div class="count count--invalid">
        <span class="count__value">{{ invalid() }}</span>
        <span class="count__label">Invalid</span>
      </div>
      <div class="count count--skipped">
        <span class="count__value">{{ skipped() }}</span>
        <span class="count__label">Skipped</span>
      </div>
    </div>
  `,
  styles: `
    .counts {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--up-space-3);
    }
    .count {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--up-space-3);
      background: var(--mat-sys-surface-container);
      border-radius: var(--up-radius);
      border-left: 4px solid var(--count-color, var(--up-status-pending));
    }
    .count--succeeded { --count-color: var(--up-status-completed); }
    .count--failed    { --count-color: var(--up-status-failed); }
    .count--invalid   { --count-color: var(--up-status-completedwitherrors); }
    .count--skipped   { --count-color: var(--up-status-pending); }

    .count__value {
      font-size: 24px;
      font-weight: 500;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .count__label {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    @media (max-width: 640px) {
      .counts { grid-template-columns: repeat(2, 1fr); }
    }
  `,
})
export class RowCountsComponent {
  readonly succeeded = input.required<number>();
  readonly failedValid = input.required<number>();
  readonly invalid = input.required<number>();
  readonly skipped = input.required<number>();
}
