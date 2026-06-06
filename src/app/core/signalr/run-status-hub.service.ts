import { DestroyRef, Service, signal, inject } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { Observable, Subject, filter } from 'rxjs';
import { environment } from '@env/environment';
import {
  ChunkUpdate,
  RunStatusChanged,
  RunSummary,
} from '../models/run.models';

/** Strongly-typed envelope so consumers can filter by event kind in a single stream. */
export type RunEvent =
  | { kind: 'chunkUpdated'; payload: ChunkUpdate }
  | { kind: 'runStatusChanged'; payload: RunStatusChanged }
  | { kind: 'runCompleted'; payload: RunSummary };

export type ConnectionState =
  | 'idle' // never asked to connect — lazy hub, page doesn't need it
  | 'disconnected' // was connected (or actively connecting) and then lost it
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/**
 * Wraps the @microsoft/signalr HubConnection in a service that:
 *   - lazily connects on first subscribe()
 *   - exposes a single Observable<RunEvent> for any component that wants events
 *   - tracks subscribed runIds and re-subscribes them after a reconnect
 *   - exposes the connection state as a signal for status badges in the UI
 *
 * Injecting RunStatusHub in a component is enough — the service handles connection
 * lifecycle. The hub stays open for the life of the application; if no component
 * is using it the cost is one idle WebSocket, which is fine.
 */
@Service()
export class RunStatusHub {
  private readonly destroyRef = inject(DestroyRef);

  private connection: HubConnection | null = null;
  private readonly events$ = new Subject<RunEvent>();
  private readonly subscribed = new Set<string>();
  private connecting: Promise<void> | null = null;

  readonly state = signal<ConnectionState>('idle');

  constructor() {
    // Best-effort cleanup if the root service is ever torn down (e.g. in tests).
    this.destroyRef.onDestroy(() => void this.connection?.stop());
  }

  /**
   * Subscribe to live events for a specific run. The returned Observable only
   * emits events whose runId matches. Unsubscribing the Observable also tells
   * the server we no longer care about that run (if no other subscriber for it).
   */
  watchRun(runId: string): Observable<RunEvent> {
    const refKey = runId;
    void this.ensureConnected().then(() => this.subscribeToRunOnServer(refKey));

    return new Observable<RunEvent>((observer) => {
      const sub = this.events$
        .pipe(filter((e) => e.payload.runId === refKey))
        .subscribe(observer);

      return () => {
        sub.unsubscribe();
        void this.unsubscribeFromRunOnServer(refKey);
      };
    });
  }

  /**
   * Promise-based connect for callers that need to await readiness before
   * issuing the first subscribe (e.g. component initialization).
   * Safe to call repeatedly — concurrent calls share the same promise.
   */
  async ensureConnected(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.connectInternal().finally(
      () => (this.connecting = null),
    );
    return this.connecting;
  }

  private async connectInternal(): Promise<void> {
    if (!this.connection) {
      this.connection = new HubConnectionBuilder()
        .withUrl(environment.hubUrl)
        // Built-in exponential backoff with a cap. The default is one-shot; this
        // tries forever with reasonable spacing so transient API restarts recover.
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (ctx) => {
            // 1s, 2s, 5s, 10s, then 15s indefinitely
            const schedule = [1000, 2000, 5000, 10_000];
            return schedule[ctx.previousRetryCount] ?? 15_000;
          },
        })
        .withServerTimeout(60_000)
        .configureLogging(
          environment.production ? LogLevel.Warning : LogLevel.Information,
        )
        .build();

      this.wireServerEvents(this.connection);
      this.wireLifecycle(this.connection);
    }

    if (this.connection.state === HubConnectionState.Disconnected) {
      this.state.set('connecting');
      await this.connection.start();
      this.state.set('connected');
      // After a (re)connect, re-subscribe to anything we were watching before.
      for (const runId of this.subscribed) {
        await this.invokeSubscribe(runId);
      }
    }
  }

  private wireServerEvents(conn: HubConnection): void {
    conn.on('chunkUpdated', (payload: ChunkUpdate) =>
      this.events$.next({ kind: 'chunkUpdated', payload }),
    );
    conn.on('runStatusChanged', (payload: RunStatusChanged) =>
      this.events$.next({ kind: 'runStatusChanged', payload }),
    );
    conn.on('runCompleted', (payload: RunSummary) =>
      this.events$.next({ kind: 'runCompleted', payload }),
    );
  }

  private wireLifecycle(conn: HubConnection): void {
    conn.onreconnecting(() => this.state.set('reconnecting'));
    conn.onreconnected(() => {
      this.state.set('connected');
      // SignalR auto-reconnect preserves connectionId but NOT group membership —
      // we must re-join groups ourselves. The set holds the runIds we care about.
      void Promise.all(
        [...this.subscribed].map((id) => this.invokeSubscribe(id)),
      );
    });
    conn.onclose(() => this.state.set('disconnected'));
  }

  private async subscribeToRunOnServer(runId: string): Promise<void> {
    this.subscribed.add(runId);
    if (this.connection?.state === HubConnectionState.Connected) {
      await this.invokeSubscribe(runId);
    }
  }

  private async unsubscribeFromRunOnServer(runId: string): Promise<void> {
    this.subscribed.delete(runId);
    if (this.connection?.state === HubConnectionState.Connected) {
      try {
        await this.connection.invoke('UnsubscribeFromRun', runId);
      } catch {
        // Server-side unsubscribe failures aren't actionable on the client.
        // If the connection later drops and reconnects, our local set is the truth.
      }
    }
  }

  private async invokeSubscribe(runId: string): Promise<void> {
    try {
      await this.connection!.invoke('SubscribeToRun', runId);
    } catch (err) {
      console.error('SignalR SubscribeToRun failed for', runId, err);
    }
  }
}
