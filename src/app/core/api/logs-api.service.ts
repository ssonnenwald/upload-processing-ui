import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '@env/environment';
import type {
  LogEventsQuery,
  LogEventsResponse,
  LogGroupCatalogEntry,
  LogGroupInfo,
  LogStreamInfo,
} from '../models/logs.models';

/**
 * Typed client for the CloudWatch Logs endpoints exposed by LogsController.
 *
 * Mirrors the RunsApi pattern: `providedIn: 'root'`, `inject()` for the
 * HttpClient, and the base URL pulled from the environment rather than
 * hardcoded. Every method maps to one controller action.
 */
@Injectable({ providedIn: 'root' })
export class LogsApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /**
   * GET /api/logs/functions
   * The three known pipeline log groups, for the diagnostics dropdown.
   */
  listFunctions(): Observable<readonly LogGroupCatalogEntry[]> {
    return this.http.get<readonly LogGroupCatalogEntry[]>(
      `${this.base}/api/logs/functions`,
    );
  }

  /**
   * GET /api/logs/groups?prefix=...
   * Discovers log groups under the UploadProcessing prefix. The optional
   * `prefix` narrows the search; the API rejects a prefix outside its
   * allowed namespace with a 400.
   */
  listGroups(prefix?: string): Observable<readonly LogGroupInfo[]> {
    let params = new HttpParams();
    if (prefix) {
      params = params.set('prefix', prefix);
    }
    return this.http.get<readonly LogGroupInfo[]>(
      `${this.base}/api/logs/groups`,
      { params },
    );
  }

  /**
   * GET /api/logs/streams?group=...
   * Recent streams for one group, newest first.
   */
  listStreams(
    group: string,
    limit?: number,
  ): Observable<readonly LogStreamInfo[]> {
    let params = new HttpParams().set('group', group);
    if (limit != null) {
      params = params.set('limit', limit);
    }
    return this.http.get<readonly LogStreamInfo[]>(
      `${this.base}/api/logs/streams`,
      { params },
    );
  }

  /**
   * GET /api/logs/events?group=...
   * Parsed log events for a group, with optional stream count, severity
   * floor, runId correlation, and lookback window.
   */
  getEvents(query: LogEventsQuery): Observable<LogEventsResponse> {
    let params = new HttpParams().set('group', query.group);
    if (query.streams != null) {
      params = params.set('streams', query.streams);
    }
    if (query.minLevel) {
      params = params.set('minLevel', query.minLevel);
    }
    if (query.runId) {
      params = params.set('runId', query.runId);
    }
    if (query.sinceMinutes != null) {
      params = params.set('sinceMinutes', query.sinceMinutes);
    }
    return this.http.get<LogEventsResponse>(`${this.base}/api/logs/events`, {
      params,
    });
  }
}
