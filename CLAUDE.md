# upload-processing-ui — Claude Code instructions

Angular 22 standalone app (NgRx SignalStore, Angular Material, SignalR) — the UI
for the AWS upload-processing pipeline.

## Commands

- Install: `npm install` (the repo .npmrc sets legacy-peer-deps; NgRx is held at
  21.x until a v22 release ships — do NOT bump @ngrx/\* to ^22 yet).
- Dev server: `npm start` (proxies /api and /hubs to the local API).
- Unit tests: `npm test -- --watch=false` (Vitest, zone-less).
- Lint: `npm run lint`.
- Production build: `npm run build`.
- Prefer the angular-cli MCP tools over guessing v22 APIs.

## Angular 22 conventions

- Standalone is default — never set `standalone: true`.
- OnPush is the default — only add `changeDetection` for `Eager`.
- `input()`/`output()`/`model()` signals; `inject()` (never constructor DI).
- `@Service()` for root singletons (= `@Injectable({ providedIn: 'root' })`).
- Native control flow `@if`/`@for (track)`/`@switch`; `class`/`style` bindings;
  host bindings in the `host` object — never `@HostBinding`/`@HostListener`.

## This project's specifics

- Components are three files (`.ts`/`.html`/`.scss`, SCSS default) via
  `templateUrl`/`styleUrls`. Match the existing area: `features/*` and
  `shared/components/*` use legacy `*.component.ts` filenames; `core/layout` uses
  the no-suffix style. Class names carry no `Component`/`Service` suffix.
- State in NgRx SignalStore (`rxMethod` + `tapResponse`); local UI state in signals.
- Services return observables; components use `toSignal`/`takeUntilDestroyed`.
- HttpClient uses Fetch by default in v22, but this app keeps `withXhr()` in
  app.config.ts for upload progress; use `reportUploadProgress`.
- TypeScript strict; no `any` (use `unknown`); `readonly` where possible.

## Testing (required)

- Every testable artifact gets a Vitest `.spec.ts`. Standard TestBed, zone-less.
- NEVER use `fakeAsync`, `tick`, or any `zone.js/testing` utility.
- Use `provideHttpClientTesting` + `HttpTestingController` for HTTP.

<!-- Detailed, on-demand versions of these conventions live as skills in
     .claude/skills/ — keeping this file lean since it loads every session. -->
