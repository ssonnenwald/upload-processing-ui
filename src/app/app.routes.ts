import { Routes } from '@angular/router';
import { MainLayout } from './core/layout/main-layout/main-layout';

/**
 * Feature pages render as children of `MainLayout`, so they all share the
 * shell chrome (sidenav, toolbar). Routes that should NOT have the shell —
 * a future login or full-screen error page — would sit as siblings of this
 * layout route rather than as children.
 */
export const routes: Routes = [
  {
    path: '',
    component: MainLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then(
            (m) => m.DashboardPageComponent,
          ),
        title: 'Dashboard — Upload Processing',
      },
      {
        path: 'upload',
        loadComponent: () =>
          import('./features/upload/upload-page.component').then(
            (m) => m.UploadPageComponent,
          ),
        title: 'New Upload — Upload Processing',
      },
      {
        path: 'runs',
        loadComponent: () =>
          import('./features/run-history/run-history-page.component').then(
            (m) => m.RunHistoryPageComponent,
          ),
        title: 'Run History — Upload Processing',
      },
      {
        path: 'runs/:runId',
        loadComponent: () =>
          import('./features/run-details/run-details-page.component').then(
            (m) => m.RunDetailsPageComponent,
          ),
        title: 'Run Details — Upload Processing',
      },
      {
        path: 'runs/:runId/watch',
        loadComponent: () =>
          import('./features/run-watcher/run-watcher-page.component').then(
            (m) => m.RunWatcherPageComponent,
          ),
        title: 'Live Run — Upload Processing',
      },
      {
        path: 'logs',
        loadComponent: () =>
          import('./features/logs/logs-page.component').then(
            (m) => m.LogsPageComponent,
          ),
        title: 'Pipeline Logs — Upload Processing',
      },
      {
        path: 'health',
        loadComponent: () =>
          import('./features/pipeline-health/pipeline-health-page.component').then(
            (m) => m.PipelineHealthPageComponent,
          ),
        title: 'Pipeline Health — Upload Processing',
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
