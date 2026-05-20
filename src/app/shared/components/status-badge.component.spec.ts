import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { StatusBadgeComponent } from './status-badge.component';
import type { ChunkStatus, RunStatus } from '@core/models/run.models';

/** Typed view of the component's protected helper. */
interface Internals {
  statusKey: () => string;
}

describe('StatusBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatusBadgeComponent] });
  });

  /** Creates the component with a status and returns element + internals. */
  function render(status: RunStatus | ChunkStatus): {
    el: HTMLElement;
    badge: HTMLElement;
    internals: Internals;
  } {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    const ref = fixture.componentRef as ComponentRef<StatusBadgeComponent>;
    ref.setInput('status', status);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      el,
      badge: el.querySelector('.badge') as HTMLElement,
      internals: fixture.componentInstance as unknown as Internals,
    };
  }

  it('creates', () => {
    const { internals } = render('Completed');
    expect(internals).toBeTruthy();
  });

  describe('rendered text', () => {
    it('renders the status string as the badge label', () => {
      const { badge } = render('Completed');
      expect(badge.textContent?.trim()).toBe('Completed');
    });

    it('renders a chunk status the same way', () => {
      const { badge } = render('Succeeded');
      expect(badge.textContent?.trim()).toBe('Succeeded');
    });
  });

  describe('statusKey / data-status attribute', () => {
    it('lower-cases the status for the data-status attribute', () => {
      const { badge, internals } = render('InProgress');
      expect(internals.statusKey()).toBe('inprogress');
      expect(badge.getAttribute('data-status')).toBe('inprogress');
    });

    it('lower-cases a multi-word status without spaces', () => {
      // 'CompletedWithErrors' → 'completedwitherrors', matching the CSS rule.
      const { badge } = render('CompletedWithErrors');
      expect(badge.getAttribute('data-status')).toBe('completedwitherrors');
    });

    it.each<RunStatus>([
      'Pending',
      'Chunking',
      'InProgress',
      'Completed',
      'CompletedWithErrors',
      'Failed',
    ])('maps run status "%s" to its lower-cased data-status', (status) => {
      const { badge } = render(status);
      expect(badge.getAttribute('data-status')).toBe(status.toLowerCase());
    });

    it.each<ChunkStatus>(['Pending', 'InProgress', 'Succeeded', 'Failed'])(
      'maps chunk status "%s" to its lower-cased data-status',
      (status) => {
        const { badge } = render(status);
        expect(badge.getAttribute('data-status')).toBe(status.toLowerCase());
      },
    );
  });

  describe('reactivity', () => {
    it('updates the label and data-status when the input changes', () => {
      const fixture = TestBed.createComponent(StatusBadgeComponent);
      const ref = fixture.componentRef as ComponentRef<StatusBadgeComponent>;
      ref.setInput('status', 'Pending');
      fixture.detectChanges();

      let badge = (fixture.nativeElement as HTMLElement).querySelector(
        '.badge',
      ) as HTMLElement;
      expect(badge.getAttribute('data-status')).toBe('pending');

      // A status change (e.g. a live SignalR update) flows through.
      ref.setInput('status', 'Failed');
      fixture.detectChanges();
      badge = (fixture.nativeElement as HTMLElement).querySelector(
        '.badge',
      ) as HTMLElement;
      expect(badge.textContent?.trim()).toBe('Failed');
      expect(badge.getAttribute('data-status')).toBe('failed');
    });
  });
});
