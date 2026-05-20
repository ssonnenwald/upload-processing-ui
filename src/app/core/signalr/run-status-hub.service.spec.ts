import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

// --- SignalR module mock -----------------------------------------------------
// RunStatusHub builds its own HubConnection via `new HubConnectionBuilder()`,
// so there is no DI seam — the only way to control it is to mock the module.
//
// EVERYTHING the mock factory touches is created inside vi.hoisted(): vi.mock
// is hoisted above the imports, and `class` declarations (unlike `function`
// declarations) are NOT hoisted — a class declared below would be in the
// temporal dead zone when the factory runs, giving "X is not a constructor".

const {
  HubConnectionState,
  LogLevel,
  HubConnectionBuilder,
  FakeHubConnection,
  setConnection,
} = vi.hoisted(() => {
  const HubConnectionState = {
    Disconnected: 'Disconnected',
    Connecting: 'Connecting',
    Connected: 'Connected',
    Disconnecting: 'Disconnecting',
    Reconnecting: 'Reconnecting',
  } as const;

  const LogLevel = {
    Trace: 0,
    Debug: 1,
    Information: 2,
    Warning: 3,
    Error: 4,
    Critical: 5,
    None: 6,
  } as const;

  /** Controllable stand-in for a SignalR HubConnection. */
  class FakeHubConnection {
    state: string = HubConnectionState.Disconnected;

    /** Server-event handlers registered via `.on(name, handler)`. */
    readonly handlers = new Map<string, (payload: unknown) => void>();

    /** Lifecycle callbacks registered via onreconnecting/onreconnected/onclose. */
    reconnecting: (() => void) | null = null;
    reconnected: (() => void) | null = null;
    closed: (() => void) | null = null;

    /** Every `invoke(method, ...args)` call, in order. */
    readonly invocations: Array<{ method: string; args: unknown[] }> = [];

    start = vi.fn(async () => {
      this.state = HubConnectionState.Connected;
    });

    stop = vi.fn(async () => {
      this.state = HubConnectionState.Disconnected;
    });

    on(name: string, handler: (payload: unknown) => void): void {
      this.handlers.set(name, handler);
    }

    onreconnecting(cb: () => void): void {
      this.reconnecting = cb;
    }
    onreconnected(cb: () => void): void {
      this.reconnected = cb;
    }
    onclose(cb: () => void): void {
      this.closed = cb;
    }

    invoke(method: string, ...args: unknown[]): Promise<void> {
      this.invocations.push({ method, args });
      return Promise.resolve();
    }

    /** Test helper: emit a server event to the registered handler. */
    emit(name: string, payload: unknown): void {
      this.handlers.get(name)?.(payload);
    }
  }

  // The connection the builder hands out — replaced per test via setConnection.
  let connection = new FakeHubConnection();
  const setConnection = (c: FakeHubConnection): void => {
    connection = c;
  };

  /** Fluent builder mock; chainable, build() returns the current fake. */
  class HubConnectionBuilder {
    withUrl(): this {
      return this;
    }
    withAutomaticReconnect(): this {
      return this;
    }
    withServerTimeout(): this {
      return this;
    }
    withKeepAliveInterval(): this {
      return this;
    }
    configureLogging(): this {
      return this;
    }
    build(): FakeHubConnection {
      return connection;
    }
  }

  return {
    HubConnectionState,
    LogLevel,
    HubConnectionBuilder,
    FakeHubConnection,
    setConnection,
  };
});

vi.mock('@microsoft/signalr', () => ({
  HubConnectionState,
  LogLevel,
  HubConnectionBuilder,
}));

// The import must come AFTER vi.mock so the service picks up the mock.
import { RunStatusHub, RunEvent } from './run-status-hub.service';
import type { ChunkUpdate } from '../models/run.models';

/** The concrete fake-connection instance type. */
type FakeConnection = InstanceType<typeof FakeHubConnection>;

describe('RunStatusHub', () => {
  let hub: RunStatusHub;
  let fakeConnection: FakeConnection;

  beforeEach(() => {
    // A fresh connection per test, installed before the service is created.
    fakeConnection = new FakeHubConnection();
    setConnection(fakeConnection);

    TestBed.configureTestingModule({ providers: [RunStatusHub] });
    hub = TestBed.inject(RunStatusHub);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts in the idle state before any connection is requested', () => {
    expect(hub.state()).toBe('idle');
  });

  describe('ensureConnected', () => {
    it('starts the connection and moves to connected', async () => {
      await hub.ensureConnected();

      expect(fakeConnection.start).toHaveBeenCalledTimes(1);
      expect(hub.state()).toBe('connected');
    });

    it('does not start a second time when already connected', async () => {
      await hub.ensureConnected();
      await hub.ensureConnected();

      expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    });

    it('shares one in-flight connection across concurrent callers', async () => {
      await Promise.all([hub.ensureConnected(), hub.ensureConnected()]);

      expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('watchRun', () => {
    it('subscribes to the run on the server after connecting', async () => {
      hub.watchRun('RUN#1').subscribe();

      // watchRun does `ensureConnected().then(() => subscribeToRunOnServer())`,
      // and subscribeToRunOnServer itself awaits invokeSubscribe — several
      // promise hops. Poll until the server-side invoke has actually landed
      // rather than counting microtask turns.
      await vi.waitFor(() => {
        expect(
          fakeConnection.invocations.some((i) => i.method === 'SubscribeToRun'),
        ).toBe(true);
      });

      const subscribeCalls = fakeConnection.invocations.filter(
        (i) => i.method === 'SubscribeToRun',
      );
      expect(subscribeCalls).toHaveLength(1);
      expect(subscribeCalls[0].args).toEqual(['RUN#1']);
    });

    it('emits only events whose runId matches the watched run', async () => {
      const received: RunEvent[] = [];
      hub.watchRun('RUN#1').subscribe((e) => received.push(e));
      await vi.waitFor(() => expect(fakeConnection.start).toHaveBeenCalled());

      const mine: ChunkUpdate = { runId: 'RUN#1' } as ChunkUpdate;
      const theirs: ChunkUpdate = { runId: 'RUN#2' } as ChunkUpdate;

      fakeConnection.emit('chunkUpdated', mine);
      fakeConnection.emit('chunkUpdated', theirs);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ kind: 'chunkUpdated', payload: mine });
    });

    it('wraps each server event in the correct RunEvent envelope', async () => {
      const received: RunEvent[] = [];
      hub.watchRun('RUN#1').subscribe((e) => received.push(e));
      await vi.waitFor(() => expect(fakeConnection.start).toHaveBeenCalled());

      fakeConnection.emit('chunkUpdated', { runId: 'RUN#1' });
      fakeConnection.emit('runStatusChanged', { runId: 'RUN#1' });
      fakeConnection.emit('runCompleted', { runId: 'RUN#1' });

      expect(received.map((e) => e.kind)).toEqual([
        'chunkUpdated',
        'runStatusChanged',
        'runCompleted',
      ]);
    });

    it('unsubscribes from the run on the server when the subscription ends', async () => {
      const sub = hub.watchRun('RUN#1').subscribe();
      await vi.waitFor(() => {
        expect(
          fakeConnection.invocations.some((i) => i.method === 'SubscribeToRun'),
        ).toBe(true);
      });

      sub.unsubscribe();
      await vi.waitFor(() => {
        expect(
          fakeConnection.invocations.some(
            (i) => i.method === 'UnsubscribeFromRun',
          ),
        ).toBe(true);
      });

      const unsub = fakeConnection.invocations.filter(
        (i) => i.method === 'UnsubscribeFromRun',
      );
      expect(unsub).toHaveLength(1);
      expect(unsub[0].args).toEqual(['RUN#1']);
    });

    it('stops emitting to a subscriber after it unsubscribes', async () => {
      const received: RunEvent[] = [];
      const sub = hub.watchRun('RUN#1').subscribe((e) => received.push(e));
      await vi.waitFor(() => expect(fakeConnection.start).toHaveBeenCalled());

      sub.unsubscribe();
      fakeConnection.emit('chunkUpdated', { runId: 'RUN#1' });

      expect(received).toHaveLength(0);
    });
  });

  describe('lifecycle state transitions', () => {
    it('reports "reconnecting" when the connection drops', async () => {
      await hub.ensureConnected();
      fakeConnection.reconnecting?.();
      expect(hub.state()).toBe('reconnecting');
    });

    it('reports "connected" again after a successful reconnect', async () => {
      await hub.ensureConnected();
      fakeConnection.reconnecting?.();
      fakeConnection.reconnected?.();
      expect(hub.state()).toBe('connected');
    });

    it('reports "disconnected" when the connection closes', async () => {
      await hub.ensureConnected();
      fakeConnection.closed?.();
      expect(hub.state()).toBe('disconnected');
    });

    it('re-subscribes every watched run after a reconnect', async () => {
      await hub.ensureConnected();
      hub.watchRun('RUN#1').subscribe();
      hub.watchRun('RUN#2').subscribe();

      // Wait for the initial subscribes to land before triggering reconnect.
      await vi.waitFor(() => {
        const subs = fakeConnection.invocations.filter(
          (i) => i.method === 'SubscribeToRun',
        );
        expect(subs.length).toBeGreaterThanOrEqual(2);
      });

      fakeConnection.state = HubConnectionState.Connected;
      fakeConnection.reconnected?.();

      await vi.waitFor(() => {
        const subs = fakeConnection.invocations
          .filter((i) => i.method === 'SubscribeToRun')
          .map((i) => i.args[0]);
        expect(subs.filter((id) => id === 'RUN#1')).toHaveLength(2);
        expect(subs.filter((id) => id === 'RUN#2')).toHaveLength(2);
      });
    });
  });
});
