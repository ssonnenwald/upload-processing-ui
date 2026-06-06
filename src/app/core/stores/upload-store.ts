import { inject } from '@angular/core';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { exhaustMap, pipe, tap } from 'rxjs';
import { tapResponse } from '@ngrx/operators';
import { RunsApi } from '../api/runs-api';
import { UploadRequest, UploadResponse } from '../models/run.models';
import { friendlyApiError } from '@core/api/friendly-error';

interface UploadState {
  readonly uploading: boolean;
  readonly percent: number;
  readonly error: string | null;
  readonly lastResponse: UploadResponse | null;
}

const initialState: UploadState = {
  uploading: false,
  percent: 0,
  error: null,
  lastResponse: null,
};

/**
 * Per-page store for the upload submission flow. Tracks progress and the
 * final response so the page can navigate to the watcher after success.
 *
 * Uses `exhaustMap` so a second submit click while one is in flight is
 * ignored (vs switchMap which would cancel the first and start a second —
 * not what we want here; we already disable the button, but defense in depth).
 */
export const UploadStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(RunsApi)) => ({
    submit: rxMethod<UploadRequest>(
      pipe(
        tap(() =>
          patchState(store, {
            uploading: true,
            percent: 0,
            error: null,
            lastResponse: null,
          }),
        ),
        exhaustMap((req) =>
          api.uploadFile(req).pipe(
            tapResponse({
              next: (event) => {
                if (event.kind === 'progress' && event.total > 0) {
                  patchState(store, {
                    percent: Math.round((event.loaded / event.total) * 100),
                  });
                } else if (event.kind === 'response' && event.response) {
                  patchState(store, {
                    percent: 100,
                    uploading: false,
                    lastResponse: event.response,
                  });
                }
              },
              error: (err: Error) =>
                patchState(store, {
                  uploading: false,
                  error: friendlyApiError(
                    err,
                    'The upload could not be submitted.',
                  ),
                }),
            }),
          ),
        ),
      ),
    ),

    reset(): void {
      patchState(store, initialState);
    },
  })),
);
