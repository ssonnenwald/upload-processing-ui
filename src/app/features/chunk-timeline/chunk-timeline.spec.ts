import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { ChunkTimeline } from './chunk-timeline';
import type { ChunkSummary } from '@core/models/run.models';

// --- Layout constants mirrored from the component (for assertions) -----------
const ROW_HEIGHT_MAX = 22;
const MAX_PLOT_HEIGHT = 520;
const BAR_FILL = 0.7;
const PLOT_WIDTH = 900;
const LABEL_GUTTER = 96;
const MIN_BAR_WIDTH = 3;

/** A fixed "now" so still-running chunks produce deterministic bar widths. */
const NOW = Date.parse('2026-05-17T12:00:00.000Z');

/** Build an ISO timestamp offset from NOW by the given milliseconds. */
function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

function makeChunk(over: Partial<ChunkSummary> = {}): ChunkSummary {
  return {
    chunkSk: 'CHUNK#0001',
    chunkIndex: 1,
    startingRow: 1,
    endingRow: 50,
    status: 'Succeeded',
    attemptCount: 1,
    succeeded: 50,
    failedValid: 0,
    invalid: 0,
    skipped: 0,
    errorSummary: null,
    startedAt: at(0),
    completedAt: at(1000),
    ...over,
  };
}

/** Typed view of the component's protected computed members. */
interface Internals {
  rowHeight: () => number;
  barHeight: () => number;
  isDense: () => boolean;
  notStartedCount: () => number;
  isEmpty: () => boolean;
  spanMs: () => number;
  spanText: () => string;
  svgHeight: () => number;
  bars: () => ReadonlyArray<{
    chunkSk: string;
    label: string;
    status: string;
    statusKey: string;
    x: number;
    width: number;
    y: number;
    durationText: string;
    tooltip: string;
  }>;
}

describe('ChunkTimeline', () => {
  beforeEach(() => {
    // Fix the clock — `window`/`bars` use Date.now() for running chunks.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({ imports: [ChunkTimeline] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Creates the component with the given chunks and returns its internals. */
  function render(chunks: readonly ChunkSummary[]): Internals {
    const fixture = TestBed.createComponent(ChunkTimeline);
    const ref = fixture.componentRef as ComponentRef<ChunkTimeline>;
    ref.setInput('chunks', chunks);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  describe('empty / not-started handling', () => {
    it('reports isEmpty when there are no chunks at all', () => {
      const c = render([]);
      expect(c.isEmpty()).toBe(true);
      expect(c.notStartedCount()).toBe(0);
    });

    it('reports isEmpty when every chunk is still Pending (no startedAt)', () => {
      const c = render([
        makeChunk({ chunkSk: 'CHUNK#0001', startedAt: null }),
        makeChunk({ chunkSk: 'CHUNK#0002', startedAt: null }),
      ]);
      expect(c.isEmpty()).toBe(true);
      // Both chunks are counted as not-started.
      expect(c.notStartedCount()).toBe(2);
    });

    it('counts not-started chunks separately from plotted ones', () => {
      const c = render([
        makeChunk({ chunkSk: 'CHUNK#0001', startedAt: at(0) }),
        makeChunk({ chunkSk: 'CHUNK#0002', startedAt: null }),
      ]);
      expect(c.isEmpty()).toBe(false);
      expect(c.notStartedCount()).toBe(1);
      expect(c.bars()).toHaveLength(1);
    });

    it('uses the comfortable max row height when there is nothing to plot', () => {
      const c = render([]);
      expect(c.rowHeight()).toBe(ROW_HEIGHT_MAX);
    });
  });

  describe('row height and density', () => {
    it('uses the full row height for a small run', () => {
      const c = render([makeChunk()]);
      expect(c.rowHeight()).toBe(ROW_HEIGHT_MAX);
      expect(c.isDense()).toBe(false);
    });

    it('thins rows to fit the plot-height cap for a large run', () => {
      // 100 chunks: MAX_PLOT_HEIGHT / 100 = 5.2, below the comfortable max.
      const chunks = Array.from({ length: 100 }, (_, i) =>
        makeChunk({
          chunkSk: `CHUNK#${i}`,
          startedAt: at(i),
          completedAt: at(i + 1),
        }),
      );
      const c = render(chunks);

      expect(c.rowHeight()).toBeCloseTo(MAX_PLOT_HEIGHT / 100, 5);
      expect(c.rowHeight()).toBeLessThan(ROW_HEIGHT_MAX);
      expect(c.isDense()).toBe(true);
    });

    it('never grows rows past the comfortable max even for very few chunks', () => {
      // One chunk: MAX_PLOT_HEIGHT / 1 = 520, but the row is capped.
      const c = render([makeChunk()]);
      expect(c.rowHeight()).toBe(ROW_HEIGHT_MAX);
    });

    it('derives bar height as a fixed fraction of the row height', () => {
      const c = render([makeChunk()]);
      expect(c.barHeight()).toBeCloseTo(ROW_HEIGHT_MAX * BAR_FILL, 5);
    });
  });

  describe('time window and span', () => {
    it('spans from the earliest start to the latest completion', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(0), completedAt: at(2000) }),
        makeChunk({ chunkSk: 'B', startedAt: at(500), completedAt: at(5000) }),
      ]);
      // earliest start 0, latest end 5000 → 5s span.
      expect(c.spanMs()).toBe(5000);
    });

    it('treats a still-running chunk as ending "now"', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(-3000), completedAt: null }),
      ]);
      // Started 3s before the fixed NOW, not yet complete → 3s span.
      expect(c.spanMs()).toBe(3000);
    });

    it('guards a degenerate window so the span is never zero', () => {
      // A single instantaneous chunk (start === end).
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(1000), completedAt: at(1000) }),
      ]);
      // end is bumped to start + 1 so the scale never divides by zero.
      expect(c.spanMs()).toBe(1);
    });
  });

  describe('duration formatting (via spanText)', () => {
    it('formats sub-second spans in milliseconds', () => {
      const c = render([makeChunk({ startedAt: at(0), completedAt: at(250) })]);
      expect(c.spanText()).toBe('250 ms');
    });

    it('formats multi-second spans with one decimal', () => {
      const c = render([
        makeChunk({ startedAt: at(0), completedAt: at(4500) }),
      ]);
      expect(c.spanText()).toBe('4.5 s');
    });

    it('formats spans over a minute as minutes and seconds', () => {
      const c = render([
        makeChunk({ startedAt: at(0), completedAt: at(90_000) }),
      ]);
      // 90s → "1m 30s"
      expect(c.spanText()).toBe('1m 30s');
    });
  });

  describe('bars', () => {
    it('produces one bar per plottable chunk', () => {
      const c = render([
        makeChunk({ chunkSk: 'CHUNK#0001', startedAt: at(0) }),
        makeChunk({ chunkSk: 'CHUNK#0002', startedAt: at(1000) }),
      ]);
      expect(c.bars()).toHaveLength(2);
    });

    it('sorts bars by start time regardless of input order', () => {
      const c = render([
        makeChunk({
          chunkSk: 'LATE',
          startedAt: at(5000),
          completedAt: at(6000),
        }),
        makeChunk({
          chunkSk: 'EARLY',
          startedAt: at(0),
          completedAt: at(1000),
        }),
      ]);
      expect(c.bars().map((b) => b.chunkSk)).toEqual(['EARLY', 'LATE']);
    });

    it('positions the first bar at the label gutter (x === LABEL_GUTTER)', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(0), completedAt: at(1000) }),
      ]);
      expect(c.bars()[0].x).toBeCloseTo(LABEL_GUTTER, 5);
    });

    it('maps a chunk spanning the full window to the full plot width', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(0), completedAt: at(4000) }),
      ]);
      // Single chunk fills the whole window → width === PLOT_WIDTH.
      expect(c.bars()[0].width).toBeCloseTo(PLOT_WIDTH, 5);
    });

    it('clamps a near-instant chunk to the minimum bar width', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(0), completedAt: at(10_000) }),
        // 1ms chunk inside a 10s window → raw width ~0.09px, clamped up.
        makeChunk({ chunkSk: 'B', startedAt: at(5000), completedAt: at(5001) }),
      ]);
      const tiny = c.bars().find((b) => b.chunkSk === 'B');
      expect(tiny?.width).toBe(MIN_BAR_WIDTH);
    });

    it('stacks bars one row apart in sorted order', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(0), completedAt: at(1000) }),
        makeChunk({ chunkSk: 'B', startedAt: at(1000), completedAt: at(2000) }),
      ]);
      const [first, second] = c.bars();
      // Each row is rowHeight() tall; the second bar sits one row lower.
      expect(second.y - first.y).toBeCloseTo(c.rowHeight(), 5);
    });

    it('shortens the chunkSk into a compact label', () => {
      const c = render([makeChunk({ chunkSk: 'CHUNK#0007' })]);
      expect(c.bars()[0].label).toBe('#0007');
    });

    it('lower-cases the status into statusKey for the colour attribute', () => {
      const c = render([makeChunk({ status: 'Failed' })]);
      expect(c.bars()[0].statusKey).toBe('failed');
    });

    it('marks a running chunk\'s duration text with "(running)"', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(-2000), completedAt: null }),
      ]);
      expect(c.bars()[0].durationText).toContain('(running)');
    });

    it('builds a tooltip combining chunk id, status, and duration', () => {
      const c = render([
        makeChunk({
          chunkSk: 'CHUNK#0001',
          status: 'Succeeded',
          startedAt: at(0),
          completedAt: at(1000),
        }),
      ]);
      const tip = c.bars()[0].tooltip;
      expect(tip).toContain('CHUNK#0001');
      expect(tip).toContain('Succeeded');
      expect(tip).toContain('1.0 s');
    });
  });

  describe('svgHeight', () => {
    it('allocates one row per plotted chunk plus the axis strip', () => {
      const c = render([
        makeChunk({ chunkSk: 'A', startedAt: at(0) }),
        makeChunk({ chunkSk: 'B', startedAt: at(1000) }),
      ]);
      // 2 rows * rowHeight + 28px axis strip.
      expect(c.svgHeight()).toBeCloseTo(2 * c.rowHeight() + 28, 5);
    });
  });
});
