import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { PipelineHealthApi } from './pipeline-health-api';
import type {
  DlqId,
  DlqMessagesResponse,
  DlqReplayRequest,
  DlqReplayResponse,
  PipelineHealthResponse,
} from '../models/pipeline-health.models';

const BASE = environment.apiBaseUrl;

describe('PipelineHealthApi', () => {
  let api: PipelineHealthApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PipelineHealthApi,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(PipelineHealthApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Fails the test if any request was made but never matched/flushed.
    httpMock.verify();
  });

  describe('getHealth', () => {
    it('GETs /api/pipeline/health', () => {
      api.getHealth().subscribe();

      const req = httpMock.expectOne(`${BASE}/api/pipeline/health`);
      expect(req.request.method).toBe('GET');
      req.flush({} as PipelineHealthResponse);
    });

    it('returns the response body unchanged', () => {
      const payload = {
        queues: [],
        dlqs: [],
      } as unknown as PipelineHealthResponse;
      let result: PipelineHealthResponse | undefined;

      api.getHealth().subscribe((r) => (result = r));
      httpMock.expectOne(`${BASE}/api/pipeline/health`).flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('getDlqMessages', () => {
    it('interpolates the dlq id into the path', () => {
      const dlq: DlqId = 'orchestration';

      api.getDlqMessages(dlq).subscribe();

      const req = httpMock.expectOne(
        `${BASE}/api/pipeline/dlq/orchestration/messages`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({} as DlqMessagesResponse);
    });

    it('returns the response body unchanged', () => {
      const payload = {
        messages: [],
      } as unknown as DlqMessagesResponse;
      let result: DlqMessagesResponse | undefined;

      const dlq: DlqId = 'orchestration';
      api.getDlqMessages(dlq).subscribe((r) => (result = r));
      httpMock
        .expectOne(`${BASE}/api/pipeline/dlq/orchestration/messages`)
        .flush(payload);

      expect(result).toEqual(payload);
    });
  });

  describe('replayOrchestrationMessage', () => {
    it('POSTs to the orchestration replay endpoint', () => {
      const request = { messageId: 'msg-1' } as DlqReplayRequest;

      api.replayOrchestrationMessage(request).subscribe();

      const req = httpMock.expectOne(
        `${BASE}/api/pipeline/dlq/orchestration/replay`,
      );
      expect(req.request.method).toBe('POST');
      req.flush({} as DlqReplayResponse);
    });

    it('sends the replay request as the POST body', () => {
      const request = { messageId: 'msg-42' } as DlqReplayRequest;

      api.replayOrchestrationMessage(request).subscribe();

      const req = httpMock.expectOne(
        `${BASE}/api/pipeline/dlq/orchestration/replay`,
      );
      // The body is forwarded verbatim — same reference, unmodified.
      expect(req.request.body).toBe(request);
      req.flush({} as DlqReplayResponse);
    });

    it('returns the response body unchanged', () => {
      const request = { messageId: 'msg-7' } as DlqReplayRequest;
      const payload = {
        replayed: true,
      } as unknown as DlqReplayResponse;
      let result: DlqReplayResponse | undefined;

      api.replayOrchestrationMessage(request).subscribe((r) => (result = r));
      httpMock
        .expectOne(`${BASE}/api/pipeline/dlq/orchestration/replay`)
        .flush(payload);

      expect(result).toEqual(payload);
    });
  });
});
