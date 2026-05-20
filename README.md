# Upload Processing — Admin UI

Angular 21 frontend for the **UploadProcessing** backend. Implements the full admin
flow: upload files, watch runs live via SignalR, browse history, and drill into
individual run details.

## Tech

- **Angular 21** — standalone components, zoneless, signals throughout
- **Angular Material 21** — M3 theming via CSS custom properties
- **NgRx SignalStore (@ngrx/signals 21)** — feature stores for shared and per-page state
- **@microsoft/signalr 8** — typed client for the `/hubs/run-status` hub
- **TypeScript 5.9** with strict mode

## Project structure

```
src/
├── app/
│   ├── core/
│   │   ├── api/
│   │   │   ├── runs-api.service.ts      REST wrapper: catalog, definitions, upload, list, get
│   │   │   └── error.interceptor.ts     Normalizes HTTP errors into readable messages
│   │   ├── stores/
│   │   │   ├── functions.store.ts       Root: catalog + cached per-function definitions
│   │   │   ├── run-history.store.ts     Root: filter state + run list, debounced reactivity
│   │   │   ├── live-run.store.ts        Per-page: single run + chunks, folds SignalR events
│   │   │   └── upload.store.ts          Per-page: submission progress + final response
│   │   ├── models/run.models.ts         Mirrors the C# Contracts.cs records exactly
│   │   └── signalr/run-status-hub.service.ts  SignalR client with auto-reconnect & re-subscribe
│   ├── shared/components/
│   │   ├── status-badge.component.ts    Colored pill for run/chunk statuses
│   │   ├── run-progress.component.ts    Determinate / indeterminate progress bar
│   │   ├── row-counts.component.ts      Four-up succeeded/failed/invalid/skipped card
│   │   ├── run-summary-card.component.ts Header card with meta + progress + counts
│   │   └── chunks-table.component.ts    Per-chunk breakdown table
│   ├── features/
│   │   ├── upload/                      /upload — file picker, function dropdown, options
│   │   ├── run-history/                 /runs — filterable table
│   │   ├── run-details/                 /runs/:id — drill-in (REST snapshot)
│   │   └── run-watcher/                 /runs/:id/watch — live SignalR view
│   ├── app.ts                           Shell with side-nav + hub state indicator
│   ├── app.config.ts                    Bootstrap providers
│   └── app.routes.ts                    Lazy-loaded feature routes
├── environments/                        Build-time API base config
├── testing/
│   └── factories.ts                     Shared typed model factories for specs
├── styles.scss                          M3 theme + app design tokens
└── index.html
```

Each `core` / `shared` / `feature` source file has a co-located `.spec.ts`.

### Path aliases

Configured in `tsconfig.json`; use these instead of long relative imports:

| Alias       | Maps to            |
| ----------- | ------------------ |
| `@core`     | `src/app/core`     |
| `@shared`   | `src/app/shared`   |
| `@features` | `src/app/features` |
| `@env`      | `src/environments` |
| `@testing`  | `src/testing`      |

## Store architecture

Four SignalStores cover the app's state. Each is scoped to where it makes sense:

| Store             | Scope    | Owns                                                                                                                                                             |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FunctionsStore`  | root     | The upload-type catalog and a cache of per-function definitions (keyed by function name via `withEntities`)                                                      |
| `RunHistoryStore` | root     | History page filter state, paged run list (`withEntities` keyed by runId), debounced auto-reload                                                                 |
| `LiveRunStore`    | per-page | A single run's full state plus chunks (`withEntities` keyed by chunkSk); merges REST snapshot + SignalR events; auto-tears down hub subscription via `onDestroy` |
| `UploadStore`     | per-page | Upload-in-flight state (uploading, percent, lastResponse, error)                                                                                                 |

**Why per-page for two of them:** the live-run and upload flows are tied to a
single page session. Providing them at `providers: [LiveRunStore]` in the
component means navigating away tears down the SignalR subscription cleanly
via the store's `onDestroy` hook.

**Why root for the other two:** the catalog and history filters benefit from
caching across navigations. Going to `/upload`, then `/runs`, then back to
`/upload` doesn't re-fetch the function catalog — `FunctionsStore.loadCatalog()`
is idempotent.

**Why entities for chunks:** SignalR's `chunkUpdated` event needs to find a
chunk by `chunkSk` and update it in place. `withEntities` makes that an O(1)
`updateEntity` call instead of an array scan + rebuild.

## Backend contracts this UI expects

The TypeScript models in `core/models/run.models.ts` mirror the C# records in
`UploadProcessing.Api/Contracts/Contracts.cs`. The API surface this UI consumes:

| Method | Path                                   | Notes                                                             |
| ------ | -------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/functions`                       | Returns `FunctionCatalogEntry[]` for the upload dropdown          |
| GET    | `/api/functions/{function}/definition` | Exposes the `options` map for editable toggles                    |
| GET    | `/api/runs/{runId}`                    | Implemented in `RunsController`                                   |
| GET    | `/api/runs?status=...&uploadedBy=...`  | Backs the history page via GSI1/GSI2 queries                      |
| POST   | `/api/uploads/{function}`              | Multipart form with `file`, `uploadedBy`, `options` (JSON string) |

<!-- TODO: confirm every endpoint above is implemented server-side. If any are
still pending, mark them so a reader knows which calls will fail. -->

The SignalR hub is already implemented and matches what this UI consumes:

| Event                | Direction       | Payload type       |
| -------------------- | --------------- | ------------------ |
| `SubscribeToRun`     | Client → Server | `string` (runId)   |
| `UnsubscribeFromRun` | Client → Server | `string` (runId)   |
| `chunkUpdated`       | Server → Client | `ChunkUpdate`      |
| `runStatusChanged`   | Server → Client | `RunStatusChanged` |
| `runCompleted`       | Server → Client | `RunSummary`       |

## Setup

```bash
npm ci
npm start
```

`npm ci` installs exactly what `package-lock.json` pins — reproducible, and it
fails if `package.json` and the lockfile have drifted.

The Angular CLI dev server listens on `http://localhost:4200` and proxies `/api`
and `/hubs` to `http://localhost:5099` (the local URL the `UploadProcessing.Api`
project uses by default). Adjust `proxy.conf.json` if your API runs elsewhere.

## Build

```bash
npm run build
```

Outputs to `dist/upload-processing-ui/`. The default production config uses
relative URLs (`apiBaseUrl: ''`) so the UI works behind a reverse proxy that
serves both the UI and the API from the same origin. For a separate host, edit
`src/environments/environment.ts`.

## Testing, linting, CI

The unit suite runs on **Vitest** via the `@angular/build:unit-test` builder.

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `npm test`                  | Run the unit suite (watch mode)                          |
| `npm test -- --watch=false` | Single run, exits with a status code (CI mode)           |
| `npm run test:coverage`     | Run tests with V8 coverage                               |
| `npm run lint`              | ESLint — Angular, TypeScript, and NgRx SignalStore rules |
| `npm run format`            | Format the codebase with Prettier                        |
| `npm run format:check`      | Check formatting without writing changes                 |

**Shared test factories.** All model test data comes from typed factory
functions in `src/testing/factories.ts`, imported via `@testing/factories`:

```ts
import { makeRunDetails, makeChunk } from '@testing/factories';

const run = makeRunDetails({ status: 'Failed' });
```

Each `make*` returns a fully valid model object and accepts a `Partial<T>` of
overrides. There is **one definition per model** — if a backend model gains a
required field, the factory fails to compile in one place rather than letting
stale-shaped objects slip silently through every spec. Add test data here, not
in individual specs. Spec-local helpers genuinely tied to a single test's
fixtures (a fixed-clock timestamp builder, a fake-store stub, a deliberately
partial cast) correctly stay in that spec.

**Gotcha — testing rxjs `retry` / `repeat`.** A test exercising an rxjs
`retry`, `repeat`, or `retryWhen` operator must have its mocked observable
produce a _fresh result per subscription_ — wrap it in `defer(...)`. A static
`of(...)` or `throwError(...)` is replayed identically on every resubscribe, so
a retry-then-succeed path is never exercised and the test silently passes for
the wrong reason. `retry` resubscribes to its _source_ observable; it does not
re-invoke the mocked method. See the 404-retry tests in
`core/stores/live-run.store.spec.ts` for the working pattern.

**Gotcha — NgRx reactive methods need an injection context.** Calling a
SignalStore `rxMethod` (or a store method that wires one, e.g.
`RunHistoryStore.ensureLoaded`) outside an Angular injection context emits a
deprecation warning and will eventually throw. In tests, wrap such calls in
`TestBed.runInInjectionContext(() => ...)`. See `run-history.store.spec.ts`.

**Linting & formatting.** ESLint uses `angular-eslint`, `typescript-eslint`,
and the `@ngrx` SignalStore rule set (`@ngrx/eslint-plugin/v9`, scoped to
`configs.signals`); config is `eslint.config.js` (flat config). Prettier
handles formatting only — `eslint-config-prettier` disables ESLint's stylistic
rules so the two don't conflict; config is `.prettierrc.json`.

**CI.** `.github/workflows/ci.yml` runs `npm run lint` and the unit suite on
every pull request and on pushes to `main`. `.github/dependabot.yml` opens
weekly grouped dependency-update PRs, which are checked by the same CI.

<!-- TODO: if a branch protection rule requires the CI check before merge,
note it here so contributors know merges are gated. -->

## Design notes

**Zoneless.** Angular 21 ships zoneless by default. State is in signals and
Angular re-renders when those signals change. No `zone.js`, no `markForCheck`.

**Stores expose signals, not observables.** Components inject the store and
read `store.someField()` like any other signal — templates stay the same as
before. RxJS only shows up inside `rxMethod` blocks for HTTP and SignalR.

**Folding SignalR events into entities.** `LiveRunStore.applyChunkUpdate`
calls `patchState(store, updateEntity({ id, changes }, chunkConfig))`. That's
the entire "merge incoming event into local state" operation — no array copy,
no manual reconciliation.

**Reactive filter loading.** `RunHistoryStore` wires its rxMethod once to a
combined `(filters, refreshTick)` signal. Every filter setter just patches
state; the rxMethod re-fires automatically with debounce + dedupe. Force-refresh
bumps a tick counter so identical filters still re-fetch.

**Hub lifecycle.** `RunStatusHub` is a plain `providedIn: 'root'` service (not
a store) because it owns a single durable WebSocket and has no application
state — just a connection-status signal exposed for the UI badge. Auto-reconnect
re-joins subscribed runs because SignalR's reconnect preserves connection state
but NOT group membership.

**Routes.** All feature pages are lazy-loaded. The route param `runId` is bound
to the component's `input.required<string>()` via `withComponentInputBinding()`,
so there's no need to inject `ActivatedRoute` anywhere.

## What's not in scope

- Auth — assumes an upstream reverse proxy or VPN handles it. Add an HTTP
  interceptor for tokens if needed.
- Real-time updates on the history page — by design; reach for the watcher page
  for that.
- Detail S3 file viewer — the chunks table shows error summaries inline; the
  `detailsS3Key` per-row drill-down would be a future feature.
