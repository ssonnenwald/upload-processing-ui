import { computed, inject } from '@angular/core';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { pipe, switchMap, tap } from 'rxjs';
import { tapResponse } from '@ngrx/operators';
import { RunsApi } from '../api/runs-api';
import { friendlyApiError } from '@core/api/friendly-error';
import {
  ChunkDetailsResponse,
  ChunkRowFilter,
  ChunkRowOutcome,
  ChunkStatus,
} from '../models/run.models';

/**
 * Per-dialog store for one chunk's per-row detail. NOT provided in root — the
 * drill-down dialog puts it in its `providers` array so each opened dialog gets
 * a fresh instance, and closing the dialog tears it down.
 *
 * load() fetches every row for the chunk in one call; `filter` narrows what the
 * template renders without re-hitting the API (a chunk's row set is bounded).
 */
interface ChunkDetailsState {
  readonly runId: string | null;
  readonly chunkSk: string | null;
  readonly chunkIndex: number | null;
  readonly startingRow: number;
  readonly endingRow: number;
  readonly status: ChunkStatus | null;
  readonly detailsAvailable: boolean;
  readonly detailsMessage: string | null;
  readonly succeeded: number;
  readonly failedValid: number;
  readonly invalid: number;
  readonly skipped: number;
  readonly rows: readonly ChunkRowOutcome[];
  readonly filter: ChunkRowFilter;
  readonly loading: boolean;
  readonly error: string | null;
}

const initialState: ChunkDetailsState = {
  runId: null,
  chunkSk: null,
  chunkIndex: null,
  startingRow: 0,
  endingRow: 0,
  status: null,
  detailsAvailable: false,
  detailsMessage: null,
  succeeded: 0,
  failedValid: 0,
  invalid: 0,
  skipped: 0,
  rows: [],
  filter: 'all',
  loading: false,
  error: null,
};

export const ChunkDetailsStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    /** Rows narrowed by the active status filter. */
    filteredRows: computed<readonly ChunkRowOutcome[]>(() => {
      const filter = store.filter();
      const rows = store.rows();
      return filter === 'all' ? rows : rows.filter((r) => r.status === filter);
    }),
    /** Total rows loaded (across all statuses). */
    totalRows: computed(() => store.rows().length),
  })),
  withMethods((store, api = inject(RunsApi)) => ({
    setFilter(filter: ChunkRowFilter): void {
      patchState(store, { filter });
    },

    load: rxMethod<{ runId: string; chunkSk: string }>(
      pipe(
        // Reset to a clean slate (including filter → 'all') before each load.
        tap(({ runId, chunkSk }) =>
          patchState(store, {
            ...initialState,
            runId,
            chunkSk,
            loading: true,
          }),
        ),
        switchMap(({ runId, chunkSk }) =>
          api.getChunkDetails(runId, chunkSk).pipe(
            tapResponse({
              next: (res: ChunkDetailsResponse) =>
                patchState(store, {
                  runId: res.runId,
                  chunkSk: res.chunkSk,
                  chunkIndex: res.chunkIndex,
                  startingRow: res.startingRow,
                  endingRow: res.endingRow,
                  status: res.status,
                  detailsAvailable: res.detailsAvailable,
                  detailsMessage: res.detailsMessage,
                  succeeded: res.succeeded,
                  failedValid: res.failedValid,
                  invalid: res.invalid,
                  skipped: res.skipped,
                  rows: res.rows,
                  loading: false,
                  error: null,
                }),
              error: (err: Error) =>
                patchState(store, {
                  loading: false,
                  error: friendlyApiError(err, 'Could not load chunk details.'),
                }),
            }),
          ),
        ),
      ),
    ),
  })),
);
