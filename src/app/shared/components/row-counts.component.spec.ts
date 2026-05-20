import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { RowCountsComponent } from './row-counts.component';

interface Counts {
  succeeded: number;
  failedValid: number;
  invalid: number;
  skipped: number;
}

describe('RowCountsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RowCountsComponent] });
  });

  /**
   * Creates the component with all four required inputs set and returns the
   * root element. All four must be provided — they are input.required.
   */
  function render(counts: Counts): HTMLElement {
    const fixture = TestBed.createComponent(RowCountsComponent);
    const ref = fixture.componentRef as ComponentRef<RowCountsComponent>;
    ref.setInput('succeeded', counts.succeeded);
    ref.setInput('failedValid', counts.failedValid);
    ref.setInput('invalid', counts.invalid);
    ref.setInput('skipped', counts.skipped);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Reads the displayed value for a count cell by its modifier class. */
  function valueOf(el: HTMLElement, modifier: string): string {
    return (
      el
        .querySelector(`.count--${modifier} .count__value`)
        ?.textContent?.trim() ?? ''
    );
  }

  it('creates', () => {
    const fixture = TestBed.createComponent(RowCountsComponent);
    fixture.componentRef.setInput('succeeded', 0);
    fixture.componentRef.setInput('failedValid', 0);
    fixture.componentRef.setInput('invalid', 0);
    fixture.componentRef.setInput('skipped', 0);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders all four count cells', () => {
    const el = render({ succeeded: 1, failedValid: 2, invalid: 3, skipped: 4 });
    expect(el.querySelectorAll('.count')).toHaveLength(4);
  });

  it('displays each input value in its matching cell', () => {
    const el = render({
      succeeded: 198,
      failedValid: 5,
      invalid: 2,
      skipped: 9,
    });
    expect(valueOf(el, 'succeeded')).toBe('198');
    expect(valueOf(el, 'failed')).toBe('5');
    expect(valueOf(el, 'invalid')).toBe('2');
    expect(valueOf(el, 'skipped')).toBe('9');
  });

  it('pairs each value with the correct label', () => {
    const el = render({ succeeded: 1, failedValid: 2, invalid: 3, skipped: 4 });

    const labelOf = (modifier: string): string =>
      el
        .querySelector(`.count--${modifier} .count__label`)
        ?.textContent?.trim() ?? '';

    expect(labelOf('succeeded')).toBe('Succeeded');
    expect(labelOf('failed')).toBe('Failed');
    expect(labelOf('invalid')).toBe('Invalid');
    expect(labelOf('skipped')).toBe('Skipped');
  });

  it('renders zero values', () => {
    const el = render({ succeeded: 0, failedValid: 0, invalid: 0, skipped: 0 });
    expect(valueOf(el, 'succeeded')).toBe('0');
    expect(valueOf(el, 'failed')).toBe('0');
    expect(valueOf(el, 'invalid')).toBe('0');
    expect(valueOf(el, 'skipped')).toBe('0');
  });

  it('updates a cell reactively when its input changes', () => {
    const fixture = TestBed.createComponent(RowCountsComponent);
    const ref = fixture.componentRef as ComponentRef<RowCountsComponent>;
    ref.setInput('succeeded', 10);
    ref.setInput('failedValid', 0);
    ref.setInput('invalid', 0);
    ref.setInput('skipped', 0);
    fixture.detectChanges();
    expect(valueOf(fixture.nativeElement, 'succeeded')).toBe('10');

    // A new value flows through to the rendered cell.
    ref.setInput('succeeded', 42);
    fixture.detectChanges();
    expect(valueOf(fixture.nativeElement, 'succeeded')).toBe('42');
  });
});
