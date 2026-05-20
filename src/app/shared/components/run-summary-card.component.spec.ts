import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { RunSummaryCardComponent } from './run-summary-card.component';
import type { RunDetailsResponse } from '@core/models/run.models';
import { makeRunDetails } from '@testing/factories';

/** Typed view of the component's protected helper. */
interface Internals {
  asEntries: (
    opts: Readonly<Record<string, unknown>>,
  ) => { key: string; value: unknown }[];
}

describe('RunSummaryCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RunSummaryCardComponent] });
  });

  /** Creates the component with a run input and returns element + internals. */
  function render(run: RunDetailsResponse): {
    el: HTMLElement;
    internals: Internals;
  } {
    const fixture = TestBed.createComponent(RunSummaryCardComponent);
    const ref = fixture.componentRef as ComponentRef<RunSummaryCardComponent>;
    ref.setInput('run', run);
    fixture.detectChanges();
    return {
      el: fixture.nativeElement as HTMLElement,
      internals: fixture.componentInstance as unknown as Internals,
    };
  }

  it('creates', () => {
    const { internals } = render(makeRunDetails());
    expect(internals).toBeTruthy();
  });

  describe('header', () => {
    it('shows the function name and run id', () => {
      const { el } = render(
        makeRunDetails({ function: 'PID_RECALC', runId: 'RUN#abc' }),
      );
      expect(el.querySelector('.summary__function')?.textContent).toContain(
        'PID_RECALC',
      );
      expect(el.querySelector('.summary__run-id')?.textContent).toContain(
        'RUN#abc',
      );
    });

    it('renders the status badge child', () => {
      const { el } = render(makeRunDetails());
      expect(el.querySelector('app-status-badge')).not.toBeNull();
    });
  });

  describe('meta fields', () => {
    it('shows the uploader name', () => {
      const { el } = render(makeRunDetails({ uploadedBy: 'asmith' }));
      expect(el.textContent).toContain('asmith');
    });

    it('shows the Started field when startedAt is present', () => {
      const { el } = render(
        makeRunDetails({ startedAt: '2026-05-17T22:24:00Z' }),
      );
      expect(el.textContent).toContain('Started');
    });

    it('omits the Started field when startedAt is null', () => {
      const { el } = render(makeRunDetails({ startedAt: null }));
      expect(el.textContent).not.toContain('Started');
    });

    it('shows the Completed field when completedAt is present', () => {
      const { el } = render(
        makeRunDetails({ completedAt: '2026-05-17T22:25:00Z' }),
      );
      expect(el.textContent).toContain('Completed');
    });

    it('omits the Completed field when completedAt is null', () => {
      // A still-running run has no completedAt — the row must not render.
      const { el } = render(
        makeRunDetails({ status: 'InProgress', completedAt: null }),
      );
      // 'Completed' must not appear as a meta label. (The status here is
      // 'InProgress', so the badge text won't reintroduce the word.)
      expect(el.textContent).not.toContain('Completed');
    });
  });

  describe('child components', () => {
    it('renders the progress and row-counts children', () => {
      const { el } = render(makeRunDetails());
      expect(el.querySelector('app-run-progress')).not.toBeNull();
      expect(el.querySelector('app-row-counts')).not.toBeNull();
    });
  });

  describe('options section', () => {
    it('is hidden when the run has no options', () => {
      const { el } = render(makeRunDetails({ options: {} }));
      expect(el.querySelector('.summary__options')).toBeNull();
    });

    it('is shown when the run carries options', () => {
      const { el } = render(makeRunDetails({ options: { recalcAll: true } }));
      expect(el.querySelector('.summary__options')).not.toBeNull();
    });

    it('renders one list item per option', () => {
      const { el } = render(
        makeRunDetails({
          options: { recalcAll: true, dryRun: false, mode: 'fast' },
        }),
      );
      expect(el.querySelectorAll('.summary__options li')).toHaveLength(3);
    });
  });

  describe('asEntries helper', () => {
    it('returns an empty array for empty options', () => {
      const { internals } = render(makeRunDetails());
      expect(internals.asEntries({})).toEqual([]);
    });

    it('maps each option to a key/value pair', () => {
      const { internals } = render(makeRunDetails());
      expect(internals.asEntries({ a: 1, b: 'two' })).toEqual([
        { key: 'a', value: 1 },
        { key: 'b', value: 'two' },
      ]);
    });

    it('preserves the insertion order of the options object', () => {
      // The helper exists specifically to keep the backend's JSON order —
      // the keyvalue pipe would sort alphabetically instead.
      const { internals } = render(makeRunDetails());
      const ordered = internals.asEntries({ zebra: 1, alpha: 2, mike: 3 });
      expect(ordered.map((e) => e.key)).toEqual(['zebra', 'alpha', 'mike']);
    });
  });
});
