import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, HttpEventType } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { RunsApi, UploadProgress } from './runs-api.service';
import type {
  FunctionCatalogEntry,
  RunDetailsResponse,
  RunListItem,
  UploadDefinitionView,
} from '../models/run.models';
import type { RunSummaryResponse } from '../models/run-summary.models';
import {
  makeFunctionEntry,
  makeRunListItem,
  makeRunDetails,
  makeSummary,
  makeDefinition,
  makeUploadResponse,
  makeUploadRequest,
} from '@testing/factories';

const BASE = environment.apiBaseUrl;

describe('RunsApi', () => {
  let api: RunsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RunsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(RunsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('listFunctions', () => {
    it('GETs /api/functions and returns the body', () => {
      const payload: readonly FunctionCatalogEntry[] = [makeFunctionEntry()];
      let result: readonly FunctionCatalogEntry[] | undefined;

      api.listFunctions().subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${BASE}/api/functions`);
      expect(req.request.method).toBe('GET');
      req.flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('getDefinition', () => {
    it('GETs the definition for a plain function name', () => {
      api.getDefinition('PID_RECALC').subscribe();

      const req = httpMock.expectOne(
        `${BASE}/api/functions/PID_RECALC/definition`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(makeDefinition());
    });

    it('URL-encodes a function name containing reserved characters', () => {
      // A slash/space would break the path if not encoded.
      api.getDefinition('weird/name with space').subscribe();

      const req = httpMock.expectOne(
        `${BASE}/api/functions/weird%2Fname%20with%20space/definition`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(makeDefinition());
    });

    it('returns the response body', () => {
      const payload = makeDefinition({ version: '7' });
      let result: UploadDefinitionView | undefined;

      api.getDefinition('PID_RECALC').subscribe((r) => (result = r));
      httpMock
        .expectOne(`${BASE}/api/functions/PID_RECALC/definition`)
        .flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('getRun', () => {
    it('GETs /api/runs/{runId} with the id URL-encoded', () => {
      // Run ids contain a '#', which must be encoded to survive the path.
      const runId = 'RUN#2026-05-17T22:23:52Z#0b32df50';

      api.getRun(runId).subscribe();

      const req = httpMock.expectOne(
        `${BASE}/api/runs/${encodeURIComponent(runId)}`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(makeRunDetails({ runId }));
    });

    it('returns the response body', () => {
      const payload = makeRunDetails({ runId: 'RUN#abc' });
      let result: RunDetailsResponse | undefined;

      api.getRun('RUN#abc').subscribe((r) => (result = r));
      httpMock
        .expectOne(`${BASE}/api/runs/${encodeURIComponent('RUN#abc')}`)
        .flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('getSummary', () => {
    it('GETs /api/runs/summary', () => {
      api.getSummary().subscribe();

      const req = httpMock.expectOne(`${BASE}/api/runs/summary`);
      expect(req.request.method).toBe('GET');
      req.flush(makeSummary());
    });

    it('returns the response body', () => {
      const payload = makeSummary({ totalRuns: 12, isApproximate: true });
      let result: RunSummaryResponse | undefined;

      api.getSummary().subscribe((r) => (result = r));
      httpMock.expectOne(`${BASE}/api/runs/summary`).flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('listRuns', () => {
    /** Matches the runs list endpoint on path only, ignoring query string. */
    function runsRequest(): TestRequest {
      return httpMock.expectOne((r) => r.url === `${BASE}/api/runs`);
    }

    it('GETs /api/runs with no params when called without options', () => {
      api.listRuns().subscribe();

      const req = runsRequest();
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([]);
    });

    it('GETs /api/runs with no params for an empty options object', () => {
      api.listRuns({}).subscribe();

      const req = runsRequest();
      expect(req.request.params.keys()).toEqual([]);
      req.flush([]);
    });

    it('sets the status param when provided', () => {
      api.listRuns({ status: 'Completed' }).subscribe();

      const req = runsRequest();
      expect(req.request.params.get('status')).toBe('Completed');
      req.flush([]);
    });

    it('sets the uploadedBy and function params when provided', () => {
      api.listRuns({ uploadedBy: 'jdoe', function: 'PID_RECALC' }).subscribe();

      const req = runsRequest();
      expect(req.request.params.get('uploadedBy')).toBe('jdoe');
      expect(req.request.params.get('function')).toBe('PID_RECALC');
      req.flush([]);
    });

    it('stringifies the numeric limit', () => {
      api.listRuns({ limit: 100 }).subscribe();

      const req = runsRequest();
      expect(req.request.params.get('limit')).toBe('100');
      req.flush([]);
    });

    it('omits limit when it is 0 — the guard is truthy, not `!= null`', () => {
      // `if (opts?.limit)` is falsy for 0, so limit=0 is dropped entirely.
      api.listRuns({ limit: 0 }).subscribe();

      const req = runsRequest();
      expect(req.request.params.has('limit')).toBe(false);
      req.flush([]);
    });

    it('omits an empty-string uploadedBy', () => {
      api.listRuns({ uploadedBy: '' }).subscribe();

      const req = runsRequest();
      expect(req.request.params.has('uploadedBy')).toBe(false);
      req.flush([]);
    });

    it('sets all four params together', () => {
      api
        .listRuns({
          status: 'Failed',
          uploadedBy: 'jdoe',
          function: 'PID_RECALC',
          limit: 50,
        })
        .subscribe();

      const req = runsRequest();
      expect(req.request.params.keys().sort()).toEqual([
        'function',
        'limit',
        'status',
        'uploadedBy',
      ]);
      req.flush([]);
    });

    it('returns the response body', () => {
      const payload: readonly RunListItem[] = [
        makeRunListItem({ runId: 'RUN#1' }),
      ];
      let result: readonly RunListItem[] | undefined;

      api.listRuns({ status: 'Completed' }).subscribe((r) => (result = r));
      runsRequest().flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('uploadFile', () => {
    /** Matches the upload endpoint for the given function name. */
    function uploadRequest(fn = 'PID_RECALC'): TestRequest {
      return httpMock.expectOne(
        `${BASE}/api/uploads/${encodeURIComponent(fn)}`,
      );
    }

    it('POSTs multipart/form-data to /api/uploads/{function}', () => {
      api.uploadFile(makeUploadRequest()).subscribe();

      const req = uploadRequest();
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeInstanceOf(FormData);
      req.flush(makeUploadResponse());
    });

    it('URL-encodes the function name in the upload path', () => {
      api.uploadFile(makeUploadRequest({ function: 'a/b' })).subscribe();

      const req = httpMock.expectOne(`${BASE}/api/uploads/a%2Fb`);
      expect(req.request.method).toBe('POST');
      req.flush(makeUploadResponse());
    });

    it('includes file, uploadedBy, and JSON-serialized options in the form', () => {
      const request = makeUploadRequest();

      api.uploadFile(request).subscribe();

      const req = uploadRequest();
      const form = req.request.body as FormData;
      expect(form.get('uploadedBy')).toBe('jdoe');
      expect(form.get('options')).toBe(JSON.stringify(request.options));
      // The file is appended under the 'file' key.
      expect(form.get('file')).toBeInstanceOf(File);
      req.flush(makeUploadResponse());
    });

    it('enables progress reporting on the request', () => {
      api.uploadFile(makeUploadRequest()).subscribe();

      const req = uploadRequest();
      expect(req.request.reportProgress).toBe(true);
      req.flush(makeUploadResponse());
    });

    it('maps an UploadProgress event to a determinate progress value', () => {
      const events: UploadProgress[] = [];
      api.uploadFile(makeUploadRequest()).subscribe((p) => events.push(p));

      const req = uploadRequest();
      req.event({
        type: HttpEventType.UploadProgress,
        loaded: 512,
        total: 1024,
      });
      req.flush(makeUploadResponse());

      const progress = events.find(
        (e) => e.kind === 'progress' && e.total === 1024,
      );
      expect(progress).toEqual({ kind: 'progress', loaded: 512, total: 1024 });
    });

    it('treats a missing total on an UploadProgress event as 0', () => {
      const events: UploadProgress[] = [];
      api.uploadFile(makeUploadRequest()).subscribe((p) => events.push(p));

      const req = uploadRequest();
      req.event({ type: HttpEventType.UploadProgress, loaded: 256 });
      req.flush(makeUploadResponse());

      const progress = events.find(
        (e) => e.kind === 'progress' && e.loaded === 256,
      );
      expect(progress).toEqual({ kind: 'progress', loaded: 256, total: 0 });
    });

    it('maps the final Response event to a response UploadProgress', () => {
      const body = makeUploadResponse({ runId: 'RUN#new' });
      const events: UploadProgress[] = [];

      api.uploadFile(makeUploadRequest()).subscribe((p) => events.push(p));

      uploadRequest().flush(body);

      const final = events.find((e) => e.kind === 'response');
      expect(final).toEqual({
        kind: 'response',
        loaded: 1,
        total: 1,
        response: body,
      });
    });

    it('emits a response event with undefined response when the body is empty', () => {
      const events: UploadProgress[] = [];

      api.uploadFile(makeUploadRequest()).subscribe((p) => events.push(p));

      // Flush with a null body — event.body ?? undefined collapses to undefined.
      uploadRequest().flush(null);

      const final = events.find((e) => e.kind === 'response');
      expect(final).toEqual({
        kind: 'response',
        loaded: 1,
        total: 1,
        response: undefined,
      });
    });

    it('collapses a non-progress, non-response event into a no-op progress', () => {
      const events: UploadProgress[] = [];
      api.uploadFile(makeUploadRequest()).subscribe((p) => events.push(p));

      const req = uploadRequest();
      // Sent is neither UploadProgress nor Response — the default branch.
      req.event({ type: HttpEventType.Sent });
      req.flush(makeUploadResponse());

      const noop = events.find(
        (e) => e.kind === 'progress' && e.loaded === 0 && e.total === 0,
      );
      expect(noop).toEqual({ kind: 'progress', loaded: 0, total: 0 });
    });
  });
});
