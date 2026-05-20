import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PipelineHealthPageComponent } from './pipeline-health-page.component';
import { PipelineHealthApi } from '@core/api/pipeline-health-api.service';
import type {
  DlqId,
  DlqMessage,
  DlqMessagesResponse,
  PipelineHealthResponse,
  QueueDepth,
} from '@core/models/pipeline-health.models';
import type { WritableSignal } from '@angular/core';
import {
  makeQueue,
  makeHealth,
  makeDlqMessage,
  makeDlqResponse,
} from '@testing/factories';

interface PanelState {
  id: DlqId;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  response: DlqMessagesResponse | null;
}

/** Typed view of the protected members the tests touch. */
interface Internals {
  health: () => PipelineHealthResponse | null;
  healthLoading: () => boolean;
  healthError: () => string | null;
  lastUpdated: () => Date | null;
  autoRefresh: WritableSignal<boolean>;
  hasStuckMessages: () => boolean;
  panels: () => readonly PanelState[];
  pendingReplayId: () => string | null;
  replayingId: () => string | null;
  loadHealth: () => void;
  loadDlq: (id: DlqId) => void;
  askReplay: (messageId: string) => void;
  cancelReplay: () => void;
  confirmReplay: (message: DlqMessage) => void;
  queueSeverity: (q: QueueDepth) => 'alert' | 'warn' | 'ok';
}

interface HealthApiMock {
  getHealth: Mock;
  getDlqMessages: Mock;
  replayOrchestrationMessage: Mock;
}

describe('PipelineHealthPageComponent', () => {
  let api: HealthApiMock;

  beforeEach(() => {
    // Defaults — armed before the constructor's loadHealth() runs.
    api = {
      getHealth: vi.fn().mockReturnValue(of(makeHealth())),
      getDlqMessages: vi.fn().mockReturnValue(of(makeDlqResponse())),
      replayOrchestrationMessage: vi.fn().mockReturnValue(of({})),
    };
    TestBed.configureTestingModule({
      imports: [PipelineHealthPageComponent],
      providers: [{ provide: PipelineHealthApi, useValue: api }],
    });
  });

  function render(): Internals {
    const fixture = TestBed.createComponent(PipelineHealthPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  describe('initial health load', () => {
    it('loads queue health on construction', () => {
      render();
      expect(api.getHealth).toHaveBeenCalled();
    });

    it('stores the health response and stamps lastUpdated on success', () => {
      api.getHealth.mockReturnValue(
        of(makeHealth([makeQueue({ name: 'q1' })])),
      );
      const c = render();

      expect(c.health()?.queues).toHaveLength(1);
      expect(c.healthLoading()).toBe(false);
      expect(c.lastUpdated()).toBeInstanceOf(Date);
    });

    it('sets a friendly error when the initial load fails', () => {
      api.getHealth.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
        ),
      );
      const c = render();

      expect(c.healthError()).not.toBeNull();
      expect(c.healthLoading()).toBe(false);
    });
  });

  describe('hasStuckMessages', () => {
    it('is true when a configured DLQ has visible messages', () => {
      api.getHealth.mockReturnValue(
        of(makeHealth([makeQueue({ role: 'dlq', visibleMessages: 4 })])),
      );
      expect(render().hasStuckMessages()).toBe(true);
    });

    it('is false when DLQs are empty', () => {
      api.getHealth.mockReturnValue(
        of(makeHealth([makeQueue({ role: 'dlq', visibleMessages: 0 })])),
      );
      expect(render().hasStuckMessages()).toBe(false);
    });

    it('ignores a source queue with messages', () => {
      api.getHealth.mockReturnValue(
        of(makeHealth([makeQueue({ role: 'source', visibleMessages: 9 })])),
      );
      expect(render().hasStuckMessages()).toBe(false);
    });

    it('ignores a DLQ whose depth could not be read', () => {
      api.getHealth.mockReturnValue(
        of(
          makeHealth([
            makeQueue({ role: 'dlq', visibleMessages: 5, error: 'denied' }),
          ]),
        ),
      );
      expect(render().hasStuckMessages()).toBe(false);
    });
  });

  describe('queueSeverity', () => {
    it('returns "warn" for a queue with a read error', () => {
      const c = render();
      expect(c.queueSeverity(makeQueue({ error: 'denied' }))).toBe('warn');
    });

    it('returns "warn" for an unconfigured queue', () => {
      const c = render();
      expect(c.queueSeverity(makeQueue({ configured: false }))).toBe('warn');
    });

    it('returns "alert" for a DLQ with visible messages', () => {
      const c = render();
      expect(
        c.queueSeverity(makeQueue({ role: 'dlq', visibleMessages: 2 })),
      ).toBe('alert');
    });

    it('returns "ok" for a healthy empty queue', () => {
      const c = render();
      expect(
        c.queueSeverity(makeQueue({ role: 'dlq', visibleMessages: 0 })),
      ).toBe('ok');
    });

    it('returns "ok" for a source queue with messages (not a DLQ)', () => {
      const c = render();
      expect(
        c.queueSeverity(makeQueue({ role: 'source', visibleMessages: 9 })),
      ).toBe('ok');
    });
  });

  describe('DLQ panels', () => {
    it('starts with two panels, orchestration and streambridge', () => {
      const c = render();
      expect(c.panels().map((p) => p.id)).toEqual([
        'orchestration',
        'streambridge',
      ]);
    });

    it('loads messages into the matching panel', () => {
      api.getDlqMessages.mockReturnValue(
        of(makeDlqResponse([makeDlqMessage({ messageId: 'm1' })])),
      );
      const c = render();

      c.loadDlq('orchestration');

      const panel = c.panels().find((p) => p.id === 'orchestration')!;
      expect(panel.loaded).toBe(true);
      expect(panel.loading).toBe(false);
      expect(panel.response?.messages).toHaveLength(1);
    });

    it('only patches the targeted panel, leaving the other untouched', () => {
      api.getDlqMessages.mockReturnValue(of(makeDlqResponse()));
      const c = render();

      c.loadDlq('orchestration');

      const other = c.panels().find((p) => p.id === 'streambridge')!;
      expect(other.loaded).toBe(false);
    });

    it('records a panel error when the DLQ load fails', () => {
      api.getDlqMessages.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
        ),
      );
      const c = render();

      c.loadDlq('orchestration');

      const panel = c.panels().find((p) => p.id === 'orchestration')!;
      expect(panel.error).not.toBeNull();
      expect(panel.loaded).toBe(true);
    });
  });

  describe('replay confirm flow', () => {
    it('askReplay arms the pending confirmation for a message', () => {
      const c = render();
      c.askReplay('msg-7');
      expect(c.pendingReplayId()).toBe('msg-7');
    });

    it('cancelReplay clears the pending confirmation', () => {
      const c = render();
      c.askReplay('msg-7');
      c.cancelReplay();
      expect(c.pendingReplayId()).toBeNull();
    });

    it('confirmReplay sends the replay request with the message fields', () => {
      const c = render();
      const message = makeDlqMessage({
        messageId: 'msg-7',
        receiptHandle: 'rh-7',
        body: 'payload',
      });

      c.confirmReplay(message);

      expect(api.replayOrchestrationMessage).toHaveBeenCalledWith({
        receiptHandle: 'rh-7',
        body: 'payload',
        messageId: 'msg-7',
      });
    });

    it('clears the pending confirmation when a replay is confirmed', () => {
      const c = render();
      c.askReplay('msg-7');

      c.confirmReplay(makeDlqMessage({ messageId: 'msg-7' }));

      expect(c.pendingReplayId()).toBeNull();
    });

    it('refreshes the orchestration panel and health after a successful replay', () => {
      const c = render();
      api.getHealth.mockClear();
      api.getDlqMessages.mockClear();

      c.confirmReplay(makeDlqMessage({ messageId: 'msg-7' }));

      // A successful replay re-peeks the DLQ and re-reads the depths.
      expect(api.getDlqMessages).toHaveBeenCalledWith('orchestration');
      expect(api.getHealth).toHaveBeenCalled();
      expect(c.replayingId()).toBeNull();
    });

    it('records a panel error and clears replayingId when a replay fails', () => {
      api.replayOrchestrationMessage.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
        ),
      );
      const c = render();

      c.confirmReplay(makeDlqMessage({ messageId: 'msg-7' }));

      const panel = c.panels().find((p) => p.id === 'orchestration')!;
      expect(panel.error).not.toBeNull();
      expect(c.replayingId()).toBeNull();
    });
  });

  describe('manual refresh', () => {
    it('loadHealth re-fetches and clears a prior error', () => {
      api.getHealth.mockReturnValueOnce(
        throwError(
          () => new HttpErrorResponse({ status: 503, statusText: 'down' }),
        ),
      );
      const c = render();
      expect(c.healthError()).not.toBeNull();

      api.getHealth.mockReturnValue(of(makeHealth([makeQueue()])));
      c.loadHealth();

      expect(c.healthError()).toBeNull();
      expect(c.health()?.queues).toHaveLength(1);
    });
  });
});

// --- Auto-refresh polling — fake timers --------------------------------------

describe('PipelineHealthPageComponent — auto-refresh polling', () => {
  let api: HealthApiMock;

  const REFRESH_MS = 30_000;

  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      getHealth: vi.fn().mockReturnValue(of(makeHealth())),
      getDlqMessages: vi.fn().mockReturnValue(of(makeDlqResponse())),
      replayOrchestrationMessage: vi.fn().mockReturnValue(of({})),
    };
    TestBed.configureTestingModule({
      imports: [PipelineHealthPageComponent],
      providers: [{ provide: PipelineHealthApi, useValue: api }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(): Internals {
    const fixture = TestBed.createComponent(PipelineHealthPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  it('polls health again after the refresh interval elapses', async () => {
    const c = render();
    // One call from the constructor's loadHealth().
    expect(api.getHealth).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REFRESH_MS);

    // The interval tick fired a second getHealth.
    expect(api.getHealth).toHaveBeenCalledTimes(2);
    expect(c.autoRefresh()).toBe(true);
  });

  it('does not poll while auto-refresh is toggled off', async () => {
    const c = render();
    c.autoRefresh.set(false);
    api.getHealth.mockClear();

    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);

    // The filter() drops every tick while the toggle is off.
    expect(api.getHealth).not.toHaveBeenCalled();
  });

  it('resumes polling when auto-refresh is toggled back on', async () => {
    const c = render();
    c.autoRefresh.set(false);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    api.getHealth.mockClear();

    c.autoRefresh.set(true);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);

    expect(api.getHealth).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after a failed poll (catchError is inside switchMap)', async () => {
    const c = render();

    // The next poll fails — must not kill the interval.
    api.getHealth.mockReturnValueOnce(
      throwError(
        () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
      ),
    );
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(c.healthError()).not.toBeNull();

    // A later poll succeeds — proving the stream survived the failure.
    api.getHealth.mockReturnValue(of(makeHealth([makeQueue()])));
    await vi.advanceTimersByTimeAsync(REFRESH_MS);

    expect(c.health()?.queues).toHaveLength(1);
    expect(c.healthError()).toBeNull();
  });

  it('a successful poll clears a stale error from a prior failed poll', async () => {
    const c = render();

    api.getHealth.mockReturnValueOnce(
      throwError(
        () => new HttpErrorResponse({ status: 503, statusText: 'down' }),
      ),
    );
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(c.healthError()).not.toBeNull();

    api.getHealth.mockReturnValue(of(makeHealth()));
    await vi.advanceTimersByTimeAsync(REFRESH_MS);

    // applyHealth clears healthError on every successful refresh.
    expect(c.healthError()).toBeNull();
  });
});
