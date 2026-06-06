import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError, defer, Subject, type Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { LiveRunStore } from './live-run-store';
import { RunsApi } from '../api/runs-api';
import { RunStatusHub, RunEvent } from '../signalr/run-status-hub';
import type { RunDetailsResponse } from '../models/run.models';
import {
  makeChunk,
  makeRunDetails,
  makeChunkUpdate,
  makeStatusChange,
  makeRunSummary,
} from '@testing/factories';

interface RunsApiMock {
  getRun: Mock;
}

class FakeRunStatusHub {
  readonly streams = new Map<string, Subject<RunEvent>>();
  readonly watched: string[] = [];

  watchRun = vi.fn((runId: string) => {
    this.watched.push(runId);
    const subject = new Subject<RunEvent>();
    this.streams.set(runId, subject);
    return subject.asObservable();
  });

  emit(runId: string, event: RunEvent): void {
    this.streams.get(runId)?.next(event);
  }
}

describe('LiveRunStore', () => {
  let store: InstanceType<typeof LiveRunStore>;
  let api: RunsApiMock;
  let hub: FakeRunStatusHub;

  beforeEach(() => {
    api = { getRun: vi.fn() };
    hub = new FakeRunStatusHub();
    TestBed.configureTestingModule({
      providers: [
        LiveRunStore,
        { provide: RunsApi, useValue: api },
        { provide: RunStatusHub, useValue: hub },
      ],
    });
    store = TestBed.inject(LiveRunStore);
  });

  it('starts empty with a null snapshot', () => {
    expect(store.runId()).toBeNull();
    expect(store.status()).toBeNull();
    expect(store.snapshot()).toBeNull();
    expect(store.isLive()).toBe(false);
    expect(store.isTerminal()).toBe(false);
  });

  describe('load — happy path', () => {
    it('fetches the run and hydrates state from the snapshot', () => {
      const run = makeRunDetails({
        runId: 'RUN#1',
        chunks: [makeChunk({ chunkSk: 'CHUNK#0001' })],
      });
      api.getRun.mockReturnValue(of(run));

      store.load('RUN#1');

      expect(api.getRun).toHaveBeenCalledWith('RUN#1');
      expect(store.runId()).toBe('RUN#1');
      expect(store.status()).toBe('InProgress');
      expect(store.loading()).toBe(false);
      expect(store.chunksEntities()).toHaveLength(1);
    });

    it('builds a RunDetailsResponse-shaped snapshot once loaded', () => {
      const run = makeRunDetails({ runId: 'RUN#1' });
      api.getRun.mockReturnValue(of(run));

      store.load('RUN#1');

      const snap = store.snapshot();
      expect(snap).not.toBeNull();
      expect(snap?.runId).toBe('RUN#1');
      expect(snap?.function).toBe('PID_RECALC');
    });

    it('opens a hub subscription for the run', () => {
      api.getRun.mockReturnValue(of(makeRunDetails({ runId: 'RUN#1' })));

      store.load('RUN#1');

      expect(hub.watchRun).toHaveBeenCalledWith('RUN#1');
      expect(store.subscribedRunId()).toBe('RUN#1');
    });

    it('stops watching immediately when the loaded run is already terminal', () => {
      api.getRun.mockReturnValue(
        of(makeRunDetails({ runId: 'RUN#1', status: 'Completed' })),
      );

      store.load('RUN#1');

      expect(store.subscribedRunId()).toBeNull();
      expect(store.isTerminal()).toBe(true);
      expect(store.isLive()).toBe(false);
    });
  });

  describe('load — idempotency', () => {
    it('does not reload a run that is already loaded', () => {
      api.getRun.mockReturnValue(of(makeRunDetails({ runId: 'RUN#1' })));

      store.load('RUN#1');
      store.load('RUN#1');

      expect(api.getRun).toHaveBeenCalledTimes(1);
    });

    it('switches to a different run when load is called with a new id', () => {
      api.getRun.mockImplementation((id: string) =>
        of(makeRunDetails({ runId: id })),
      );

      store.load('RUN#1');
      store.load('RUN#2');

      expect(api.getRun).toHaveBeenCalledTimes(2);
      expect(store.runId()).toBe('RUN#2');
      expect(hub.watched).toEqual(['RUN#1', 'RUN#2']);
    });
  });

  describe('live event folding', () => {
    beforeEach(() => {
      api.getRun.mockReturnValue(
        of(
          makeRunDetails({
            runId: 'RUN#1',
            status: 'InProgress',
            chunks: [makeChunk({ chunkSk: 'CHUNK#0001', status: 'Pending' })],
          }),
        ),
      );
      store.load('RUN#1');
    });

    it('applies a chunkUpdated event to the matching chunk entity', () => {
      hub.emit('RUN#1', {
        kind: 'chunkUpdated',
        payload: makeChunkUpdate({
          chunkSk: 'CHUNK#0001',
          status: 'Succeeded',
        }),
      });

      const chunk = store
        .chunksEntities()
        .find((c) => c.chunkSk === 'CHUNK#0001');
      expect(chunk?.status).toBe('Succeeded');
      expect(chunk?.succeeded).toBe(50);
    });

    it('applies a runStatusChanged event to the run-level fields', () => {
      hub.emit('RUN#1', {
        kind: 'runStatusChanged',
        payload: makeStatusChange({ chunksCompleted: 3, succeeded: 150 }),
      });

      expect(store.chunksCompleted()).toBe(3);
      expect(store.succeeded()).toBe(150);
    });

    it('applies a runCompleted event and stops watching', () => {
      hub.emit('RUN#1', {
        kind: 'runCompleted',
        payload: makeRunSummary({ status: 'Completed' }),
      });

      expect(store.status()).toBe('Completed');
      expect(store.isTerminal()).toBe(true);
      expect(store.subscribedRunId()).toBeNull();
    });

    it('ignores an event whose runId does not match the loaded run', () => {
      hub.emit('RUN#1', {
        kind: 'runStatusChanged',
        payload: makeStatusChange({ runId: 'RUN#OTHER', chunksCompleted: 99 }),
      });

      expect(store.chunksCompleted()).toBe(0);
    });
  });

  describe('event buffering before hydration', () => {
    it('replays events that arrived before the snapshot resolved', () => {
      const snapshot = new Subject<RunDetailsResponse>();
      api.getRun.mockReturnValue(snapshot.asObservable());

      store.load('RUN#1');
      expect(store.runId()).toBeNull();

      hub.emit('RUN#1', {
        kind: 'runStatusChanged',
        payload: makeStatusChange({ chunksCompleted: 2 }),
      });
      expect(store.chunksCompleted()).toBe(0);

      snapshot.next(makeRunDetails({ runId: 'RUN#1', chunksCompleted: 0 }));
      snapshot.complete();

      expect(store.runId()).toBe('RUN#1');
      expect(store.chunksCompleted()).toBe(2);
    });
  });

  describe('load — 404 retry behavior', () => {
    function http(status: number): HttpErrorResponse {
      return new HttpErrorResponse({ status, statusText: 'x' });
    }

    it('retries a 404 and succeeds once the run appears', async () => {
      // KEY DETAIL: `retry` resubscribes to its SOURCE observable — it does
      // NOT re-invoke api.getRun. The real HttpClient.get() returns a cold
      // observable that re-runs the request on every subscribe, so a retry
      // produces a fresh HTTP call. To mirror that, getRun returns a single
      // `defer(...)` whose factory runs ON EACH SUBSCRIPTION: it 404s the
      // first time and succeeds the second. So getRun is called once, but
      // the observable it returns behaves differently per subscription —
      // exactly like a real cold HTTP observable.
      let subscribeCount = 0;
      const coldRun: Observable<RunDetailsResponse> = defer(() => {
        subscribeCount += 1;
        return subscribeCount === 1
          ? throwError(() => http(404))
          : of(makeRunDetails({ runId: 'RUN#1' }));
      });
      api.getRun.mockReturnValue(coldRun);

      store.load('RUN#1');

      // The retry backoff is a real rxjs timer (~500ms first attempt); wait
      // on the OUTCOME — the run hydrating — rather than a call count, since
      // getRun itself is only ever called once.
      await vi.waitFor(
        () => {
          expect(store.runId()).toBe('RUN#1');
        },
        { timeout: 3000, interval: 50 },
      );

      // Two subscriptions to the cold observable: the initial 404 and the
      // successful retry.
      expect(subscribeCount).toBe(2);
      expect(store.error()).toBeNull();
    });

    it('fails fast on a non-404 error without retrying', () => {
      // A non-404 error is re-thrown by the retry delay immediately — no
      // timer involved, so this resolves synchronously.
      let subscribeCount = 0;
      api.getRun.mockReturnValue(
        defer(() => {
          subscribeCount += 1;
          return throwError(() => http(500));
        }),
      );

      store.load('RUN#1');

      // Exactly one subscription — the retry does not fire for a non-404.
      expect(subscribeCount).toBe(1);
      expect(store.error()).not.toBeNull();
      expect(store.loading()).toBe(false);
    });

    it('surfaces a not-found message after the retry budget is exhausted', async () => {
      // 15 retries, each backoff capped at 5s — too long for real timers,
      // so this case uses fake timers and drains the full schedule. The
      // cold observable 404s on every subscription.
      vi.useFakeTimers();
      try {
        api.getRun.mockReturnValue(defer(() => throwError(() => http(404))));

        store.load('RUN#1');
        await vi.advanceTimersByTimeAsync(15 * 5000 + 1000);

        expect(store.error()).not.toBeNull();
        expect(store.runId()).toBeNull();
        expect(store.subscribedRunId()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('onDestroy', () => {
    it('tears down the hub subscription when the store is destroyed', () => {
      api.getRun.mockReturnValue(of(makeRunDetails({ runId: 'RUN#1' })));
      store.load('RUN#1');
      expect(store.subscribedRunId()).toBe('RUN#1');

      TestBed.resetTestingModule();

      expect(hub.streams.get('RUN#1')?.observed).toBe(false);
    });
  });
});
