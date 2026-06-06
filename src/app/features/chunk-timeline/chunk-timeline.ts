import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import type { ChunkSummary } from '@core/models/run.models';

/**
 * One chunk laid out for the SVG timeline — a positioned, sized bar.
 */
interface TimelineBar {
  readonly chunkSk: string;
  readonly label: string;
  readonly status: string;
  /** Status lower-cased, for the data-attribute that drives the bar colour. */
  readonly statusKey: string;
  /** x offset in px from the timeline's left edge. */
  readonly x: number;
  /** Bar width in px. Clamped to a minimum so a near-instant chunk stays visible. */
  readonly width: number;
  /** y offset in px — one row per chunk. */
  readonly y: number;
  /** Human-readable duration for the tooltip / label. */
  readonly durationText: string;
  /** Tooltip text — chunk, status, timing. */
  readonly tooltip: string;
  /** True when the chunk has no usable start/end times (rendered as a stub). */
  readonly incomplete: boolean;
}

/**
 * Renders a run's chunks as a horizontal SVG timeline — each chunk a bar
 * positioned by startedAt and spanning to completedAt.
 *
 * The point of this view: it makes the pipeline's concurrency pattern visible.
 * Chunks that all start near-simultaneously and finish within a second of each
 * other show up as a tight vertical stack of bars rather than a staircase —
 * which is the behaviour worth noticing when reasoning about throughput.
 *
 * Self-contained: takes `chunks` as an input and renders. Drop it into the run
 * details page (or anywhere a ChunkSummary[] is available) with one line.
 * Pure SVG, no charting dependency.
 */
@Component({
  selector: 'app-chunk-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatCardModule],
  templateUrl: './chunk-timeline.html',
  styleUrl: './chunk-timeline.scss',
})
export class ChunkTimeline {
  /** The run's chunks. Order doesn't matter — bars are sorted by start time. */
  readonly chunks = input.required<readonly ChunkSummary[]>();

  // --- Layout constants -----------------------------------------------------
  /** Row height for a small run — comfortable, easy to hover. */
  private static readonly ROW_HEIGHT_MAX = 22;
  /**
   * Cap on the plotted area's height. Big runs are thinned to fit inside this
   * (with no lower bound on row height) so the whole timeline stays on one
   * screen as a single readable shape — you can only see a staircase if every
   * step is visible at once.
   */
  private static readonly MAX_PLOT_HEIGHT = 520;
  /** Fraction of the row height the drawn bar occupies (rest is the gap). */
  private static readonly BAR_FILL = 0.7;
  /** Width of the plotted area (the SVG viewBox scales this to fit). */
  private static readonly PLOT_WIDTH = 900;
  /** Left gutter for the chunk labels. */
  private static readonly LABEL_GUTTER = 96;
  /** Minimum bar width so a sub-second chunk is still visible/hoverable. */
  private static readonly MIN_BAR_WIDTH = 3;

  /**
   * Row height for this run — full size for a small number of chunks, thinned
   * to fit MAX_PLOT_HEIGHT once the run is large. There is no lower bound: a
   * big run is allowed to produce hairline rows so the whole timeline fits on
   * one screen. The chart's job is the *shape* (the concurrency pattern); the
   * chunks table above carries per-chunk detail, so losing hover on thin bars
   * costs nothing.
   */
  protected readonly rowHeight = computed(() => {
    const n = this.plottable().length;
    if (n === 0) return ChunkTimeline.ROW_HEIGHT_MAX;
    const fit = ChunkTimeline.MAX_PLOT_HEIGHT / n;
    // Only clamp the upper end — never grow rows past the comfortable max.
    // No floor: big runs thin freely so the timeline stays one screen tall.
    return Math.min(ChunkTimeline.ROW_HEIGHT_MAX, fit);
  });

  /** Drawn bar height — a fixed fraction of the (possibly thinned) row. */
  protected readonly barHeight = computed(
    () => this.rowHeight() * ChunkTimeline.BAR_FILL,
  );

  /** True when rows have been thinned below the comfortable size. */
  protected readonly isDense = computed(
    () => this.rowHeight() < ChunkTimeline.ROW_HEIGHT_MAX,
  );

  /**
   * Chunks that have a usable startedAt — only these can be plotted on a time
   * axis. A chunk still Pending (no startedAt) is reported separately so the
   * template can note it rather than silently dropping it.
   */
  private readonly plottable = computed(() =>
    this.chunks().filter((c) => c.startedAt !== null),
  );

  /** Count of chunks with no startedAt yet (not on the timeline). */
  protected readonly notStartedCount = computed(
    () => this.chunks().length - this.plottable().length,
  );

  /** True when there is nothing to plot at all. */
  protected readonly isEmpty = computed(() => this.plottable().length === 0);

  /**
   * The time window the timeline spans: earliest start to latest end. A chunk
   * with no completedAt (still running) is treated as ending "now" so its bar
   * has a sensible length.
   */
  private readonly window = computed<{ start: number; end: number }>(() => {
    const now = Date.now();
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;

    for (const c of this.plottable()) {
      const s = Date.parse(c.startedAt as string);
      const e = c.completedAt ? Date.parse(c.completedAt) : now;
      if (s < start) start = s;
      if (e > end) end = e;
    }
    // Guard a degenerate window (one instantaneous chunk) so the scale below
    // never divides by zero.
    if (!Number.isFinite(start)) return { start: now, end: now + 1 };
    if (end <= start) end = start + 1;
    return { start, end };
  });

  /** Total milliseconds the timeline covers — for the axis labels. */
  protected readonly spanMs = computed(() => {
    const w = this.window();
    return w.end - w.start;
  });

  /** Human-readable total span, shown on the axis. */
  protected readonly spanText = computed(() =>
    ChunkTimeline.formatDuration(this.spanMs()),
  );

  /** SVG viewBox height — one row per plotted chunk, plus the axis strip. */
  protected readonly svgHeight = computed(
    () => this.plottable().length * this.rowHeight() + 28,
  );

  /** Full viewBox width (label gutter + plot area). */
  protected readonly svgWidth =
    ChunkTimeline.LABEL_GUTTER + ChunkTimeline.PLOT_WIDTH;

  /** Left edge of the plotted bars — exposed for the axis baseline. */
  protected readonly plotLeft = ChunkTimeline.LABEL_GUTTER;
  protected readonly plotWidth = ChunkTimeline.PLOT_WIDTH;

  /**
   * The positioned bars, one per plottable chunk, sorted by start time so the
   * stack reads top-to-bottom in execution order.
   */
  protected readonly bars = computed<TimelineBar[]>(() => {
    const { start, end } = this.window();
    const span = end - start || 1;
    const now = Date.now();
    const rowH = this.rowHeight();
    const barH = this.barHeight();
    // Vertical gap above the bar so it sits centred within its (thinned) row.
    const yPad = (rowH - barH) / 2;

    const sorted = [...this.plottable()].sort(
      (a, b) =>
        Date.parse(a.startedAt as string) - Date.parse(b.startedAt as string),
    );

    return sorted.map((c, index) => {
      const s = Date.parse(c.startedAt as string);
      const e = c.completedAt ? Date.parse(c.completedAt) : now;
      const running = c.completedAt === null;

      // Map the time window onto the plot width.
      const x =
        ChunkTimeline.LABEL_GUTTER +
        ((s - start) / span) * ChunkTimeline.PLOT_WIDTH;
      const rawWidth = ((e - s) / span) * ChunkTimeline.PLOT_WIDTH;
      const width = Math.max(rawWidth, ChunkTimeline.MIN_BAR_WIDTH);

      const durationText = running
        ? `${ChunkTimeline.formatDuration(e - s)} (running)`
        : ChunkTimeline.formatDuration(e - s);

      return {
        chunkSk: c.chunkSk,
        label: c.chunkSk.replace('CHUNK#', '#'),
        status: c.status,
        statusKey: c.status.toLowerCase(),
        x,
        width,
        y: index * rowH + yPad,
        durationText,
        tooltip: `${c.chunkSk} · ${c.status} · ${durationText}`,
        incomplete: false,
      };
    });
  });

  /** Formats a millisecond duration as a compact human string. */
  private static formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const minutes = Math.floor(seconds / 60);
    const rem = Math.round(seconds % 60);
    return `${minutes}m ${rem}s`;
  }
}
