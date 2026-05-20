import { describe, it, expect, beforeEach } from 'vitest';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HubStatusBadge } from './hub-status-badge';
import { RunStatusHub } from '@core/signalr/run-status-hub.service';

/**
 * The hub connection states the badge renders. Mirrors RunStatusHub.state's
 * value type — kept local so the test documents exactly what it covers.
 */
type HubState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/**
 * Minimal stand-in for RunStatusHub. The component only reads `state`, so the
 * fake exposes just that — as a writable signal the test can drive.
 */
class FakeRunStatusHub {
  readonly state: WritableSignal<HubState> = signal<HubState>('idle');
}

/** Narrowed view of the component's protected computed members. */
interface BadgeInternals {
  hubLabel: () => string;
  hubTooltip: () => string;
}

describe('HubStatusBadge', () => {
  let hub: FakeRunStatusHub;

  beforeEach(() => {
    hub = new FakeRunStatusHub();
    TestBed.configureTestingModule({
      imports: [HubStatusBadge],
      providers: [{ provide: RunStatusHub, useValue: hub }],
    });
  });

  /**
   * Creates the component in the given hub state and returns both the rendered
   * text and a typed view of its protected computed members.
   */
  function render(state: HubState): {
    text: string;
    internals: BadgeInternals;
  } {
    hub.state.set(state);
    const fixture = TestBed.createComponent(HubStatusBadge);
    fixture.detectChanges();
    return {
      text: (fixture.nativeElement.textContent ?? '').trim(),
      internals: fixture.componentInstance as unknown as BadgeInternals,
    };
  }

  it('creates', () => {
    const fixture = TestBed.createComponent(HubStatusBadge);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('label', () => {
    it.each<[HubState, string]>([
      ['connected', 'Live: connected'],
      ['connecting', 'Live: connecting\u2026'],
      ['reconnecting', 'Live: reconnecting\u2026'],
      ['disconnected', 'Live: disconnected'],
      ['idle', 'Live: ready'],
    ])('maps "%s" state to label "%s"', (state, expected) => {
      const { internals } = render(state);
      expect(internals.hubLabel()).toBe(expected);
    });

    it('renders the label text into the DOM', () => {
      const { text } = render('connected');
      expect(text).toContain('Live: connected');
    });

    it('shows the neutral "ready" label before any connection (default idle)', () => {
      // The hub starts idle — the badge must not look alarming at rest.
      const { text } = render('idle');
      expect(text).toContain('Live: ready');
    });

    it('updates the label reactively when the hub state changes', () => {
      const fixture = TestBed.createComponent(HubStatusBadge);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Live: ready');

      hub.state.set('connected');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Live: connected');

      hub.state.set('reconnecting');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        'Live: reconnecting\u2026',
      );
    });
  });

  describe('tooltip', () => {
    it.each<[HubState, string]>([
      ['connected', 'Live updates are flowing.'],
      ['reconnecting', 'Lost the live connection \u2014 retrying.'],
      ['connecting', 'Establishing the live connection.'],
      [
        'disconnected',
        'The live connection was lost. Updates will resume on reconnect.',
      ],
      ['idle', 'Live updates connect automatically when you open a run.'],
    ])('maps "%s" state to the correct tooltip copy', (state, expected) => {
      const { internals } = render(state);
      expect(internals.hubTooltip()).toBe(expected);
    });
  });

  it('falls back to the idle label and tooltip for an unknown state', () => {
    // Both computeds use `default:` in their switch — an unexpected value
    // (e.g. a new hub state not yet handled) degrades to the neutral copy.
    hub.state.set('something-new' as unknown as HubState);
    const fixture = TestBed.createComponent(HubStatusBadge);
    fixture.detectChanges();
    const internals = fixture.componentInstance as unknown as BadgeInternals;

    expect(internals.hubLabel()).toBe('Live: ready');
    expect(internals.hubTooltip()).toBe(
      'Live updates connect automatically when you open a run.',
    );
  });
});
