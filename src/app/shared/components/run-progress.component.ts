import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/**
 * Progress bar showing chunk completion. Uses Material's determinate variant
 * when totals are known; flips to an indeterminate buffer while the orchestrator
 * is still chunking the file and totalChunks isn't yet established.
 */
@Component({
  selector: 'app-run-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressBarModule],
  template: `
    <div class="progress" role="group" [attr.aria-label]="ariaLabel()">
      <mat-progress-bar
        [mode]="mode()"
        [value]="percent()"
      />
      <div class="progress__caption">
        <span>{{ completed() }} / {{ total() }} chunks</span>
        <span>{{ percentLabel() }}</span>
      </div>
    </div>
  `,
  styles: `
    .progress { display: block; }
    .progress__caption {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
      margin-top: var(--up-space-1);
    }
  `,
})
export class RunProgressComponent {
  readonly completed = input.required<number>();
  readonly total = input.required<number>();

  protected mode = computed<'determinate' | 'indeterminate'>(() =>
    this.total() > 0 ? 'determinate' : 'indeterminate',
  );

  protected percent = computed(() => {
    const t = this.total();
    return t > 0 ? Math.min(100, Math.round((this.completed() / t) * 100)) : 0;
  });

  protected percentLabel = computed(() => `${this.percent()}%`);

  protected ariaLabel = computed(
    () => `Run progress: ${this.completed()} of ${this.total()} chunks complete`,
  );
}
