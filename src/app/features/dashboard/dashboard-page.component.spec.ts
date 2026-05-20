import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { DashboardPageComponent } from './dashboard-page.component';
import { RunsApi } from '@core/api/runs-api.service';
import { PipelineHealthApi } from '@core/api/pipeline-health-api.service';
import type { RunListItem, RunStatus } from '@core/models/run.models';
import type { QueueDepth } from '@core/models/pipeline-health.models';
import {
  makeRunListItem,
  makeSummary,
  makeQueue,
  makeHealth,
} from '@testing/factories';

/** Typed view of the component's protected computed members. */
interface Internals {
  tiles: () => ReadonlyArray<{
    status: RunStatus;
    label: string;
    count: number;
  }>;
  activeCount: () => number;
  stuckDlqs: () => readonly QueueDepth[];
  activeRuns: () => readonly RunListItem[];
  summaryError: () => string | null;
  healthError: () => string | null;
  activeError: () => string | null;
  summaryLoading: () => boolean;
  openStatus: (s: RunStatus) => void;
  openRun: (r: RunListItem) => void;
  loadAll: () => void;
}

interface RunsApiMock {
  getSummary: Mock;
  listRuns: Mock;
}
interface HealthApiMock {
  getHealth: Mock;
}

describe('DashboardPageComponent', () => {
  let runsApi: RunsApiMock;
  let healthApi: HealthApiMock;
  let navSpy: Mock;

  beforeEach(() => {
    runsApi = {
      getSummary: vi.fn().mockReturnValue(of(makeSummary())),
      listRuns: vi.fn().mockReturnValue(of([])),
    };
    healthApi = {
      getHealth: vi.fn().mockReturnValue(of(makeHealth([]))),
    };

    TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        // provideRouter supplies Router AND ActivatedRoute — RouterLink in
        // the template needs the latter.
        provideRouter([]),
        { provide: RunsApi, useValue: runsApi },
        { provide: PipelineHealthApi, useValue: healthApi },
      ],
    });
    // Spy on the real router's navigate so navigation can be asserted.
    const router = TestBed.inject(Router);
    navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true) as Mock;
  });

  function render(): Internals {
    const fixture = TestBed.createComponent(DashboardPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  it('loads all three data sources on construction', () => {
    render();
    expect(runsApi.getSummary).toHaveBeenCalledTimes(1);
    expect(healthApi.getHealth).toHaveBeenCalledTimes(1);
    expect(runsApi.listRuns).toHaveBeenCalledTimes(3);
  });

  describe('tiles', () => {
    it('produces a tile for every status in display order', () => {
      const c = render();
      expect(c.tiles().map((t) => t.status)).toEqual([
        'Pending',
        'Chunking',
        'InProgress',
        'Completed',
        'CompletedWithErrors',
        'Failed',
      ]);
    });

    it('defaults a status with no count to zero', () => {
      const c = render();
      expect(c.tiles().every((t) => t.count === 0)).toBe(true);
    });

    it('maps summary counts onto the matching tiles', () => {
      runsApi.getSummary.mockReturnValue(
        of(
          makeSummary([
            { status: 'Completed', count: 42 },
            { status: 'Failed', count: 3 },
          ]),
        ),
      );
      const c = render();

      const byStatus = new Map(c.tiles().map((t) => [t.status, t.count]));
      expect(byStatus.get('Completed')).toBe(42);
      expect(byStatus.get('Failed')).toBe(3);
      expect(byStatus.get('Pending')).toBe(0);
    });
  });

  describe('activeCount', () => {
    it('sums only the non-terminal status counts', () => {
      runsApi.getSummary.mockReturnValue(
        of(
          makeSummary([
            { status: 'Pending', count: 2 },
            { status: 'Chunking', count: 1 },
            { status: 'InProgress', count: 4 },
            { status: 'Completed', count: 100 },
            { status: 'Failed', count: 9 },
          ]),
        ),
      );
      const c = render();
      expect(c.activeCount()).toBe(7);
    });

    it('is zero when there are no active runs', () => {
      const c = render();
      expect(c.activeCount()).toBe(0);
    });
  });

  describe('stuckDlqs', () => {
    it('flags a configured DLQ with visible messages and no error', () => {
      healthApi.getHealth.mockReturnValue(
        of(
          makeHealth([
            makeQueue({ name: 'orch-dlq', visibleMessages: 5 }),
            makeQueue({ name: 'empty-dlq', visibleMessages: 0 }),
          ]),
        ),
      );
      const c = render();
      expect(c.stuckDlqs().map((q) => q.name)).toEqual(['orch-dlq']);
    });

    it('ignores an unconfigured DLQ even if it reports messages', () => {
      healthApi.getHealth.mockReturnValue(
        of(
          makeHealth([
            makeQueue({
              name: 'unconfigured',
              configured: false,
              visibleMessages: 99,
            }),
          ]),
        ),
      );
      const c = render();
      expect(c.stuckDlqs()).toHaveLength(0);
    });

    it('ignores a DLQ whose depth could not be read (error set)', () => {
      healthApi.getHealth.mockReturnValue(
        of(
          makeHealth([
            makeQueue({
              name: 'errored',
              visibleMessages: 5,
              error: 'AccessDenied',
            }),
          ]),
        ),
      );
      const c = render();
      expect(c.stuckDlqs()).toHaveLength(0);
    });

    it('only considers DLQ-role queues — source queues are filtered out earlier', () => {
      healthApi.getHealth.mockReturnValue(
        of(
          makeHealth([
            makeQueue({ name: 'source-q', role: 'source', visibleMessages: 9 }),
            makeQueue({ name: 'dlq-q', role: 'dlq', visibleMessages: 0 }),
          ]),
        ),
      );
      const c = render();
      expect(c.stuckDlqs()).toHaveLength(0);
    });
  });

  describe('active runs', () => {
    it('merges the per-status results, newest first, capped at the limit', () => {
      runsApi.listRuns
        .mockReturnValueOnce(
          of([
            makeRunListItem({ runId: 'A', uploadedAt: '2026-05-17T10:00:00Z' }),
          ]),
        )
        .mockReturnValueOnce(
          of([
            makeRunListItem({ runId: 'B', uploadedAt: '2026-05-17T12:00:00Z' }),
          ]),
        )
        .mockReturnValueOnce(
          of([
            makeRunListItem({ runId: 'C', uploadedAt: '2026-05-17T11:00:00Z' }),
          ]),
        );
      const c = render();

      expect(c.activeRuns().map((r) => r.runId)).toEqual(['B', 'C', 'A']);
    });

    it('caps the merged list at 10 runs', () => {
      const many = (status: RunStatus): RunListItem[] =>
        Array.from({ length: 8 }, (_, i) =>
          makeRunListItem({
            runId: `${status}-${i}`,
            uploadedAt: `2026-05-17T${String(i).padStart(2, '0')}:00:00Z`,
          }),
        );
      runsApi.listRuns
        .mockReturnValueOnce(of(many('Pending')))
        .mockReturnValueOnce(of(many('Chunking')))
        .mockReturnValueOnce(of(many('InProgress')));
      const c = render();

      expect(c.activeRuns()).toHaveLength(10);
    });
  });

  describe('independent failure isolation', () => {
    it('a summary failure does not blank the health widget', () => {
      runsApi.getSummary.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
        ),
      );
      healthApi.getHealth.mockReturnValue(
        of(makeHealth([makeQueue({ name: 'dlq', visibleMessages: 1 })])),
      );
      const c = render();

      expect(c.summaryError()).not.toBeNull();
      expect(c.healthError()).toBeNull();
      expect(c.stuckDlqs()).toHaveLength(1);
    });

    it('a health failure does not blank the run summary', () => {
      healthApi.getHealth.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 503, statusText: 'down' }),
        ),
      );
      runsApi.getSummary.mockReturnValue(
        of(makeSummary([{ status: 'Completed', count: 5 }])),
      );
      const c = render();

      expect(c.healthError()).not.toBeNull();
      expect(c.summaryError()).toBeNull();
      const completed = c.tiles().find((t) => t.status === 'Completed');
      expect(completed?.count).toBe(5);
    });

    it('an active-runs failure sets only the active-runs error', () => {
      runsApi.listRuns.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
        ),
      );
      const c = render();

      expect(c.activeError()).not.toBeNull();
      expect(c.summaryError()).toBeNull();
      expect(c.healthError()).toBeNull();
    });
  });

  describe('navigation', () => {
    it('openStatus navigates to run history filtered by status', () => {
      const c = render();
      c.openStatus('Failed');
      expect(navSpy).toHaveBeenCalledWith(['/runs'], {
        queryParams: { status: 'Failed' },
      });
    });

    it('openRun navigates to the run detail page', () => {
      const c = render();
      c.openRun(makeRunListItem({ runId: 'RUN#xyz' }));
      expect(navSpy).toHaveBeenCalledWith(['/runs', 'RUN#xyz']);
    });
  });

  describe('loadAll / refresh', () => {
    it('re-issues all three loads when loadAll is called again', () => {
      const c = render();
      expect(runsApi.getSummary).toHaveBeenCalledTimes(1);

      c.loadAll();

      expect(runsApi.getSummary).toHaveBeenCalledTimes(2);
      expect(healthApi.getHealth).toHaveBeenCalledTimes(2);
      expect(runsApi.listRuns).toHaveBeenCalledTimes(6);
    });
  });
});
