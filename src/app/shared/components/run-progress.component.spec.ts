import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { RunProgressComponent } from './run-progress.component';

/** Typed view of the component's protected computed members. */
interface Internals {
  mode: () => 'determinate' | 'indeterminate';
  percent: () => number;
  percentLabel: () => string;
  ariaLabel: () => string;
}

describe('RunProgressComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RunProgressComponent] });
  });

  /** Creates the component with both required inputs and returns its internals. */
  function render(completed: number, total: number): Internals {
    const fixture = TestBed.createComponent(RunProgressComponent);
    const ref = fixture.componentRef as ComponentRef<RunProgressComponent>;
    ref.setInput('completed', completed);
    ref.setInput('total', total);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  describe('mode', () => {
    it('is determinate when the total is known', () => {
      expect(render(2, 4).mode()).toBe('determinate');
    });

    it('is indeterminate while the total is not yet established (0)', () => {
      // The orchestrator is still chunking — totalChunks is 0.
      expect(render(0, 0).mode()).toBe('indeterminate');
    });
  });

  describe('percent', () => {
    it('computes a rounded percentage from completed / total', () => {
      expect(render(1, 4).percent()).toBe(25);
    });

    it('rounds a fractional percentage to the nearest integer', () => {
      // 1/3 = 33.33% → 33
      expect(render(1, 3).percent()).toBe(33);
    });

    it('is 100 for a fully completed run', () => {
      expect(render(4, 4).percent()).toBe(100);
    });

    it('is 0 when the total is zero (no divide-by-zero)', () => {
      expect(render(0, 0).percent()).toBe(0);
    });

    it('clamps to 100 when completed exceeds total', () => {
      // A late chunk-count overshoot must not produce 125%.
      expect(render(5, 4).percent()).toBe(100);
    });
  });

  describe('percentLabel', () => {
    it('formats the percentage with a percent sign', () => {
      expect(render(1, 4).percentLabel()).toBe('25%');
    });

    it('shows 0% while indeterminate', () => {
      expect(render(0, 0).percentLabel()).toBe('0%');
    });
  });

  describe('ariaLabel', () => {
    it('describes the chunk progress for assistive tech', () => {
      expect(render(3, 10).ariaLabel()).toBe(
        'Run progress: 3 of 10 chunks complete',
      );
    });
  });

  describe('rendered output', () => {
    it('renders the chunk caption from the inputs', () => {
      const fixture = TestBed.createComponent(RunProgressComponent);
      fixture.componentRef.setInput('completed', 2);
      fixture.componentRef.setInput('total', 8);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const caption = el.querySelector('.progress__caption')?.textContent ?? '';
      expect(caption).toContain('2 / 8 chunks');
      expect(caption).toContain('25%');
    });

    it('exposes the aria-label on the progress group', () => {
      const fixture = TestBed.createComponent(RunProgressComponent);
      fixture.componentRef.setInput('completed', 1);
      fixture.componentRef.setInput('total', 2);
      fixture.detectChanges();

      const group = (fixture.nativeElement as HTMLElement).querySelector(
        '.progress',
      );
      expect(group?.getAttribute('aria-label')).toBe(
        'Run progress: 1 of 2 chunks complete',
      );
    });

    it('updates reactively when the completed count changes', () => {
      const fixture = TestBed.createComponent(RunProgressComponent);
      const ref = fixture.componentRef as ComponentRef<RunProgressComponent>;
      ref.setInput('completed', 1);
      ref.setInput('total', 4);
      fixture.detectChanges();

      const internals = fixture.componentInstance as unknown as Internals;
      expect(internals.percent()).toBe(25);

      ref.setInput('completed', 3);
      fixture.detectChanges();
      expect(internals.percent()).toBe(75);
    });
  });
});
