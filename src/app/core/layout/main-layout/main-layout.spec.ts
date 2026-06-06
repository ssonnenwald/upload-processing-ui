import { describe, it, expect, beforeEach } from 'vitest';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MainLayout } from './main-layout';
import { RunStatusHub } from '@core/signalr/run-status-hub';

/** Hub connection states — mirrors RunStatusHub.state's value type. */
type HubState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/**
 * Minimal RunStatusHub stand-in. MainLayout doesn't use the hub directly, but
 * its child HubStatusBadge injects it — so the test must provide a fake when
 * the layout's template renders the badge.
 */
class FakeRunStatusHub {
  readonly state: WritableSignal<HubState> = signal<HubState>('idle');
}

describe('MainLayout', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MainLayout],
      providers: [
        // Router directives in the template (RouterOutlet/RouterLink/
        // RouterLinkActive) need the router providers to construct.
        provideRouter([]),
        // Satisfies the HubStatusBadge child's inject(RunStatusHub).
        { provide: RunStatusHub, useValue: new FakeRunStatusHub() },
      ],
    });
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(MainLayout);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders its template without error', () => {
    const fixture = TestBed.createComponent(MainLayout);
    // detectChanges compiles and renders the template — this is where a
    // missing import, bad binding, or unprovided dependency would throw.
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('renders the live-status badge child component', () => {
    const fixture = TestBed.createComponent(MainLayout);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('app-hub-status-badge');
    expect(badge).not.toBeNull();
  });

  it('provides a router-outlet for feature pages', () => {
    const fixture = TestBed.createComponent(MainLayout);
    fixture.detectChanges();
    const outlet = fixture.nativeElement.querySelector('router-outlet');
    expect(outlet).not.toBeNull();
  });
});
