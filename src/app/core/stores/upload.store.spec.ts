import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { UploadStore } from './upload.store';
import { RunsApi } from '../api/runs-api.service';
import type { UploadProgress } from '../api/runs-api.service';
import type { UploadResponse } from '../models/run.models';
import { makeUploadRequest, makeUploadResponse } from '@testing/factories';

// --- Spec-local stream-event helpers -----------------------------------------
// progress() and response() build UploadProgress stream events, not model
// objects — they stay local to this spec.

/** A progress event in the UploadProgress stream. */
function progress(loaded: number, total: number): UploadProgress {
  return { kind: 'progress', loaded, total };
}

/** The terminal response event in the UploadProgress stream. */
function response(body: UploadResponse): UploadProgress {
  return { kind: 'response', loaded: 1, total: 1, response: body };
}

/** RunsApi double — only uploadFile is used by this store. */
interface RunsApiMock {
  uploadFile: Mock;
}

describe('UploadStore', () => {
  let store: InstanceType<typeof UploadStore>;
  let api: RunsApiMock;

  beforeEach(() => {
    api = { uploadFile: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        // Per-page store — not root-provided, so list it explicitly.
        UploadStore,
        { provide: RunsApi, useValue: api },
      ],
    });
    store = TestBed.inject(UploadStore);
  });

  it('starts idle with zero percent and no response', () => {
    expect(store.uploading()).toBe(false);
    expect(store.percent()).toBe(0);
    expect(store.error()).toBeNull();
    expect(store.lastResponse()).toBeNull();
  });

  describe('submit — progress tracking', () => {
    it('sets uploading true and clears prior state when a submit starts', () => {
      // A stream that only emits progress keeps uploading true.
      api.uploadFile.mockReturnValue(of(progress(0, 100)));

      store.submit(makeUploadRequest());

      expect(store.uploading()).toBe(true);
      expect(store.error()).toBeNull();
    });

    it('maps a progress event to a rounded percentage', () => {
      api.uploadFile.mockReturnValue(of(progress(512, 1024)));

      store.submit(makeUploadRequest());

      expect(store.percent()).toBe(50);
    });

    it('rounds fractional progress to the nearest percent', () => {
      api.uploadFile.mockReturnValue(of(progress(1, 3)));

      store.submit(makeUploadRequest());

      // 1/3 = 33.33% → 33
      expect(store.percent()).toBe(33);
    });

    it('ignores a progress event with a zero total (no divide-by-zero)', () => {
      api.uploadFile.mockReturnValue(of(progress(0, 0)));

      store.submit(makeUploadRequest());

      // total === 0 fails the `event.total > 0` guard — percent stays 0.
      expect(store.percent()).toBe(0);
      expect(store.uploading()).toBe(true);
    });

    it('advances percent across a sequence of progress events', () => {
      api.uploadFile.mockReturnValue(
        of(progress(25, 100), progress(50, 100), progress(75, 100)),
      );

      store.submit(makeUploadRequest());

      // Last progress event wins.
      expect(store.percent()).toBe(75);
    });
  });

  describe('submit — completion', () => {
    it('records the response and ends the upload on a response event', () => {
      const body = makeUploadResponse({ runId: 'RUN#new' });
      api.uploadFile.mockReturnValue(of(progress(50, 100), response(body)));

      store.submit(makeUploadRequest());

      expect(store.percent()).toBe(100);
      expect(store.uploading()).toBe(false);
      expect(store.lastResponse()).toEqual(body);
      expect(store.error()).toBeNull();
    });

    it('does not finish on a response event that carries no body', () => {
      // event.kind === 'response' but event.response is undefined — neither
      // branch runs, so the store stays in the uploading state.
      const noBody: UploadProgress = {
        kind: 'response',
        loaded: 1,
        total: 1,
        response: undefined,
      };
      api.uploadFile.mockReturnValue(of(progress(50, 100), noBody));

      store.submit(makeUploadRequest());

      expect(store.uploading()).toBe(true);
      expect(store.lastResponse()).toBeNull();
    });
  });

  describe('submit — error handling', () => {
    it('sets a friendly error and ends the upload on failure', () => {
      api.uploadFile.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 500,
              statusText: 'Internal Server Error',
            }),
        ),
      );

      store.submit(makeUploadRequest());

      expect(store.uploading()).toBe(false);
      expect(store.error()).not.toBeNull();
    });
  });

  describe('submit — exhaustMap behavior', () => {
    it('ignores a second submit while the first is still in flight', () => {
      // First upload never completes — its stream stays open.
      const inFlight = new Subject<UploadProgress>();
      api.uploadFile.mockReturnValueOnce(inFlight.asObservable());
      // A second call would return a completed stream if it were allowed.
      api.uploadFile.mockReturnValueOnce(of(response(makeUploadResponse())));

      store.submit(makeUploadRequest());
      store.submit(makeUploadRequest());

      // exhaustMap drops the second emission while the first is active.
      expect(api.uploadFile).toHaveBeenCalledTimes(1);
    });

    it('accepts a new submit after the first one completes', () => {
      api.uploadFile.mockReturnValue(of(response(makeUploadResponse())));

      store.submit(makeUploadRequest());
      store.submit(makeUploadRequest());

      // The first stream completed, so the second submit is allowed through.
      expect(api.uploadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('returns the store to its initial state', () => {
      api.uploadFile.mockReturnValue(
        of(response(makeUploadResponse({ runId: 'RUN#new' }))),
      );
      store.submit(makeUploadRequest());
      expect(store.lastResponse()).not.toBeNull();

      store.reset();

      expect(store.uploading()).toBe(false);
      expect(store.percent()).toBe(0);
      expect(store.error()).toBeNull();
      expect(store.lastResponse()).toBeNull();
    });
  });
});
