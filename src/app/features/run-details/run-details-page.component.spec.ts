import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RunDetailsPageComponent } from './run-details-page.component';
import { LiveRunStore } from '@core/stores/live-run.store';

/**
 * Stand-in for LiveRunStore. The component only calls `load(...)`; its template
 * reads other store members, so the fake also exposes those as inert stubs.
 */
function makeFakeStore(): { load: Mock } & Record<string, unknown> {
  return {
    load: vi.fn(),
    snapshot: () => null,
    loading: () => false,
    error: () => null,
    isTerminal: () => false,
    isLive: () => false,
    chunksEntities: () => [],
  };
}

describe('RunDetailsPageComponent', () => {
  let fakeStore: { load: Mock };

  beforeEach(() => {
    fakeStore = makeFakeStore();
    TestBed.configureTestingModule({
      imports: [RunDetailsPageComponent],
      providers: [
        // provideRouter supplies Router AND ActivatedRoute — the template's
        // RouterLink injects ActivatedRoute.
        provideRouter([]),
      ],
    });
    // LiveRunStore is component-scoped (`providers: [LiveRunStore]`), so it
    // must be overridden on the component itself.
    TestBed.overrideComponent(RunDetailsPageComponent, {
      set: { providers: [{ provide: LiveRunStore, useValue: fakeStore }] },
    });
  });

  /** Creates the component with the given runId input. */
  function render(runId: string): ComponentRef<RunDetailsPageComponent> {
    const fixture = TestBed.createComponent(RunDetailsPageComponent);
    fixture.componentRef.setInput('runId', runId);
    fixture.detectChanges();
    return fixture.componentRef;
  }

  it('loads the run for the initial runId input', () => {
    render('RUN#1');
    expect(fakeStore.load).toHaveBeenCalledWith('RUN#1');
  });

  it('loads the run exactly once for a single runId', () => {
    render('RUN#1');
    expect(fakeStore.load).toHaveBeenCalledTimes(1);
  });

  it('re-loads when the runId input changes', () => {
    const ref = render('RUN#1');
    expect(fakeStore.load).toHaveBeenCalledWith('RUN#1');

    ref.setInput('runId', 'RUN#2');
    ref.changeDetectorRef.detectChanges();

    expect(fakeStore.load).toHaveBeenCalledWith('RUN#2');
    expect(fakeStore.load).toHaveBeenCalledTimes(2);
  });

  it('provides its own component-scoped LiveRunStore', () => {
    const fixture = TestBed.createComponent(RunDetailsPageComponent);
    fixture.componentRef.setInput('runId', 'RUN#1');
    fixture.detectChanges();

    const injected = fixture.debugElement.injector.get(LiveRunStore);
    expect(injected).toBe(fakeStore);
  });
});
