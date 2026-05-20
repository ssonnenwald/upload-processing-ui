import {
  HttpClient,
  HttpEvent,
  HttpEventType,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '@env/environment';
import {
  FunctionCatalogEntry,
  RunDetailsResponse,
  RunListItem,
  RunStatus,
  UploadDefinitionView,
  UploadRequest,
  UploadResponse,
} from '../models/run.models';
import type { RunSummaryResponse } from '../models/run-summary.models';

/**
 * Progress reported back from an upload. The component shows a determinate
 * progress bar from `loaded / total`, switching to an indeterminate spinner
 * once the server has the bytes and is still processing the request.
 */
export interface UploadProgress {
  readonly kind: 'progress' | 'response';
  readonly loaded: number;
  readonly total: number;
  readonly response?: UploadResponse;
}

@Injectable({ providedIn: 'root' })
export class RunsApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** GET /api/functions — catalog of upload types for the function picker. */
  listFunctions(): Observable<readonly FunctionCatalogEntry[]> {
    return this.http.get<readonly FunctionCatalogEntry[]>(
      `${this.base}/api/functions`,
    );
  }

  /** GET /api/functions/{function}/definition — for rendering options on the upload form. */
  getDefinition(fn: string): Observable<UploadDefinitionView> {
    return this.http.get<UploadDefinitionView>(
      `${this.base}/api/functions/${encodeURIComponent(fn)}/definition`,
    );
  }

  /** GET /api/runs/{runId} — initial state for run-details and run-watcher pages. */
  getRun(runId: string): Observable<RunDetailsResponse> {
    return this.http.get<RunDetailsResponse>(
      `${this.base}/api/runs/${encodeURIComponent(runId)}`,
    );
  }

  /** GET /api/runs/summary — dashboard aggregate counts by status. */
  getSummary(): Observable<RunSummaryResponse> {
    return this.http.get<RunSummaryResponse>(`${this.base}/api/runs/summary`);
  }

  /**
   * GET /api/runs — paged run list. `status` filters via GSI1_ByStatus,
   * `uploadedBy` filters via GSI2_ByUser; passing both narrows further server-side
   * if the API supports it (otherwise the server picks GSI2 and filters in memory).
   */
  listRuns(opts?: {
    status?: RunStatus;
    uploadedBy?: string;
    function?: string;
    limit?: number;
  }): Observable<readonly RunListItem[]> {
    const params: Record<string, string> = {};
    if (opts?.status) params['status'] = opts.status;
    if (opts?.uploadedBy) params['uploadedBy'] = opts.uploadedBy;
    if (opts?.function) params['function'] = opts.function;
    if (opts?.limit) params['limit'] = String(opts.limit);
    return this.http.get<readonly RunListItem[]>(`${this.base}/api/runs`, {
      params,
    });
  }

  /**
   * POST /api/uploads/{function} as multipart/form-data. Returns an Observable
   * of progress events so the upload component can render a real progress bar
   * — XHR upload progress events are passed through unchanged.
   */
  uploadFile(req: UploadRequest): Observable<UploadProgress> {
    const form = new FormData();
    form.append('file', req.file, req.file.name);
    form.append('uploadedBy', req.uploadedBy);
    // Options serialized as JSON — the backend's [FromForm] binder will accept a
    // single string field and the controller can JsonSerializer.Deserialize it.
    form.append('options', JSON.stringify(req.options));

    const request = new HttpRequest(
      'POST',
      `${this.base}/api/uploads/${encodeURIComponent(req.function)}`,
      form,
      { reportProgress: true },
    );

    return this.http
      .request<UploadResponse>(request)
      .pipe(map(this.toProgress));
  }

  private toProgress = (event: HttpEvent<UploadResponse>): UploadProgress => {
    switch (event.type) {
      case HttpEventType.UploadProgress:
        return {
          kind: 'progress',
          loaded: event.loaded,
          total: event.total ?? 0,
        };
      case HttpEventType.Response:
        return {
          kind: 'response',
          loaded: 1,
          total: 1,
          response: event.body ?? undefined,
        };
      default:
        // Sent / ResponseHeader / DownloadProgress aren't useful here; collapse
        // them into a no-op progress event so subscribers see a steady stream.
        return { kind: 'progress', loaded: 0, total: 0 };
    }
  };
}
