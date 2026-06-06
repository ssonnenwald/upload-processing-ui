import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { environment } from '@env/environment';
import {
  ChunkDetailsDialog,
  ChunkDetailsDialogData,
} from './chunk-details-dialog';
import { ChunkDetailsStore } from '@core/stores/chunk-details-store';
import { RunsApi } from '@core/api/runs-api';
import {
  makeChunk,
  makeChunkDetails,
  makeChunkRowOutcome,
} from '@testing/factories';

const BASE = environment.apiBaseUrl;

describe('ChunkDetailsDialog', () => {
  let httpMock: HttpTestingController;
  const dialogRef = { close: vi.fn() };

  function configure(
    data: ChunkDetailsDialogData = {
      runId: 'RUN#1',
      chunk: makeChunk({ chunkSk: 'CHUNK#0001', chunkIndex: 1 }),
    },
  ): void {
    TestBed.configureTestingModule({
      imports: [ChunkDetailsDialog],
      providers: [
        RunsApi,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  }

  function detailsUrl(runId: string, chunkSk: string): string {
    return `${BASE}/api/runs/${encodeURIComponent(runId)}/chunks/${encodeURIComponent(
      chunkSk,
    )}/details`;
  }

  afterEach(() => {
    httpMock.verify();
    vi.clearAllMocks();
  });

  it('requests the chunk detail on creation and renders the row viewport', () => {
    configure();
    const fixture = TestBed.createComponent(ChunkDetailsDialog);
    fixture.detectChanges();

    const req = httpMock.expectOne(detailsUrl('RUN#1', 'CHUNK#0001'));
    expect(req.request.method).toBe('GET');
    req.flush(
      makeChunkDetails({
        rows: [
          makeChunkRowOutcome({ row: 1 }),
          makeChunkRowOutcome({ row: 2 }),
        ],
      }),
    );
    fixture.detectChanges();

    const store = fixture.debugElement.injector.get(ChunkDetailsStore);
    expect(store.detailsAvailable()).toBe(true);
    expect(store.totalRows()).toBe(2);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('cdk-virtual-scroll-viewport')).not.toBeNull();
    expect(el.querySelector('.cd__head')).not.toBeNull();
  });

  it('shows the unavailable message and no viewport when there is no detail', () => {
    configure({ runId: 'RUN#1', chunk: makeChunk({ chunkSk: 'CHUNK#0002' }) });
    const fixture = TestBed.createComponent(ChunkDetailsDialog);
    fixture.detectChanges();

    httpMock.expectOne(detailsUrl('RUN#1', 'CHUNK#0002')).flush(
      makeChunkDetails({
        chunkSk: 'CHUNK#0002',
        detailsAvailable: false,
        detailsMessage: 'gone',
        rows: [],
      }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.cd__empty')?.textContent).toContain('gone');
    expect(el.querySelector('cdk-virtual-scroll-viewport')).toBeNull();
  });

  it('filters rows when a status toggle is chosen', () => {
    configure();
    const fixture = TestBed.createComponent(ChunkDetailsDialog);
    fixture.detectChanges();
    httpMock.expectOne(detailsUrl('RUN#1', 'CHUNK#0001')).flush(
      makeChunkDetails({
        rows: [
          makeChunkRowOutcome({ row: 1, status: 'succeeded' }),
          makeChunkRowOutcome({ row: 2, status: 'invalid', reason: 'bad' }),
        ],
      }),
    );
    fixture.detectChanges();

    const store = fixture.debugElement.injector.get(ChunkDetailsStore);
    expect(store.filteredRows()).toHaveLength(2);

    const el = fixture.nativeElement as HTMLElement;
    const invalidToggle = Array.from(
      el.querySelectorAll<HTMLButtonElement>('mat-button-toggle button'),
    ).find((b) => b.textContent?.includes('Invalid'));
    invalidToggle?.click();
    fixture.detectChanges();

    expect(store.filter()).toBe('invalid');
    expect(store.filteredRows()).toHaveLength(1);
    expect(store.filteredRows()[0]?.status).toBe('invalid');
  });

  it('closes via the dialog ref', () => {
    configure();
    const fixture = TestBed.createComponent(ChunkDetailsDialog);
    fixture.detectChanges();
    httpMock
      .expectOne(detailsUrl('RUN#1', 'CHUNK#0001'))
      .flush(makeChunkDetails());

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.cd__close')?.click();

    expect(dialogRef.close).toHaveBeenCalled();
  });
});
