import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { LogsPageComponent } from './logs-page.component';
import { LogsApi } from '@core/api/logs-api.service';
import type {
  LogEventsResponse,
  LogGroupCatalogEntry,
  LogMinLevel,
} from '@core/models/logs.models';
import type { WritableSignal } from '@angular/core';
import {
  makeLogCatalogEntry as makeCatalogEntry,
  makeLogEvent as makeEvent,
  makeLogStream as makeStream,
  makeLogEventsResponse as makeEventsResponse,
} from '@testing/factories';

/** Typed view of the component's protected members the tests touch. */
interface Internals {
  // signals — filter state
  selectedGroup: WritableSignal<string | null>;
  streams: WritableSignal<number>;
  minLevel: WritableSignal<LogMinLevel | 'All'>;
  sinceMinutes: WritableSignal<number | null>;
  runId: WritableSignal<string>;
  // signals — catalog / results
  functions: WritableSignal<readonly LogGroupCatalogEntry[]>;
  catalogError: () => string | null;
  catalogLoading: () => boolean;
  result: () => LogEventsResponse | null;
  error: () => string | null;
  loading: () => boolean;
  hasFetched: () => boolean;
  // computeds
  selectedGroupName: () => string;
  totalEvents: () => number;
  canLoad: () => boolean;
  // methods
  loadLogs: () => void;
  retryCatalog: () => void;
}

interface LogsApiMock {
  listFunctions: Mock;
  getEvents: Mock;
}

describe('LogsPageComponent', () => {
  let api: LogsApiMock;

  beforeEach(() => {
    // Defaults — armed before the component's constructor runs loadCatalog().
    api = {
      listFunctions: vi.fn().mockReturnValue(of([])),
      getEvents: vi.fn().mockReturnValue(of(makeEventsResponse())),
    };
    TestBed.configureTestingModule({
      imports: [LogsPageComponent],
      providers: [{ provide: LogsApi, useValue: api }],
    });
  });

  /** Creates the component and returns a typed view of its internals. */
  function render(): Internals {
    const fixture = TestBed.createComponent(LogsPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  describe('catalog loading', () => {
    it('fetches the log-group catalog on construction', () => {
      render();
      expect(api.listFunctions).toHaveBeenCalledTimes(1);
    });

    it('populates the functions list on success', () => {
      const catalog = [
        makeCatalogEntry({ group: 'g1' }),
        makeCatalogEntry({ group: 'g2' }),
      ];
      api.listFunctions.mockReturnValue(of(catalog));
      const c = render();

      expect(c.functions()).toEqual(catalog);
      expect(c.catalogLoading()).toBe(false);
    });

    it('pre-selects the first group so the page is one click from useful', () => {
      api.listFunctions.mockReturnValue(
        of([
          makeCatalogEntry({ group: 'first-group' }),
          makeCatalogEntry({ group: 'second-group' }),
        ]),
      );
      const c = render();

      expect(c.selectedGroup()).toBe('first-group');
    });

    it('leaves the selection null when the catalog is empty', () => {
      api.listFunctions.mockReturnValue(of([]));
      const c = render();

      expect(c.selectedGroup()).toBeNull();
    });

    it('sets a friendly error when the catalog fetch fails', () => {
      api.listFunctions.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
        ),
      );
      const c = render();

      expect(c.catalogError()).not.toBeNull();
      expect(c.catalogLoading()).toBe(false);
    });

    it('retryCatalog re-issues the catalog fetch', () => {
      api.listFunctions.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 503, statusText: 'down' }),
        ),
      );
      const c = render();
      expect(c.catalogError()).not.toBeNull();

      api.listFunctions.mockReturnValue(of([makeCatalogEntry()]));
      c.retryCatalog();

      expect(api.listFunctions).toHaveBeenCalledTimes(2);
      expect(c.catalogError()).toBeNull();
    });
  });

  describe('canLoad', () => {
    it('is false before a group is selected', () => {
      api.listFunctions.mockReturnValue(of([])); // no auto-selection
      const c = render();
      expect(c.canLoad()).toBe(false);
    });

    it('is true once a group is selected and no fetch is running', () => {
      api.listFunctions.mockReturnValue(
        of([makeCatalogEntry({ group: 'g1' })]),
      );
      const c = render();
      expect(c.canLoad()).toBe(true);
    });
  });

  describe('loadLogs — query assembly', () => {
    beforeEach(() => {
      api.listFunctions.mockReturnValue(
        of([makeCatalogEntry({ group: '/aws/lambda/pid-recalc' })]),
      );
    });

    it('does nothing when no group is selected', () => {
      api.listFunctions.mockReturnValue(of([])); // selection stays null
      const c = render();

      c.loadLogs();

      expect(api.getEvents).not.toHaveBeenCalled();
    });

    it('sends the selected group and stream count', () => {
      const c = render();
      c.streams.set(5);
      c.loadLogs();

      expect(api.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          group: '/aws/lambda/pid-recalc',
          streams: 5,
        }),
      );
    });

    it('translates a minLevel of "All" to undefined', () => {
      const c = render();
      c.minLevel.set('All');
      c.loadLogs();

      expect(api.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ minLevel: undefined }),
      );
    });

    it('passes a real minLevel through unchanged', () => {
      const c = render();
      c.minLevel.set('Error');
      c.loadLogs();

      expect(api.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ minLevel: 'Error' }),
      );
    });

    it('omits runId when the field is blank or whitespace', () => {
      const c = render();
      c.runId.set('   ');
      c.loadLogs();

      expect(api.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ runId: undefined }),
      );
    });

    it('trims a non-blank runId before sending it', () => {
      const c = render();
      c.runId.set('  RUN#abc  ');
      c.loadLogs();

      expect(api.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'RUN#abc' }),
      );
    });

    it('translates a null sinceMinutes to undefined', () => {
      const c = render();
      c.sinceMinutes.set(null);
      c.loadLogs();

      expect(api.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ sinceMinutes: undefined }),
      );
    });

    it('passes a real sinceMinutes value through', () => {
      const c = render();
      c.sinceMinutes.set(60);
      c.loadLogs();

      expect(api.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ sinceMinutes: 60 }),
      );
    });
  });

  describe('loadLogs — results', () => {
    beforeEach(() => {
      api.listFunctions.mockReturnValue(
        of([makeCatalogEntry({ group: '/aws/lambda/pid-recalc' })]),
      );
    });

    it('stores the response and marks hasFetched on success', () => {
      const response = makeEventsResponse([makeStream([makeEvent()])]);
      api.getEvents.mockReturnValue(of(response));
      const c = render();

      c.loadLogs();

      expect(c.result()).toEqual(response);
      expect(c.loading()).toBe(false);
      expect(c.hasFetched()).toBe(true);
      expect(c.error()).toBeNull();
    });

    it('clears the result and sets an error on failure', () => {
      api.getEvents.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 500, statusText: 'err' }),
        ),
      );
      const c = render();

      c.loadLogs();

      expect(c.result()).toBeNull();
      expect(c.error()).not.toBeNull();
      expect(c.loading()).toBe(false);
      // hasFetched is set even on failure — it drives the empty-state view.
      expect(c.hasFetched()).toBe(true);
    });
  });

  describe('totalEvents computed', () => {
    beforeEach(() => {
      api.listFunctions.mockReturnValue(
        of([makeCatalogEntry({ group: '/aws/lambda/pid-recalc' })]),
      );
    });

    it('is zero before any fetch', () => {
      const c = render();
      expect(c.totalEvents()).toBe(0);
    });

    it('sums event counts across all streams', () => {
      api.getEvents.mockReturnValue(
        of(
          makeEventsResponse([
            makeStream([makeEvent(), makeEvent()]),
            makeStream([makeEvent()], { streamName: 'stream-2' }),
          ]),
        ),
      );
      const c = render();
      c.loadLogs();

      // 2 + 1 = 3 events across two streams.
      expect(c.totalEvents()).toBe(3);
    });
  });

  describe('selectedGroupName computed', () => {
    it('resolves the friendly name of the selected group', () => {
      api.listFunctions.mockReturnValue(
        of([
          makeCatalogEntry({ name: 'PID Recalc', group: 'g1' }),
          makeCatalogEntry({ name: 'Stream Bridge', group: 'g2' }),
        ]),
      );
      const c = render();
      c.selectedGroup.set('g2');

      expect(c.selectedGroupName()).toBe('Stream Bridge');
    });

    it('falls back to the raw group id when no catalog entry matches', () => {
      api.listFunctions.mockReturnValue(of([]));
      const c = render();
      c.selectedGroup.set('/aws/lambda/unknown');

      expect(c.selectedGroupName()).toBe('/aws/lambda/unknown');
    });

    it('is an empty string when nothing is selected', () => {
      api.listFunctions.mockReturnValue(of([]));
      const c = render();

      expect(c.selectedGroupName()).toBe('');
    });
  });
});
