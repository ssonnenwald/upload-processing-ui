import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { ChunksTableComponent } from './chunks-table.component';
import type { ChunkSummary } from '@core/models/run.models';
import { makeChunk } from '@testing/factories';

describe('ChunksTableComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ChunksTableComponent] });
  });

  /** Creates the component with the given chunks and returns the root element. */
  function render(chunks: readonly ChunkSummary[]): HTMLElement {
    const fixture = TestBed.createComponent(ChunksTableComponent);
    const ref = fixture.componentRef as ComponentRef<ChunksTableComponent>;
    ref.setInput('chunks', chunks);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('creates', () => {
    const fixture = TestBed.createComponent(ChunksTableComponent);
    fixture.componentRef.setInput('chunks', []);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('empty state', () => {
    it('shows the empty message and no table when there are no chunks', () => {
      const el = render([]);
      expect(el.querySelector('.chunks__empty')).not.toBeNull();
      expect(el.querySelector('table')).toBeNull();
    });

    it('reports a chunk count of zero in the header', () => {
      const el = render([]);
      expect(el.querySelector('.chunks__header h3')?.textContent).toContain(
        '(0)',
      );
    });
  });

  describe('populated table', () => {
    it('renders a table and hides the empty message when chunks exist', () => {
      const el = render([makeChunk()]);
      expect(el.querySelector('table')).not.toBeNull();
      expect(el.querySelector('.chunks__empty')).toBeNull();
    });

    it('shows the chunk count in the header', () => {
      const el = render([
        makeChunk({ chunkSk: 'CHUNK#0001' }),
        makeChunk({ chunkSk: 'CHUNK#0002' }),
        makeChunk({ chunkSk: 'CHUNK#0003' }),
      ]);
      expect(el.querySelector('.chunks__header h3')?.textContent).toContain(
        '(3)',
      );
    });

    it('renders one data row per chunk', () => {
      const el = render([
        makeChunk({ chunkSk: 'CHUNK#0001' }),
        makeChunk({ chunkSk: 'CHUNK#0002' }),
      ]);
      // mat-row carries the .mat-mdc-row class for data rows.
      const rows = el.querySelectorAll('tr.mat-mdc-row');
      expect(rows).toHaveLength(2);
    });

    it('shows the row range for a chunk', () => {
      const el = render([makeChunk({ startingRow: 51, endingRow: 100 })]);
      expect(el.querySelector('.chunks__rows')?.textContent).toContain(
        '51–100',
      );
    });
  });

  describe('conditional cell styling', () => {
    it('flags a retried chunk (attemptCount > 1) with the retry class', () => {
      const el = render([makeChunk({ attemptCount: 3 })]);
      expect(el.querySelector('.chunks__retry')).not.toBeNull();
    });

    it('does not flag a chunk with a single attempt', () => {
      const el = render([makeChunk({ attemptCount: 1 })]);
      expect(el.querySelector('.chunks__retry')).toBeNull();
    });

    it('flags a chunk with validation failures', () => {
      const el = render([makeChunk({ failedValid: 2 })]);
      expect(el.querySelector('.chunks__has-failures')).not.toBeNull();
    });

    it('flags a chunk with invalid rows', () => {
      const el = render([makeChunk({ invalid: 1 })]);
      expect(el.querySelector('.chunks__has-failures')).not.toBeNull();
    });

    it('does not apply the failure class to a clean chunk', () => {
      const el = render([makeChunk({ failedValid: 0, invalid: 0 })]);
      expect(el.querySelector('.chunks__has-failures')).toBeNull();
    });
  });

  describe('completion and error cells', () => {
    it('shows a pending dash for a chunk with no completedAt', () => {
      const el = render([makeChunk({ completedAt: null })]);
      expect(el.querySelector('.chunks__pending')).not.toBeNull();
    });

    it('does not show the pending dash once a chunk has completed', () => {
      const el = render([makeChunk({ completedAt: '2026-05-17T12:00:30Z' })]);
      expect(el.querySelector('.chunks__pending')).toBeNull();
    });

    it('renders the error summary text when a chunk has one', () => {
      const el = render([makeChunk({ errorSummary: 'Row 12: bad value' })]);
      const cell = el.querySelector('.chunks__error-cell');
      expect(cell?.textContent).toContain('Row 12: bad value');
    });

    it('leaves the error cell empty when there is no error', () => {
      const el = render([makeChunk({ errorSummary: null })]);
      const cell = el.querySelector('.chunks__error-cell');
      expect(cell?.textContent?.trim()).toBe('');
    });
  });
});
