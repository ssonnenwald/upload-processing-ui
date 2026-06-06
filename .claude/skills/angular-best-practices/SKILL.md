---
name: angular-best-practices
description: >-
  Modern Angular best practices for building performant, maintainable Angular 17+
  applications. Covers Signals, RxJS, components, templates, styles, performance,
  SSR, testing, forms, routing, accessibility, and architecture — with code examples
  and impact ratings for every rule.
  Use this skill whenever the user is working on Angular code of any kind: components,
  services, templates, stylesheets, routes, tests, or configuration. This applies to
  editing .component.ts, .service.ts, .html templates, .scss/.css styles, .spec.ts tests,
  .routes.ts files, store files, and any general .ts file in an Angular project.
  Look for angular.json, nx.json, or @angular/core imports as project indicators.
  Do not use for AngularJS (1.x), React, Vue, or non-Angular TypeScript projects.
version: 1.3.0
author: alfredoperez
tags:
  - angular
  - angular-22
  - typescript
  - signals
  - performance
  - testing
  - state-management
  - accessibility
globs:
  - "**/*.ts"
  - "**/*.html"
  - "**/*.scss"
  - "**/*.css"
  - "**/*.component.ts"
  - "**/*.service.ts"
  - "**/*.spec.ts"
  - "**/*.routes.ts"
  - "**/*.store.ts"
---

# Modern Angular Best Practices

A comprehensive set of 112 rules covering TypeScript strictness, signal-based reactivity, component architecture, template optimization, RxJS patterns, SSR hydration, bundle optimization, accessibility, routing, forms, testing, and styling — so every component, service, template, and route you build is fast, accessible, tested, and maintainable.

Below are the key patterns organized by what you're working on. For edge cases or when you need specific code examples beyond what's listed here, consult the AGENTS.md reference file in this skill directory.

## Angular 22 highlights

The current target is **Angular 22**. What changed from 21 that affects everyday code:

- **OnPush is the default change detection strategy.** New components no longer
  need to specify `changeDetection`. The old `Default` strategy is renamed
  `Eager`; set `ChangeDetectionStrategy.Eager` explicitly only when a component
  genuinely needs it.
- **HttpClient defaults to the Fetch backend.** `withFetch()` is redundant now
  (remove it). Add `withXhr()` only when you need XHR features such as upload
  progress. `reportProgress` is deprecated → use `reportUploadProgress` /
  `reportDownloadProgress`.
- **Signal Forms are stable** (`@angular/forms/signal`) — the signal-based forms
  API is production-ready.
- **Resource APIs are stable** — `resource()`, `rxResource()`, `httpResource()`
  for async data in the signal graph.
- **`@Service()` decorator** — a concise root-singleton service decorator
  (equivalent to `@Injectable({ providedIn: 'root' })`); the CLI default in v22.
- **`injectAsync()`** — lazy-load a service via dynamic import while still
  creating it through DI.
- **Router:** `paramsInheritanceStrategy` now defaults to `'always'`;
  `withComponentInputBinding()` accepts options; `canMatch` guards take a third
  `currentSnapshot` argument.
- **Templates:** `strictTemplates` is on by default; `@defer (on idle(timeout))`;
  stricter compiler checks (duplicate input/output names, multiple components
  matching a node).
- **Toolchain:** Angular 22 requires **TypeScript 6** and **Node 22+** (Node 20
  is dropped). Angular Aria (`@angular/aria`) and incremental hydration are GA.

## Components & Signals

Components are the building blocks. Modern Angular uses signals for reactivity, which changes how you write everything from state to templates.

- Use standalone components (the default) — `standalone: true` is redundant and should be omitted
- Rely on `OnPush` as the default; omit `changeDetection` unless you explicitly need `ChangeDetectionStrategy.Eager`
- Use `input()`, `output()`, `model()` signal functions instead of decorators
- Use `inject()` instead of constructor injection
- Use `@Service()` for root-singleton services (v22); `@Injectable` only for other scopes or constructor injection
- Use `injectAsync()` to lazy-load a heavy service via dynamic import when it's only needed after a user action
- Use `signal()` for local state, `computed()` for derived state
- Use `linkedSignal()` when state should reset when a source changes
- Use `resource()` / `httpResource()` / `rxResource()` (stable in v22) for async data with built-in loading states
- Use `effect()` only for side effects — never for state synchronization
- Use `toSignal()` to bridge RxJS observables into signal-based templates
- Use `viewChild()` / `contentChild()` signal queries instead of decorators
- Use the `host` property instead of `@HostBinding` / `@HostListener`

## Templates & Styles

Templates and styles work together — accessibility, layout, and performance cross both concerns.

- Use `@if`, `@for`, `@switch` control flow instead of structural directives
- Use `@defer` for heavy below-fold content (v22: `@defer (on idle(500ms))` accepts an idle timeout)
- Always provide `track` with `@for` loops
- Use `NgOptimizedImage` with `priority` for above-fold images
- Use pure pipes instead of method calls in templates
- Use `CdkVirtualScrollViewport` for large lists
- Use `[class.active]` bindings instead of `[ngClass]`
- Define theme values as CSS custom properties
- Use `prefers-reduced-motion` to respect motion preferences

## Services & RxJS

Services handle data flow, dependency injection, and RxJS patterns. HTTP, caching, and observable lifecycle are interconnected concerns.

- Unsubscribe via `takeUntilDestroyed()` or `async` pipe
- Place `catchError` inside `switchMap` to keep the outer stream alive
- Use `switchMap` for latest-only, `exhaustMap` for ignore-while-busy
- Use `shareReplay({ bufferSize: 1, refCount: true })` for shared streams
- Use `inject()` with `InjectionToken` for configuration
- Use HTTP interceptors for cross-cutting concerns (auth, retry, logging)
- HttpClient uses the Fetch backend by default in v22; drop `withFetch()`, and add `withXhr()` + `reportUploadProgress` only when you need upload progress
- Map DTOs at the API boundary — don't leak backend shapes into components

## Forms (Signal Forms, stable in v22)

Angular 22 stabilizes the signal-based forms API (`@angular/forms/signal`). For
new forms, prefer it over reactive/template-driven forms.

- Build a form from a model signal with `form(model, schema)`; bind controls
  with `[formField]` / the `Field` directive
- Apply validators and dynamic behavior (`required`, `min`, `disabled`,
  `readonly`, `hidden`) inside the schema; pass conditions via the `when` option
  rather than a bare reactive function (the old positional form is deprecated)
- Use the built-in `minDate()` / `maxDate()` validators for date inputs
- Read field errors with `field().getError('kind')` instead of scanning `errors`
- For custom controls implement `FormValueControl` (it's interoperable with
  legacy reactive and template-driven forms); `touched` is now an input plus a
  `touch()` output, not a writable model
- Debounce field updates with `debounce(field, ms | 'blur')` and async
  validators with `validateHttp(field, { debounce })`
- `markAsTouched()` now also marks descendants (pass `{ skipDescendants: true }`
  to opt out)

Legacy reactive forms (`FormGroup`/`FormControl`) remain supported; don't
rewrite working forms en masse — adopt Signal Forms for new work.

## Performance & SSR

Performance rules span components, templates, and infrastructure. SSR affects routing, data fetching, and hydration strategy.

- Preload critical data with route resolvers to eliminate waterfalls
- Lazy-load routes and `@defer` heavy views
- Tree-shake imports via standalone component imports, not modules
- Batch DOM reads/writes to avoid layout thrashing
- Use `Map`/`Set` over plain objects/arrays for frequent lookups
- Use incremental hydration (`@defer (hydrate on ...)`) for large pages
- Use `provideClientHydration(withEventReplay())` for SSR
- Set render modes per-route: SSR for SEO, CSR for dashboards

## Testing

Testing patterns apply to components, services, and templates together — isolation is important but integration context matters.

- Use component harnesses over direct DOM queries
- Create test object factories for consistent test data
- Test signal state changes and template output, not implementation
- Mock services with `jasmine.createSpyObj` or `jest.fn()`
- Test accessibility with `axe-core` or `jest-axe`

## Architecture & Routing

Architecture decisions affect every file type — routing, module boundaries, and dependency injection are structural.

- One feature per lazy-loaded route
- Use guards for auth, resolvers for data, `canDeactivate` for unsaved changes
- `canMatch` guards take a third `currentSnapshot` argument in v22 (a migration adds it)
- Use preload strategies (`QuickLinkStrategy`) for likely-next routes
- Bind route params via `input()` with `withComponentInputBinding()`; v22 lets you pass options (`queryParams`, `unmatchedInputBehavior`)
- `paramsInheritanceStrategy` defaults to `'always'` in v22 — set `'emptyOnly'` explicitly if you relied on the old behavior (no migration for this)
- Avoid barrel file re-exports — import directly from source
- Use environment-based configuration — no hardcoded URLs or API keys

## TypeScript Foundations

These apply everywhere — components, services, tests, all `.ts` files.

- Use strict type checking with `strict: true` in tsconfig
- Avoid `any`; use `unknown` when type is uncertain, generics to narrow
- Use `import type` for type-only imports
- Add explicit return types to exported functions
- Prefer `readonly` for data that should not be mutated
- Use discriminated unions for state variants
- Use the Result pattern for operations that can fail

## Accessibility

Accessibility spans templates, styles, and components — it's not just an HTML concern.

- Use semantic HTML elements first (`<nav>`, `<main>`, `<button>`)
- Use ARIA roles and `aria-live` regions for dynamic content
- Ensure all interactive elements are keyboard-accessible
- Use `cdkTrapFocus` for dialogs and overlays
- Test with screen readers and `axe-core`

## Quick Reference

| Pattern | Use | Avoid |
|---------|-----|-------|
| Signal inputs | `input<T>()` | `@Input()` |
| Signal outputs | `output<T>()` | `@Output()` |
| Two-way binding | `model<T>()` | input + output pair |
| Dependency injection | `inject()` | Constructor injection |
| Root service decorator | `@Service()` (v22) | `@Injectable({providedIn:'root'})` for new code |
| Lazy service | `injectAsync(() => import(...))` | eager `inject()` for rarely-used heavy services |
| Async data | `httpResource()` / `resource()` | manual `toSignal(http.get())` for request-driven reads |
| Control flow | `@if`, `@for`, `@switch` | `*ngIf`, `*ngFor` |
| Class binding | `[class.active]` | `[ngClass]` |
| Change detection | `OnPush` (the v22 default — omit it) | `ChangeDetectionStrategy.Eager` unless needed |
| Standalone flag | omit (default) | `standalone: true` |
| Derived state | `computed()` | Getters |
| View queries | `viewChild()` | `@ViewChild()` |

## Key Code Patterns

Signal inputs and outputs (replaces decorators):
```typescript
name = input<string>();           // @Input() replacement
save = output<Data>();            // @Output() replacement
value = model<string>();          // two-way binding
```

Control flow (replaces structural directives):
```html
@if (user()) { <profile [user]="user()" /> }
@for (item of items(); track item.id) { <card [item]="item" /> }
@defer (on viewport) { <heavy-chart /> }
```

httpResource and resource (signal-based async):
```typescript
users = httpResource<User[]>(() => `/api/users?role=${this.role()}`);
data = resource({ request: () => this.id(), loader: ({request}) => fetch(request) });
```

Services (Angular 22 `@Service()` and lazy `injectAsync()`):
```typescript
@Service()                                   // = @Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient); // inject() required with @Service()
}

// Lazy-load a heavy service only when needed:
private readonly reports = injectAsync(() => import('./reports').then(m => m.Reports));
async export() { (await this.reports()).toPdf(); }
```

Signal Forms (stable in v22):
```typescript
protected readonly model = signal({ email: '', age: 0 });
protected readonly userForm = form(this.model, (f) => {
  required(f.email);
  min(f.age, 18, { when: ({ valueOf }) => valueOf(f.isAdult) });
});
```
```html
<input [formField]="userForm.email" />
@if (userForm.email().getError('required')) { <p>Email is required</p> }
```

## Optional Library Skills

Install library-specific rules alongside this core skill:

| Library | Skill Page |
|---------|------------|
| NgRx | [angular-best-practices-ngrx](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-ngrx) |
| SignalStore | [angular-best-practices-signalstore](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-signalstore) |
| TanStack Query | [angular-best-practices-tanstack](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-tanstack) |
| Angular Material | [angular-best-practices-material](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-material) |
| PrimeNG | [angular-best-practices-primeng](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-primeng) |
| Spartan UI | [angular-best-practices-spartan](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-spartan) |
| Transloco | [angular-best-practices-transloco](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-transloco) |

## Links

- [GitHub Repository](https://github.com/alfredoperez/angular-best-practices)
- [Submit a Rule](https://github.com/alfredoperez/angular-best-practices/issues/new) via GitHub Issues
- [Browse All Skills](https://skills.sh/alfredoperez/angular-best-practices)

## License

MIT
