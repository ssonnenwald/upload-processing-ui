import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { ChunkDetailsStore } from './chunk-details-store';
import { RunsApi } from '@core/api/runs-api';
import { makeChunkDetails, makeChunkRowOutcome } from '@testing/factories';

const BASE = environment.apiBaseUrl;

describe('ChunkDetailsStore', () => {
  let store: InstanceType<typeof ChunkDetailsStore>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChunkDetailsStore,
        RunsApi,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(ChunkDetailsStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function detailsUrl(runId: string, chunkSk: string): string {
    return `${BASE}/api/runs/${encodeURIComponent(runId)}/chunks/${encodeURIComponent(
      chunkSk,
    )}/details`;
  }

  it('loads rows and meta on success', () => {
    store.load({ runId: 'RUN#1', chunkSk: 'CHUNK#0001' });

    httpMock.expectOne(detailsUrl('RUN#1', 'CHUNK#0001')).flush(
      makeChunkDetails({
        rows: [
          makeChunkRowOutcome({ row: 1 }),
          makeChunkRowOutcome({ row: 2, status: 'invalid', reason: 'bad' }),
        ],
      }),
    );

    expect(store.loading()).toBe(false);
    expect(store.detailsAvailable()).toBe(true);
    expect(store.totalRows()).toBe(2);
    expect(store.rows()).toHaveLength(2);
  });

  it('filters rows by status', () => {
    store.load({ runId: 'RUN#1', chunkSk: 'CHUNK#0001' });
    httpMock.expectOne(detailsUrl('RUN#1', 'CHUNK#0001')).flush(
      makeChunkDetails({
        rows: [
          makeChunkRowOutcome({ row: 1, status: 'succeeded' }),
          makeChunkRowOutcome({ row: 2, status: 'invalid', reason: 'bad' }),
          makeChunkRowOutcome({
            row: 3,
            status: 'invalid',
            reason: 'also bad',
          }),
        ],
      }),
    );

    expect(store.filteredRows()).toHaveLength(3); // 'all'
    store.setFilter('invalid');
    expect(store.filteredRows()).toHaveLength(2);
    expect(store.filteredRows().every((r) => r.status === 'invalid')).toBe(
      true,
    );
    store.setFilter('succeeded');
    expect(store.filteredRows()).toHaveLength(1);
  });

  it('marks details unavailable when the API says so', () => {
    store.load({ runId: 'RUN#1', chunkSk: 'CHUNK#0002' });
    httpMock.expectOne(detailsUrl('RUN#1', 'CHUNK#0002')).flush(
      makeChunkDetails({
        chunkSk: 'CHUNK#0002',
        detailsAvailable: false,
        detailsMessage: 'This chunk failed before producing per-row results.',
        rows: [],
      }),
    );

    expect(store.detailsAvailable()).toBe(false);
    expect(store.detailsMessage()).toContain('failed before');
    expect(store.totalRows()).toBe(0);
  });

  it('sets a friendly error on failure', () => {
    store.load({ runId: 'RUN#1', chunkSk: 'CHUNK#0001' });
    httpMock
      .expectOne(detailsUrl('RUN#1', 'CHUNK#0001'))
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(store.loading()).toBe(false);
    expect(store.error()).not.toBeNull();
  });

  it('resets the filter to all on a new load', () => {
    store.load({ runId: 'RUN#1', chunkSk: 'CHUNK#0001' });
    httpMock
      .expectOne(detailsUrl('RUN#1', 'CHUNK#0001'))
      .flush(makeChunkDetails());
    store.setFilter('invalid');
    expect(store.filter()).toBe('invalid');

    store.load({ runId: 'RUN#1', chunkSk: 'CHUNK#0003' });
    // The leading tap() resets state (filter → 'all') before the request resolves.
    expect(store.filter()).toBe('all');
    httpMock
      .expectOne(detailsUrl('RUN#1', 'CHUNK#0003'))
      .flush(makeChunkDetails({ chunkSk: 'CHUNK#0003' }));
    expect(store.filter()).toBe('all');
  });
});
