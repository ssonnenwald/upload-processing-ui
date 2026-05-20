import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, ComponentRef, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RunWatcherPageComponent } from './run-watcher-page.component';
import { LiveRunStore } from '@core/stores/live-run.store';
import { RunStatusHub } from '@core/signalr/run-status-hub.service';
import type { RunDetailsResponse } from '@core/models/run.models';

type HubState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/**
 * Stand-in for LiveRunStore. `snapshot` and `isTerminal` are writable signals
 * so the test can drive the three branches of the statusMessage computed.
 */
interface FakeStore {
  load: Mock;
  snapshot: WritableSignal<RunDetailsResponse | null>;
  isTerminal: WritableSignal<boolean>;
  loading: () => boolean;
  error: () => string | null;
  isLive: () => boolean;
  chunksEntities: () => readonly unknown[];
}

function makeFakeStore(): FakeStore {
  return {
    load: vi.fn(),
    snapshot: signal<RunDetailsResponse | null>(null),
    isTerminal: signal(false),
    loading: () => false,
    error: () => null,
    isLive: () => false,
    chunksEntities: () => [],
  };
}

/** Minimal RunStatusHub stand-in — the component only reads `state`. */
class FakeRunStatusHub {
  readonly state: WritableSignal<HubState> = signal<HubState>('idle');
}

/** Typed view of the component's protected members. */
interface Internals {
  hubState: () => HubState;
  statusMessage: () => string;
}

/** A non-null snapshot — its contents don't matter, only that it isn't null. */
function aSnapshot(): RunDetailsResponse {
  return { runId: 'RUN#1' } as RunDetailsResponse;
}

describe('RunWatcherPageComponent', () => {
  let fakeStore: FakeStore;
  let hub: FakeRunStatusHub;

  beforeEach(() => {
    fakeStore = makeFakeStore();
    hub = new FakeRunStatusHub();

    TestBed.configureTestingModule({
      imports: [RunWatcherPageComponent],
      providers: [
        // provideRouter supplies Router AND ActivatedRoute — the template's
        // RouterLink injects ActivatedRoute.
        provideRouter([]),
        // RunStatusHub is root-provided — a module-level override is enough.
        { provide: RunStatusHub, useValue: hub },
      ],
    });
    // LiveRunStore is component-scoped (`providers: [LiveRunStore]`), so it
    // must be overridden on the component itself.
    TestBed.overrideComponent(RunWatcherPageComponent, {
      set: { providers: [{ provide: LiveRunStore, useValue: fakeStore }] },
    });
  });

  /** Creates the component with the given runId input. */
  function render(runId = 'RUN#1'): {
    internals: Internals;
    ref: ComponentRef<RunWatcherPageComponent>;
  } {
    const fixture = TestBed.createComponent(RunWatcherPageComponent);
    fixture.componentRef.setInput('runId', runId);
    fixture.detectChanges();
    return {
      internals: fixture.componentInstance as unknown as Internals,
      ref: fixture.componentRef,
    };
  }

  describe('run loading', () => {
    it('loads the run for the initial runId input', () => {
      render('RUN#1');
      expect(fakeStore.load).toHaveBeenCalledWith('RUN#1');
    });

    it('re-loads when the runId input changes', () => {
      const { ref } = render('RUN#1');
      ref.setInput('runId', 'RUN#2');
      ref.changeDetectorRef.detectChanges();

      expect(fakeStore.load).toHaveBeenCalledWith('RUN#2');
      expect(fakeStore.load).toHaveBeenCalledTimes(2);
    });
  });

  describe('statusMessage', () => {
    it('is empty before a run snapshot has loaded', () => {
      const { internals } = render();
      expect(internals.statusMessage()).toBe('');
    });

    it('shows the "live" message for a loaded, non-terminal run', () => {
      const { internals } = render();
      fakeStore.snapshot.set(aSnapshot());
      fakeStore.isTerminal.set(false);

      expect(internals.statusMessage()).toContain('Live updates are streaming');
    });

    it('shows the "finished" message for a loaded, terminal run', () => {
      const { internals } = render();
      fakeStore.snapshot.set(aSnapshot());
      fakeStore.isTerminal.set(true);

      expect(internals.statusMessage()).toContain('This run finished');
    });

    it('updates reactively as the run transitions to terminal', () => {
      const { internals } = render();
      fakeStore.snapshot.set(aSnapshot());
      fakeStore.isTerminal.set(false);
      expect(internals.statusMessage()).toContain('Live updates are streaming');

      fakeStore.isTerminal.set(true);
      expect(internals.statusMessage()).toContain('This run finished');
    });
  });

  describe('hubState', () => {
    it('exposes the hub connection state', () => {
      const { internals } = render();
      expect(internals.hubState()).toBe('idle');
    });

    it('reflects a change in the hub state reactively', () => {
      const { internals } = render();
      hub.state.set('connected');
      expect(internals.hubState()).toBe('connected');
    });
  });
});
