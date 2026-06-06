# Copilot instructions — upload-processing-ui

You are an expert in TypeScript, Angular 22, NgRx SignalStore, and AWS-backed
Angular apps. Write functional, accessible, strictly-typed code.

## Angular 22

- Standalone is the default — do NOT set `standalone: true` (v22 flags it redundant).
- OnPush is the default change detection — don't add `changeDetection` unless a
  component genuinely needs `ChangeDetectionStrategy.Eager`.
- Use `input()`/`output()`/`model()` signal functions, never `@Input()`/`@Output()`.
- Use `inject()`, never constructor injection.
- Use `@Service()` for root-singleton services (equivalent to
  `@Injectable({ providedIn: 'root' })`); use `@Injectable` only for other scopes.
- Native control flow `@if`/`@for (track ...)`/`@switch`; never `*ngIf`/`*ngFor`.
- Use `class`/`style` bindings, never `ngClass`/`ngStyle`.
- Put host bindings in the `host` object; never `@HostBinding`/`@HostListener`.

## File & naming conventions (match the existing area)

- `features/*` and `shared/components/*` use legacy `*.component.ts` filenames —
  keep that convention there. `core/layout` uses the no-suffix style — keep that.
- Every component is three files sharing a base name (`.ts`, `.html`, `.scss`)
  with `templateUrl`/`styleUrl`; never inline template/styles. SCSS by default.
- Class names carry no `Component`/`Service` suffix (e.g. `RunsApi`, `UploadStore`).

## TypeScript

- Strict mode. No `any` — use `unknown` and narrow. Prefer `readonly`.
- TypeScript 6 (Angular 22 pins `>=6.0 <6.1`).

## RxJS & HTTP

- Services return observables; never subscribe inside a service.
- Components convert with `toSignal` or subscribe with `takeUntilDestroyed()`.
- `switchMap` for latest-only, `exhaustMap` for ignore-while-busy; no nested subscribes.
- HttpClient uses the Fetch backend by default in v22. THIS app keeps `withXhr()`
  in app.config.ts because the upload needs progress events; use
  `reportUploadProgress` (not the deprecated `reportProgress`).

## State

- Feature/shared state lives in NgRx SignalStore (`withState`/`withComputed`/
  `withMethods`/`withEntities`, `rxMethod` + `tapResponse`). Local UI state: signals.

## Testing (required)

- Every testable artifact gets a Vitest `.spec.ts` (same hyphenated base name).
- Standard `TestBed`; zone-less. NEVER use `fakeAsync`, `tick`, or any
  `zone.js/testing` utility. Use `provideHttpClientTesting` + `HttpTestingController`.

## Dependencies

- NgRx is held at 21.x until a v22 release ships; installs use legacy-peer-deps
  (see .npmrc). Don't bump `@ngrx/*` to ^22 until it exists on npm.
