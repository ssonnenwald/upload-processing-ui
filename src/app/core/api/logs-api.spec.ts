import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { LogsApi } from './logs-api';
import type {
  LogEventsQuery,
  LogEventsResponse,
  LogGroupCatalogEntry,
  LogGroupInfo,
  LogStreamInfo,
} from '../models/logs.models';

const BASE = environment.apiBaseUrl;

describe('LogsApi', () => {
  let api: LogsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LogsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(LogsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Fails the test if any request was made but never matched/flushed.
    httpMock.verify();
  });

  describe('listFunctions', () => {
    it('GETs /api/logs/functions and returns the body', () => {
      const payload: readonly LogGroupCatalogEntry[] = [
        { name: 'pid-recalc' } as LogGroupCatalogEntry,
      ];
      let result: readonly LogGroupCatalogEntry[] | undefined;

      api.listFunctions().subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${BASE}/api/logs/functions`);
      expect(req.request.method).toBe('GET');
      req.flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('listGroups', () => {
    it('GETs /api/logs/groups with no params when prefix is omitted', () => {
      api.listGroups().subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === `${BASE}/api/logs/groups`,
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([]);
    });

    it('sets the prefix param when a prefix is given', () => {
      api.listGroups('UploadProcessing/').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === `${BASE}/api/logs/groups`,
      );
      expect(req.request.params.get('prefix')).toBe('UploadProcessing/');
      req.flush([]);
    });

    it('omits the prefix param for an empty-string prefix', () => {
      // `if (prefix)` is falsy for '' — the param should not be added.
      api.listGroups('').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === `${BASE}/api/logs/groups`,
      );
      expect(req.request.params.has('prefix')).toBe(false);
      req.flush([]);
    });

    it('returns the response body', () => {
      const payload: readonly LogGroupInfo[] = [
        { name: 'group-a' } as LogGroupInfo,
      ];
      let result: readonly LogGroupInfo[] | undefined;

      api.listGroups().subscribe((r) => (result = r));
      httpMock
        .expectOne((r) => r.url === `${BASE}/api/logs/groups`)
        .flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('listStreams', () => {
    it('always sets the group param', () => {
      api.listStreams('my-group').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === `${BASE}/api/logs/streams`,
      );
      expect(req.request.params.get('group')).toBe('my-group');
      expect(req.request.params.has('limit')).toBe(false);
      req.flush([]);
    });

    it('adds the limit param when a limit is provided', () => {
      api.listStreams('my-group', 25).subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === `${BASE}/api/logs/streams`,
      );
      expect(req.request.params.get('limit')).toBe('25');
      req.flush([]);
    });

    it('includes limit=0 because the guard is `!= null`, not truthiness', () => {
      // A truthy check would drop 0; `limit != null` keeps it.
      api.listStreams('my-group', 0).subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === `${BASE}/api/logs/streams`,
      );
      expect(req.request.params.get('limit')).toBe('0');
      req.flush([]);
    });

    it('returns the response body', () => {
      const payload: readonly LogStreamInfo[] = [
        { name: 'stream-1' } as LogStreamInfo,
      ];
      let result: readonly LogStreamInfo[] | undefined;

      api.listStreams('my-group').subscribe((r) => (result = r));
      httpMock
        .expectOne((r) => r.url === `${BASE}/api/logs/streams`)
        .flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('getEvents', () => {
    /** Pulls the single matching request for the events endpoint. */
    function eventsRequest(): TestRequest {
      return httpMock.expectOne((r) => r.url === `${BASE}/api/logs/events`);
    }

    it('sets only the group param for a minimal query', () => {
      api.getEvents({ group: 'g1' }).subscribe();

      const req = eventsRequest();
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('group')).toBe('g1');
      expect(req.request.params.keys().sort()).toEqual(['group']);
      req.flush({} as LogEventsResponse);
    });

    it('sets every optional param when the full query is provided', () => {
      const query: LogEventsQuery = {
        group: 'g1',
        streams: 5,
        minLevel: 'Error',
        runId: 'RUN#abc',
        sinceMinutes: 60,
      };

      api.getEvents(query).subscribe();

      const req = eventsRequest();
      expect(req.request.params.get('group')).toBe('g1');
      expect(req.request.params.get('streams')).toBe('5');
      expect(req.request.params.get('minLevel')).toBe('Error');
      expect(req.request.params.get('runId')).toBe('RUN#abc');
      expect(req.request.params.get('sinceMinutes')).toBe('60');
      req.flush({} as LogEventsResponse);
    });

    it('includes streams=0 and sinceMinutes=0 (guarded by `!= null`)', () => {
      const query: LogEventsQuery = {
        group: 'g1',
        streams: 0,
        sinceMinutes: 0,
      };

      api.getEvents(query).subscribe();

      const req = eventsRequest();
      expect(req.request.params.get('streams')).toBe('0');
      expect(req.request.params.get('sinceMinutes')).toBe('0');
      req.flush({} as LogEventsResponse);
    });

    it('omits minLevel and runId when they are undefined', () => {
      // `if (query.minLevel)` / `if (query.runId)` are falsy for undefined,
      // so neither param is added. (minLevel is a union type — undefined is
      // its only falsy value; it can never be an empty string.)
      const query: LogEventsQuery = {
        group: 'g1',
        minLevel: undefined,
        runId: undefined,
      };

      api.getEvents(query).subscribe();

      const req = eventsRequest();
      expect(req.request.params.has('minLevel')).toBe(false);
      expect(req.request.params.has('runId')).toBe(false);
      req.flush({} as LogEventsResponse);
    });

    it('omits the optional params when they are simply absent', () => {
      // Same outcome as undefined — the properties are never set at all.
      api.getEvents({ group: 'g1' }).subscribe();

      const req = eventsRequest();
      expect(req.request.params.has('streams')).toBe(false);
      expect(req.request.params.has('minLevel')).toBe(false);
      expect(req.request.params.has('runId')).toBe(false);
      expect(req.request.params.has('sinceMinutes')).toBe(false);
      req.flush({} as LogEventsResponse);
    });

    it('returns the response body', () => {
      const payload = { events: [] } as unknown as LogEventsResponse;
      let result: LogEventsResponse | undefined;

      api.getEvents({ group: 'g1' }).subscribe((r) => (result = r));
      eventsRequest().flush(payload);

      expect(result).toEqual(payload);
    });
  });
});
