import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RunHistoryPage } from './run-history-page';
import { RunHistoryStore } from '@core/stores/run-history-store';
import type { RunListItem, RunStatus } from '@core/models/run.models';
import { makeRunListItem } from '@testing/factories';

/**
 * Stand-in for RunHistoryStore. The component calls `ensureLoaded()` and its
 * template reads filter/result signals — the fake exposes both as inert stubs.
 */
function makeFakeStore(): { ensureLoaded: Mock } & Record<string, unknown> {
  return {
    ensureLoaded: vi.fn(),
    // Template-read signals — inert values so rendering doesn't throw.
    filters: () => ({
      status: 'All' as RunStatus | 'All',
      uploadedBy: '',
      function: '',
    }),
    runsEntities: () => [],
    loading: () => false,
    error: () => null,
    hasFilters: () => false,
    isEmpty: () => false,
    awaitingFilter: () => true,
    // Template-bound setters / actions.
    setStatusFilter: vi.fn(),
    setUserFilter: vi.fn(),
    clearFilters: vi.fn(),
    refresh: vi.fn(),
  };
}

/** Typed view of the component's protected members the tests touch. */
interface Internals {
  statusOptions: ReadonlyArray<{ value: RunStatus; label: string }>;
  columns: readonly string[];
  openRun: (runId: string) => void;
  progressPercent: (run: RunListItem) => number;
}

describe('RunHistoryPage', () => {
  let fakeStore: { ensureLoaded: Mock };
  let router: { navigate: Mock };

  beforeEach(() => {
    fakeStore = makeFakeStore();
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      imports: [RunHistoryPage],
      providers: [
        // RunHistoryStore is providedIn:'root' — a module-level override
        // replaces it everywhere.
        { provide: RunHistoryStore, useValue: fakeStore },
        { provide: Router, useValue: router },
      ],
    });
  });

  /** Creates the component and returns a typed view of its internals. */
  function render(): Internals {
    const fixture = TestBed.createComponent(RunHistoryPage);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  it('calls ensureLoaded on the store when the page is created', () => {
    render();
    expect(fakeStore.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  describe('status options', () => {
    it('exposes the six selectable statuses', () => {
      const c = render();
      expect(c.statusOptions.map((o) => o.value)).toEqual([
        'Pending',
        'Chunking',
        'InProgress',
        'Completed',
        'CompletedWithErrors',
        'Failed',
      ]);
    });

    it('does not include the "All" sentinel as a selectable option', () => {
      const c = render();
      // 'All' is the store's internal sentinel — never a dropdown choice.
      expect(c.statusOptions.some((o) => (o.value as string) === 'All')).toBe(
        false,
      );
    });
  });

  describe('table columns', () => {
    it('declares the expected column order', () => {
      const c = render();
      expect(c.columns).toEqual([
        'runId',
        'function',
        'status',
        'uploadedBy',
        'uploadedAt',
        'progress',
        'actions',
      ]);
    });
  });

  describe('openRun', () => {
    it('navigates to the run detail page for the given id', () => {
      const c = render();
      c.openRun('RUN#xyz');
      expect(router.navigate).toHaveBeenCalledWith(['/runs', 'RUN#xyz']);
    });
  });

  describe('progressPercent', () => {
    it('computes a rounded percentage from completed / total chunks', () => {
      const c = render();
      const run = makeRunListItem({ totalChunks: 4, chunksCompleted: 1 });
      // 1/4 = 25%
      expect(c.progressPercent(run)).toBe(25);
    });

    it('rounds a fractional percentage to the nearest integer', () => {
      const c = render();
      const run = makeRunListItem({ totalChunks: 3, chunksCompleted: 1 });
      // 1/3 = 33.33% → 33
      expect(c.progressPercent(run)).toBe(33);
    });

    it('returns 100 for a fully completed run', () => {
      const c = render();
      const run = makeRunListItem({ totalChunks: 4, chunksCompleted: 4 });
      expect(c.progressPercent(run)).toBe(100);
    });

    it('returns 0 when totalChunks is zero (no divide-by-zero)', () => {
      const c = render();
      const run = makeRunListItem({ totalChunks: 0, chunksCompleted: 0 });
      expect(c.progressPercent(run)).toBe(0);
    });

    it('returns 0 when totalChunks is negative', () => {
      const c = render();
      // The guard is `totalChunks <= 0`, so a negative value is also caught.
      const run = makeRunListItem({ totalChunks: -1, chunksCompleted: 5 });
      expect(c.progressPercent(run)).toBe(0);
    });

    it('clamps to 100 when chunksCompleted exceeds totalChunks', () => {
      const c = render();
      // A late chunk count overshoot must not produce 125%.
      const run = makeRunListItem({ totalChunks: 4, chunksCompleted: 5 });
      expect(c.progressPercent(run)).toBe(100);
    });
  });
});
