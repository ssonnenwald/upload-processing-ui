import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { RunHistoryStore } from './run-history.store';
import { RunsApi } from '../api/runs-api.service';
import { makeRunListItem } from '@testing/factories';

/** RunsApi double — only listRuns is used by this store. */
interface RunsApiMock {
  listRuns: Mock;
}

/** Past the 250ms debounce so a queued query actually fires. */
const DEBOUNCE_MS = 300;

describe('RunHistoryStore', () => {
  let store: InstanceType<typeof RunHistoryStore>;
  let api: RunsApiMock;

  beforeEach(() => {
    vi.useFakeTimers();
    api = { listRuns: vi.fn().mockReturnValue(of([])) };
    TestBed.configureTestingModule({
      providers: [{ provide: RunsApi, useValue: api }],
    });
    store = TestBed.inject(RunHistoryStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Advances past the debounce window so the rxMethod pipeline runs. */
  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  }

  /**
   * Wires the store's query pipeline. `ensureLoaded` feeds a signal into an
   * @ngrx/signals rxMethod; doing that outside an injection context is
   * deprecated, so run it inside one. Use this instead of calling
   * `store.ensureLoaded()` directly.
   */
  function ensureLoaded(): void {
    TestBed.runInInjectionContext(() => store.ensureLoaded());
  }

  it('starts with the default filters and no runs', () => {
    expect(store.filters()).toEqual({
      status: 'All',
      uploadedBy: '',
      function: '',
    });
    expect(store.runsEntities()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  describe('awaitingFilter / hasFilters computeds', () => {
    it('reports awaitingFilter when no real filter is set', () => {
      // Default state: status 'All', no user — not a queryable filter.
      expect(store.awaitingFilter()).toBe(true);
      expect(store.hasFilters()).toBe(false);
    });

    it('clears awaitingFilter once a status is chosen', () => {
      store.setStatusFilter('Completed');
      expect(store.awaitingFilter()).toBe(false);
      expect(store.hasFilters()).toBe(true);
    });

    it('clears awaitingFilter once a user is entered', () => {
      store.setUserFilter('jdoe');
      expect(store.awaitingFilter()).toBe(false);
    });

    it('a whitespace-only user does not count as a real filter', () => {
      store.setUserFilter('   ');
      expect(store.awaitingFilter()).toBe(true);
    });
  });

  describe('the "All" sentinel', () => {
    it('does not call the API while status is "All" and no user is set', async () => {
      ensureLoaded();
      await settle();

      // 'All' with no user is a no-op query — the backend would reject it.
      expect(api.listRuns).not.toHaveBeenCalled();
    });

    it('fetches once a real status filter is applied', async () => {
      ensureLoaded();
      store.setStatusFilter('Completed');
      await settle();

      expect(api.listRuns).toHaveBeenCalledTimes(1);
      expect(api.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Completed' }),
      );
    });

    it('translates "All" to an undefined status when a user IS set', async () => {
      ensureLoaded();
      store.setUserFilter('jdoe');
      await settle();

      // status 'All' must not be sent as a literal — it becomes undefined.
      expect(api.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined, uploadedBy: 'jdoe' }),
      );
    });

    it('clears the table and issues no request when status returns to "All"', async () => {
      ensureLoaded();

      // First load some data with a real filter.
      api.listRuns.mockReturnValue(of([makeRunListItem({ runId: 'RUN#1' })]));
      store.setStatusFilter('Completed');
      await settle();
      expect(store.runsEntities()).toHaveLength(1);

      // Re-selecting 'All' must wipe the rows and not call the API again.
      api.listRuns.mockClear();
      store.setStatusFilter('All');
      await settle();

      expect(api.listRuns).not.toHaveBeenCalled();
      expect(store.runsEntities()).toEqual([]);
      expect(store.error()).toBeNull();
    });
  });

  describe('fetching with filters', () => {
    it('populates the runs collection on a successful response', async () => {
      api.listRuns.mockReturnValue(
        of([
          makeRunListItem({ runId: 'RUN#1' }),
          makeRunListItem({ runId: 'RUN#2' }),
        ]),
      );
      ensureLoaded();
      store.setStatusFilter('Completed');
      await settle();

      expect(store.runsEntities()).toHaveLength(2);
      expect(store.loading()).toBe(false);
      expect(store.lastLoadedAt()).not.toBeNull();
    });

    it('sends a limit of 100 with every query', async () => {
      ensureLoaded();
      store.setStatusFilter('Failed');
      await settle();

      expect(api.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('trims the uploadedBy value before sending it', async () => {
      ensureLoaded();
      store.setUserFilter('  jdoe  ');
      await settle();

      expect(api.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ uploadedBy: 'jdoe' }),
      );
    });

    it('debounces rapid filter edits into a single request', async () => {
      ensureLoaded();

      // Three quick edits within the debounce window.
      store.setUserFilter('j');
      store.setUserFilter('jd');
      store.setUserFilter('jdoe');
      await settle();

      // Only the final value should reach the API.
      expect(api.listRuns).toHaveBeenCalledTimes(1);
      expect(api.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ uploadedBy: 'jdoe' }),
      );
    });
  });

  describe('error handling', () => {
    it('sets a friendly error and clears loading on failure', async () => {
      api.listRuns.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 500,
              statusText: 'Internal Server Error',
            }),
        ),
      );
      ensureLoaded();
      store.setStatusFilter('Completed');
      await settle();

      expect(store.error()).not.toBeNull();
      expect(store.loading()).toBe(false);
    });

    it('clears stale rows when a query fails', async () => {
      ensureLoaded();

      // Load good data first.
      api.listRuns.mockReturnValue(of([makeRunListItem({ runId: 'RUN#1' })]));
      store.setStatusFilter('Completed');
      await settle();
      expect(store.runsEntities()).toHaveLength(1);

      // Next query fails — the table must not keep the old rows.
      api.listRuns.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 503, statusText: 'Down' }),
        ),
      );
      store.setStatusFilter('Failed');
      await settle();

      expect(store.runsEntities()).toEqual([]);
      expect(store.error()).not.toBeNull();
    });
  });

  describe('refresh', () => {
    it('re-fetches with identical filters when refresh is called', async () => {
      ensureLoaded();
      store.setStatusFilter('Completed');
      await settle();
      expect(api.listRuns).toHaveBeenCalledTimes(1);

      // distinctUntilChanged would dedupe an identical filter set; the
      // refreshTick bump forces the query through anyway.
      store.refresh();
      await settle();

      expect(api.listRuns).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearFilters', () => {
    it('resets filters to the default "All" sentinel', () => {
      store.setStatusFilter('Completed');
      store.setUserFilter('jdoe');

      store.clearFilters();

      expect(store.filters()).toEqual({
        status: 'All',
        uploadedBy: '',
        function: '',
      });
      expect(store.awaitingFilter()).toBe(true);
    });
  });

  describe('ensureLoaded', () => {
    it('does not fetch before ensureLoaded is called', async () => {
      // Filters change, but the rxMethod is not yet wired to the query signal.
      store.setStatusFilter('Completed');
      await settle();

      expect(api.listRuns).not.toHaveBeenCalled();
    });

    it('is idempotent — calling it twice wires the query only once', async () => {
      ensureLoaded();
      ensureLoaded();
      store.setStatusFilter('Completed');
      await settle();

      // A double-wire would produce two subscriptions and two requests.
      expect(api.listRuns).toHaveBeenCalledTimes(1);
    });
  });
});
