import { computed, inject, Signal } from '@angular/core';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  patchState,
  signalStore,
  type,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  entityConfig,
  setAllEntities,
  withEntities,
} from '@ngrx/signals/entities';
import {
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  pipe,
  switchMap,
} from 'rxjs';
import { tapResponse } from '@ngrx/operators';
import { RunsApi } from '../api/runs-api.service';
import { RunListItem, RunStatus } from '../models/run.models';
import { friendlyApiError } from '@core/api/friendly-error';

/**
 * Filter shape — kept as a single object so the rxMethod can listen to the
 * whole filter signal at once and switchMap on every change.
 *
 * `status: 'All'` is the "nothing selected" sentinel. The backend requires at
 * least one of status/uploadedBy, and an unfiltered run list could be very
 * large, so 'All' with no user is treated as a no-op query (empty table, no
 * request, no error) rather than "fetch everything".
 */
export interface RunHistoryFilters {
  readonly status: RunStatus | 'All';
  readonly uploadedBy: string;
  readonly function: string;
}

const runConfig = entityConfig({
  entity: type<RunListItem>(),
  collection: 'runs',
  selectId: (run) => run.runId,
});

/**
 * Empty entity payload, explicitly typed. `setAllEntities([], runConfig)` would
 * otherwise infer the entity type as `never` from the bare array literal, which
 * makes patchState reject it (EntityMap<never> vs EntityMap<RunListItem>).
 */
const NO_RUNS: readonly RunListItem[] = [];

interface RunHistoryState {
  readonly filters: RunHistoryFilters;
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastLoadedAt: string | null;
  /** Bumped on refresh() to force a re-fetch even if filters didn't change. */
  readonly refreshTick: number;
}

const initialState: RunHistoryState = {
  filters: { status: 'All', uploadedBy: '', function: '' },
  loading: false,
  error: null,
  lastLoadedAt: null,
  refreshTick: 0,
};

/**
 * True when the current filters constitute a query the backend will accept.
 * 'All' status with no uploadedBy is not a real query — the backend rejects
 * it, and we don't want to surface that 400 to the user.
 */
function hasQueryableFilter(f: RunHistoryFilters): boolean {
  return f.status !== 'All' || f.uploadedBy.trim().length > 0;
}

/**
 * Backs the /runs history page. State is provided at root so navigating away
 * and back preserves the user's filter selections and the loaded run list.
 *
 * Architecture:
 *   - filters live in state; setters patch state, the rxMethod observes
 *   - the rxMethod is bound to a (filters + refreshTick) computed signal so
 *     it reacts to both filter edits AND explicit refresh() calls
 *   - debounce + distinctUntilChanged inside the pipe prevents per-keystroke
 *     requests when the user types in the uploadedBy filter
 *   - when no real filter is set, the query short-circuits: it clears the
 *     table instead of calling the API
 */
export const RunHistoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withEntities(runConfig),
  withComputed((store) => ({
    hasFilters: computed(() => {
      const f = store.filters();
      return (
        f.status !== 'All' ||
        f.uploadedBy.trim().length > 0 ||
        f.function.length > 0
      );
    }),
    isEmpty: computed(
      () => !store.loading() && store.runsEntities().length === 0,
    ),
    /**
     * True when the table is empty simply because the user hasn't picked a
     * status or entered a user yet — lets the page show a "Select a status…"
     * prompt instead of a generic "no results" message.
     */
    awaitingFilter: computed(
      () => !store.loading() && !hasQueryableFilter(store.filters()),
    ),
  })),
  withMethods((store, api = inject(RunsApi)) => {
    // Combined query signal — anything the rxMethod cares about goes here.
    // refreshTick lets refresh() force a re-fetch with identical filters by
    // changing the signal value (distinctUntilChanged still dedupes the
    // *filter* portion via the comparator below).
    const query: Signal<{ filters: RunHistoryFilters; tick: number }> =
      computed(() => ({
        filters: store.filters(),
        tick: store.refreshTick(),
      }));

    // The rxMethod is invoked once below (with `query`) and stays subscribed
    // for the life of the store. Every time `query` produces a new value the
    // pipe re-runs with switchMap, cancelling any in-flight request.
    const runQuery = rxMethod<{ filters: RunHistoryFilters; tick: number }>(
      pipe(
        debounceTime(250),
        distinctUntilChanged(
          (a, b) =>
            a.tick === b.tick &&
            a.filters.status === b.filters.status &&
            a.filters.uploadedBy.trim() === b.filters.uploadedBy.trim() &&
            a.filters.function === b.filters.function,
        ),
        switchMap(({ filters }) => {
          // No real filter selected — clear the table and skip the request.
          // This covers the initial 'All' state and the user re-selecting
          // 'All' after browsing a specific status.
          if (!hasQueryableFilter(filters)) {
            patchState(store, setAllEntities([...NO_RUNS], runConfig), {
              loading: false,
              error: null,
              lastLoadedAt: null,
            });
            return EMPTY;
          }

          patchState(store, { loading: true, error: null });

          return api
            .listRuns({
              status: filters.status === 'All' ? undefined : filters.status,
              uploadedBy: filters.uploadedBy.trim() || undefined,
              function: filters.function || undefined,
              limit: 100,
            })
            .pipe(
              tapResponse({
                next: (rows) =>
                  patchState(store, setAllEntities([...rows], runConfig), {
                    loading: false,
                    lastLoadedAt: new Date().toISOString(),
                  }),
                // Clear stale rows on failure so a failed query never leaves
                // misleading data on screen alongside the error banner.
                error: (err: Error) =>
                  patchState(store, setAllEntities([...NO_RUNS], runConfig), {
                    loading: false,
                    error: friendlyApiError(
                      err,
                      'The run history could not be loaded.',
                    ),
                  }),
              }),
            );
        }),
      ),
    );

    // Tracks whether we've wired up the query signal yet — exposed via
    // ensureLoaded(). The first call hooks the rxMethod to the signal; later
    // calls are no-ops. We don't auto-fire on store creation because the store
    // is root-provided and we don't want a fetch before the page is visited.
    let wiredUp = false;

    return {
      setStatusFilter(status: RunStatus | 'All'): void {
        patchState(store, (s) => ({ filters: { ...s.filters, status } }));
      },
      setUserFilter(uploadedBy: string): void {
        patchState(store, (s) => ({ filters: { ...s.filters, uploadedBy } }));
      },
      setFunctionFilter(fn: string): void {
        patchState(store, (s) => ({ filters: { ...s.filters, function: fn } }));
      },
      clearFilters(): void {
        patchState(store, { filters: initialState.filters });
      },
      /** Force a re-fetch with the current filters (skip the dedupe). */
      refresh(): void {
        patchState(store, (s) => ({ refreshTick: s.refreshTick + 1 }));
      },
      /**
       * Wire the rxMethod to the query signal on first page visit. Idempotent —
       * subsequent calls do nothing. Called from the page component's
       * constructor (which is in injection context, required by rxMethod).
       */
      ensureLoaded(): void {
        if (wiredUp) return;
        wiredUp = true;
        runQuery(query);
      },
    };
  }),
);
