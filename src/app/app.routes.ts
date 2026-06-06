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
          import('./features/dashboard/dashboard-page').then(
            (m) => m.DashboardPage,
          ),
        title: 'Dashboard — Upload Processing',
      },
      {
        path: 'upload',
        loadComponent: () =>
          import('./features/upload/upload-page').then(
            (m) => m.UploadPage,
          ),
        title: 'New Upload — Upload Processing',
      },
      {
        path: 'runs',
        loadComponent: () =>
          import('./features/run-history/run-history-page').then(
            (m) => m.RunHistoryPage,
          ),
        title: 'Run History — Upload Processing',
      },
      {
        path: 'runs/:runId',
        loadComponent: () =>
          import('./features/run-details/run-details-page').then(
            (m) => m.RunDetailsPage,
          ),
        title: 'Run Details — Upload Processing',
      },
      {
        path: 'runs/:runId/watch',
        loadComponent: () =>
          import('./features/run-watcher/run-watcher-page').then(
            (m) => m.RunWatcherPage,
          ),
        title: 'Live Run — Upload Processing',
      },
      {
        path: 'logs',
        loadComponent: () =>
          import('./features/logs/logs-page').then(
            (m) => m.LogsPage,
          ),
        title: 'Pipeline Logs — Upload Processing',
      },
      {
        path: 'health',
        loadComponent: () =>
          import('./features/pipeline-health/pipeline-health-page').then(
            (m) => m.PipelineHealthPage,
          ),
        title: 'Pipeline Health — Upload Processing',
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
