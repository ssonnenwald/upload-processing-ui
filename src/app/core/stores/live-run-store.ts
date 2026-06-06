import { computed, inject } from '@angular/core';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  patchState,
  signalStore,
  type,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  entityConfig,
  setAllEntities,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import {
  pipe,
  switchMap,
  tap,
  timer,
  retry,
  Subscription,
  throwError,
  EMPTY,
} from 'rxjs';
import { tapResponse } from '@ngrx/operators';
import { RunsApi } from '../api/runs-api';
import { RunStatusHub, RunEvent } from '../signalr/run-status-hub';
import {
  ChunkSummary,
  ChunkUpdate,
  RunDetailsResponse,
  RunStatus,
  RunStatusChanged,
  RunSummary,
  TERMINAL_RUN_STATUSES,
} from '../models/run.models';
import { friendlyApiError } from '@core/api/friendly-error';

const chunkConfig = entityConfig({
  entity: type<ChunkSummary>(),
  collection: 'chunks',
  selectId: (c) => c.chunkSk,
});

/**
 * Run-level fields. Chunks are managed separately via withEntities so SignalR
 * chunkUpdated events can mutate a single chunk in O(1) without rebuilding
 * the full array.
 */
interface LiveRunState {
  readonly runId: string | null;
  readonly function: string;
  readonly status: RunStatus | null;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly totalRows: number;
  readonly totalChunks: number;
  readonly chunksCompleted: number;
  readonly succeeded: number;
  readonly failedValid: number;
  readonly invalid: number;
  readonly skipped: number;
  readonly options: Readonly<Record<string, unknown>>;

  readonly loading: boolean;
  readonly error: string | null;

  // Track which runId we're currently subscribed to on the hub so we can
  // unsubscribe cleanly when load() is called for a different run.
  readonly subscribedRunId: string | null;

  // The runId of an in-flight load() (REST fetch + 404 retry loop) that has
  // not yet hydrated. Distinct from `runId`, which is only set once the
  // snapshot lands. Used to make load() idempotent so a re-invocation with
  // the same id (effect re-run, router re-eval) does NOT reset state and
  // restart the retry sequence — which previously exhausted the retry budget
  // and produced a spurious "run not found" on slow (e.g. 1M-row) uploads.
  readonly loadingRunId: string | null;
}

const initialState: LiveRunState = {
  runId: null,
  function: '',
  status: null,
  uploadedBy: '',
  uploadedAt: '',
  startedAt: null,
  completedAt: null,
  totalRows: 0,
  totalChunks: 0,
  chunksCompleted: 0,
  succeeded: 0,
  failedValid: 0,
  invalid: 0,
  skipped: 0,
  options: {},
  loading: false,
  error: null,
  subscribedRunId: null,
  loadingRunId: null,
};

/**
 * Per-page store for one run's live state. NOT provided in root — pages put it
 * in their `providers` array so each page gets its own instance and destroying
 * the page tears down the SignalR subscription.
 *
 * Lifecycle:
 *   - load(runId): opens the SignalR subscription immediately, then fetches
 *     initial state via REST (retrying 404s while the orchestrator is still
 *     writing RUN#META). Events that arrive before the snapshot lands are
 *     buffered and replayed on hydrate.
 *   - Folds chunkUpdated / runStatusChanged / runCompleted events into state.
 *   - onDestroy tears down the subscription.
 */
export const LiveRunStore = signalStore(
  withState(initialState),
  withEntities(chunkConfig),
  withComputed((store) => ({
    isTerminal: computed(() => {
      const s = store.status();
      return s !== null && TERMINAL_RUN_STATUSES.has(s);
    }),
    /**
     * Composite "is this a live page" flag for templates: we have a run, it's
     * loaded, and it isn't finished yet. Drives the live-banner pulse.
     */
    isLive: computed(() => {
      const s = store.status();
      return s !== null && !TERMINAL_RUN_STATUSES.has(s);
    }),
    /**
     * Re-assembles the flat store state plus chunks entities into a
     * RunDetailsResponse-shaped object. The shared <app-run-summary-card> and
     * <app-chunks-table> components keep their existing input contracts and
     * don't need to know about the store.
     *
     * Returns null when no run is loaded so templates can guard with @if.
     */
    snapshot: computed<RunDetailsResponse | null>(() => {
      const runId = store.runId();
      const status = store.status();
      if (!runId || !status) return null;
      return {
        runId,
        function: store.function(),
        status,
        uploadedBy: store.uploadedBy(),
        uploadedAt: store.uploadedAt(),
        startedAt: store.startedAt(),
        completedAt: store.completedAt(),
        totalRows: store.totalRows(),
        totalChunks: store.totalChunks(),
        chunksCompleted: store.chunksCompleted(),
        succeeded: store.succeeded(),
        failedValid: store.failedValid(),
        invalid: store.invalid(),
        skipped: store.skipped(),
        options: store.options(),
        chunks: store.chunksEntities(),
      };
    }),
  })),
  withMethods((store, api = inject(RunsApi), hub = inject(RunStatusHub)) => {
    // The current hub subscription, held outside the store state so it's not
    // tracked reactively (an RxJS Subscription has no business in a signal).
    let hubSub: Subscription | null = null;

    // SignalR events that arrived before the REST snapshot hydrated. Drained
    // (replayed in order) at the end of hydrateFromSnapshot. Held outside
    // store state — it's transient plumbing, not reactive UI state.
    let pendingEvents: RunEvent[] = [];

    const stopWatching = (): void => {
      hubSub?.unsubscribe();
      hubSub = null;
      patchState(store, { subscribedRunId: null });
    };

    const applyChunkUpdate = (update: ChunkUpdate): void => {
      if (store.runId() !== update.runId) return;
      patchState(
        store,
        updateEntity(
          {
            id: update.chunkSk,
            changes: {
              status: update.status,
              attemptCount: update.attemptCount,
              succeeded: update.succeeded,
              failedValid: update.failedValid,
              invalid: update.invalid,
              skipped: update.skipped,
              errorSummary: update.errorSummary,
              completedAt: update.completedAt,
            },
          },
          chunkConfig,
        ),
      );
    };

    const applyStatusChange = (change: RunStatusChanged): void => {
      if (store.runId() !== change.runId) return;
      patchState(store, {
        status: change.status,
        chunksCompleted: change.chunksCompleted,
        totalChunks: change.totalChunks,
        succeeded: change.succeeded,
        failedValid: change.failedValid,
        invalid: change.invalid,
        skipped: change.skipped,
      });
    };

    const applyCompletion = (summary: RunSummary): void => {
      if (store.runId() !== summary.runId) return;
      patchState(store, {
        status: summary.status,
        completedAt: summary.completedAt,
        totalChunks: summary.totalChunks,
        succeeded: summary.succeeded,
        failedValid: summary.failedValid,
        invalid: summary.invalid,
        skipped: summary.skipped,
      });
      stopWatching();
    };

    const handleEvent = (event: RunEvent): void => {
      // The subscription opens before the REST snapshot resolves, so events
      // can arrive while runId is still null. Buffer those and replay after
      // hydrate; otherwise they'd be dropped (updateEntity is a no-op for an
      // unknown id, and the apply* guards reject a non-matching runId).
      if (store.runId() === null) {
        pendingEvents.push(event);
        return;
      }
      dispatchEvent(event);
    };

    const dispatchEvent = (event: RunEvent): void => {
      switch (event.kind) {
        case 'chunkUpdated':
          applyChunkUpdate(event.payload);
          break;
        case 'runStatusChanged':
          applyStatusChange(event.payload);
          break;
        case 'runCompleted':
          applyCompletion(event.payload);
          break;
      }
    };

    const startWatching = (runId: string): void => {
      stopWatching();
      pendingEvents = [];
      hubSub = hub.watchRun(runId).subscribe(handleEvent);
      patchState(store, { subscribedRunId: runId });
    };

    // Hydrate state from the REST response. Chunks become entities, then any
    // SignalR events that arrived during the load are replayed in order.
    const hydrateFromSnapshot = (run: RunDetailsResponse): void => {
      patchState(
        store,
        {
          runId: run.runId,
          function: run.function,
          status: run.status,
          uploadedBy: run.uploadedBy,
          uploadedAt: run.uploadedAt,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          totalRows: run.totalRows,
          totalChunks: run.totalChunks,
          chunksCompleted: run.chunksCompleted,
          succeeded: run.succeeded,
          failedValid: run.failedValid,
          invalid: run.invalid,
          skipped: run.skipped,
          options: run.options,
          loading: false,
          error: null,
          loadingRunId: null,
        },
        setAllEntities([...run.chunks], chunkConfig),
      );

      // Drain buffered events now that runId is set. Replay in arrival order;
      // each is idempotent (last-write-wins on the entity / run fields), so
      // an event that duplicates snapshot data is harmless.
      const buffered = pendingEvents;
      pendingEvents = [];
      for (const event of buffered) {
        dispatchEvent(event);
      }
    };

    return {
      /**
       * Load a run and start watching it live. Idempotent for the same runId:
       * if the run is already loaded, or a load for that same id is already
       * in flight (mid 404-retry), this is a no-op — it will NOT reset state
       * or restart the retry sequence.
       */
      load: rxMethod<string>(
        pipe(
          tap((runId) => {
            // Already loaded, or already loading, this exact run → ignore.
            if (store.runId() === runId || store.loadingRunId() === runId) {
              return;
            }
            // Switching to a different run (or first load): reset, then open
            // the SignalR subscription immediately so no early events are lost
            // while the REST snapshot is still being fetched/retried.
            patchState(store, {
              ...initialState,
              loadingRunId: runId,
              loading: true,
            });
            startWatching(runId);
          }),
          switchMap((runId) => {
            // Guard against switchMap restarting the pipeline for a run that's
            // already loaded or already loading — return EMPTY so the in-flight
            // REST + retry sequence is left untouched.
            if (store.runId() === runId || store.loadingRunId() !== runId) {
              return EMPTY;
            }
            return api.getRun(runId).pipe(
              // A freshly-submitted run races the watcher page: the UI navigates
              // here the instant the upload API returns, but the orchestrator
              // Lambda hasn't yet written the RUN#META row, so getRun 404s. For
              // a large file (e.g. 1M rows / 200 chunks) chunking can take ~30s+,
              // so retry generously. Only 404 is retried; other errors fail fast.
              retry({
                count: 15,
                delay: (err: unknown, retryCount) => {
                  const status = (err as { status?: number })?.status;
                  if (status !== 404) {
                    return throwError(() => err); // non-404 → stop, surface it
                  }
                  const ms = Math.min(500 * 2 ** (retryCount - 1), 5000);
                  return timer(ms);
                },
              }),
              tapResponse({
                next: (run) => {
                  hydrateFromSnapshot(run);
                  if (TERMINAL_RUN_STATUSES.has(run.status)) {
                    // Run already finished — no live updates needed.
                    stopWatching();
                  }
                  // Non-terminal: the subscription opened in the tap() above
                  // is already live; nothing more to do here.
                },
                error: (err: Error) => {
                  const status = (err as { status?: number })?.status;
                  const message =
                    status === 404
                      ? 'This run could not be found. It may still be starting up, or the link may be invalid.'
                      : friendlyApiError(err, 'This run could not be loaded.');
                  // Genuine terminal failure: stop watching and surface error.
                  stopWatching();
                  patchState(store, {
                    loading: false,
                    error: message,
                    loadingRunId: null,
                  });
                },
              }),
            );
          }),
        ),
      ),

      /** Imperative teardown — called from onDestroy hook below. */
      _disposeHubSub(): void {
        stopWatching();
        pendingEvents = [];
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._disposeHubSub();
    },
  }),
);
