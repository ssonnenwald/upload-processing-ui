---
name: angular-vitest-testing
version: 1.1.0
description: >-
  Requires a Vitest .spec.ts file to accompany every piece of Angular 22+ code
  that can be tested: components, directives, services, pipes, guards,
  resolvers, interceptors, routes, validators, and utility functions. Uses
  Vitest (the Angular 22+ default test runner) with standard TestBed for
  Angular primitives and direct instantiation for pure functions. Enforces
  zone-less patterns (no fakeAsync, no tick, no zone.js test utilities),
  signal-aware assertions, and provideHttpClientTesting for HTTP. Spec files
  share the hyphenated base name of the file under test with a .spec.ts
  suffix. Use whenever generating Angular code or tests in an Angular 22+
  project. Look for vitest in package.json or the @angular/build:unit-test
  builder in angular.json. Do not use for Karma or Jasmine projects,
  AngularJS (1.x), React, Vue, or non-Angular TypeScript projects.
tags:
  - angular
  - angular-22
  - vitest
  - testing
  - spec
  - tdd
globs:
  - "**/*.ts"
  - "**/*.spec.ts"
---

# Angular 22+ Vitest Testing

## Core rule

**Every piece of Angular code that can be tested must ship with a `.spec.ts` file.** When generating Angular code of any kind, also generate the matching spec file in the same response. Do not ask whether to include tests — include them by default.

If something genuinely cannot be tested (a re-export barrel file, a constant-only file with no logic, an interface or type definition), say so explicitly and skip the spec rather than fabricating a hollow test.

## What gets a spec file

| Artifact | Spec required? | Notes |
|---|---|---|
| Component | Yes | TestBed + ComponentFixture, signal-aware assertions |
| Directive | Yes | TestBed with a host test component |
| Service / Store / API client | Yes | Direct instantiation via `TestBed.inject` |
| Pipe | Yes | Direct instantiation, no TestBed needed for pure pipes |
| Guard (function-based) | Yes | TestBed for `runInInjectionContext` |
| Resolver (function-based) | Yes | Same pattern as guards |
| HTTP interceptor (function-based) | Yes | Use `provideHttpClient(withInterceptors(...))` + `HttpTestingController` |
| Route config (`*.routes.ts`) | Yes | Assert route paths, components, guards |
| Validator function | Yes | Pure function call with `FormControl` instances |
| Utility / helper function | Yes | Direct unit tests |
| Class with logic | Yes | Direct instantiation |
| Type / interface only | No | Nothing to test |
| Re-export barrel (`index.ts`) | No | Nothing to test |
| Pure constants file | No | Nothing to test |

## File naming

Spec files use the Angular 22+ convention: same hyphenated base name as the file under test, with `.spec.ts` appended.

| Source file | Spec file |
|---|---|
| `user-profile.ts` | `user-profile.spec.ts` |
| `auth-store.ts` | `auth-store.spec.ts` |
| `highlight.ts` (directive) | `highlight.spec.ts` |
| `currency-pipe.ts` | `currency-pipe.spec.ts` |
| `auth-guard.ts` | `auth-guard.spec.ts` |
| `app.routes.ts` | `app.routes.spec.ts` |
| `format-currency.ts` (utility) | `format-currency.spec.ts` |

Spec files live in the **same directory** as the file under test, never in a separate `tests/` folder.

## Required imports and setup

Vitest is the runner. Import test primitives from `vitest`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
```

Use `vi` for mocks and spies (not `jest`, not `jasmine`). Use `vi.fn()`, `vi.spyOn()`, `vi.mock()`.

## Zone-less constraints

Angular 22 runs Vitest **zone-less by default**. The following are **forbidden** in generated tests:

- `fakeAsync` and `tick` — both rely on Zone.js
- `async` from `@angular/core/testing` (the legacy zone-based one)
- Anything from `zone.js/testing`
- `flush`, `flushMicrotasks`, `discardPeriodicTasks`

> **Angular 22 note:** v22 adds *optional* support for the Zone.js test
> utilities (`fakeAsync`, `flush`, `waitForAsync`) under Vitest, enabled by
> adding `"zone.js/plugins/vitest-patch"` to the test target's polyfills. That
> exists only to ease incremental migration of legacy zone-based tests — **do
> not use it for new tests.** New and rewritten tests stay zone-less per the
> rules above. If you migrate Jasmine tests with the CLI, prefer
> `ng g refactor-jasmine-vitest --fake-async`, which converts `fakeAsync`/`tick`
> to Vitest fake timers (`vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync()`)
> so the result has no Zone.js dependency.

Replacements:

- **Async work** → use real `async`/`await` (the JS keyword), `await fixture.whenStable()`, or `vi.useFakeTimers()` for timer control
- **Timers** → `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)` + `vi.useRealTimers()` in cleanup
- **HTTP** → `provideHttpClientTesting()` and `HttpTestingController`
- **Observables** → resolve with `firstValueFrom()` or await emissions directly

## Component test pattern

```ts
// user-profile.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserProfile } from './user-profile';

describe('UserProfile', () => {
  let fixture: ComponentFixture<UserProfile>;
  let component: UserProfile;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserProfile],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfile);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders the user id', () => {
    fixture.componentRef.setInput('userId', 'abc-123');
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('h2');
    expect(heading.textContent).toContain('abc-123');
  });

  it('computes full name from first and last', () => {
    fixture.componentRef.setInput('firstName', 'Ada');
    fixture.componentRef.setInput('lastName', 'Lovelace');
    fixture.detectChanges();

    // Signal inputs are read by calling them.
    expect(component['fullName']()).toBe('Ada Lovelace');
  });
});
```

Key points:
- Standalone components go in `imports`, never `declarations`
- Set signal inputs via `fixture.componentRef.setInput(name, value)`, not by assigning to the property
- Read signals by calling them: `component.userId()`, not `component.userId`
- Call `fixture.detectChanges()` after input changes

### `TestBed.getLastFixture()` (Angular 22+)

Angular 22 adds `TestBed.getLastFixture()`, which returns the most recently
created fixture without you having to capture it in a variable. It's handy when
the fixture is created in a shared `beforeEach` or a helper:

```ts
beforeEach(() => TestBed.createComponent(UserProfile));

it('renders', () => {
  const fixture = TestBed.getLastFixture<UserProfile>();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('h2')).toBeTruthy();
});
```

Prefer an explicit `fixture = TestBed.createComponent(...)` when a test creates
several components and needs to address them individually; reach for
`getLastFixture()` only when there's a single, unambiguous "current" fixture.

## Service test pattern

```ts
// auth-store.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthStore } from './auth-store';

describe('AuthStore', () => {
  let store: AuthStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    store = TestBed.inject(AuthStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('starts logged out', () => {
    expect(store.isAuthenticated()).toBe(false);
  });

  it('sets the user after a successful login', async () => {
    const loginPromise = store.login('ada@example.com', 'secret');

    const req = httpMock.expectOne('/api/login');
    expect(req.request.method).toBe('POST');
    req.flush({ id: '1', name: 'Ada' });

    await loginPromise;

    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()?.name).toBe('Ada');
  });

  afterEach(() => {
    httpMock.verify();
  });
});
```

## Pipe test pattern

Pure pipes don't need TestBed — instantiate them directly:

```ts
// currency-pipe.spec.ts
import { describe, it, expect } from 'vitest';
import { CurrencyPipe } from './currency-pipe';

describe('CurrencyPipe', () => {
  const pipe = new CurrencyPipe();

  it('formats whole dollars', () => {
    expect(pipe.transform(42)).toBe('$42.00');
  });

  it('handles zero', () => {
    expect(pipe.transform(0)).toBe('$0.00');
  });

  it('returns empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });
});
```

## Directive test pattern

Directives need a host component to exercise the selector:

```ts
// highlight.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Highlight } from './highlight';

@Component({
  imports: [Highlight],
  template: `<p appHighlight>Test</p>`,
})
class HostTest {}

describe('Highlight', () => {
  let fixture: ComponentFixture<HostTest>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostTest],
    }).compileComponents();

    fixture = TestBed.createComponent(HostTest);
    fixture.detectChanges();
  });

  it('applies a yellow background to the host element', () => {
    const p = fixture.debugElement.query(By.css('p')).nativeElement;
    expect(p.style.backgroundColor).toBe('yellow');
  });
});
```

## Functional guard test pattern

```ts
// auth-guard.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { runInInjectionContext } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth-guard';
import { AuthStore } from '../auth/auth-store';

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('allows navigation when authenticated', () => {
    const store = TestBed.inject(AuthStore);
    store.setAuthenticated(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).toBe(true);
  });

  it('blocks navigation when not authenticated', () => {
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).toBe(false);
  });
});
```

## HTTP interceptor test pattern

```ts
// auth-interceptor.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('attaches the Authorization header', () => {
    http.get('/api/data').subscribe();

    const req = httpMock.expectOne('/api/data');
    expect(req.request.headers.get('Authorization')).toMatch(/^Bearer /);
    req.flush({});
  });
});
```

## Utility function test pattern

No TestBed, no Angular machinery — just call the function:

```ts
// format-currency.spec.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format-currency';

describe('formatCurrency', () => {
  it('formats positive numbers with two decimals', () => {
    expect(formatCurrency(42.5)).toBe('$42.50');
  });

  it('handles negative numbers', () => {
    expect(formatCurrency(-7)).toBe('-$7.00');
  });
});
```

## Mocking patterns

Use `vi` for all mocks and spies:

```ts
import { vi } from 'vitest';

// Mock a function
const logger = { log: vi.fn() };
logger.log('hello');
expect(logger.log).toHaveBeenCalledWith('hello');

// Spy on an existing method
const spy = vi.spyOn(service, 'load').mockResolvedValue(fakeData);

// Mock a module
vi.mock('./auth-store', () => ({
  AuthStore: vi.fn().mockImplementation(() => ({
    isAuthenticated: () => true,
  })),
}));

// Fake timers
vi.useFakeTimers();
vi.advanceTimersByTime(1000);
vi.useRealTimers();
```

## Naming spec descriptions

- `describe()` block: the class or function name, exactly as it appears in code (`UserProfile`, not `'the user profile component'`)
- `it()` blocks: complete the sentence "it ___" — `it('renders the title')`, `it('emits when save is clicked')`, `it('returns null for empty input')`
- Group related cases with nested `describe()` for setup variations

## Coverage expectations

A test file should at minimum cover:

1. **Construction / creation** — the thing instantiates without errors
2. **Each public method or signal** — happy path
3. **Each branch** — conditionals, ternaries, error paths
4. **Inputs and outputs** — for components, every `input()` and `output()`
5. **Edge cases** — null, undefined, empty arrays, zero, negative numbers, missing optional inputs

Aim for behavior coverage, not line coverage. A test that exercises a code path without asserting anything meaningful is worse than no test.

## Angular 22 CLI test tooling

The `@angular/build:unit-test` builder (the Vitest runner configured in
`angular.json`) gained options in v22:

- `quiet` — suppress the build summary/stats table; defaults to `true` locally
  and `false` in CI. Override per-run with `--quiet` or in `angular.json`.
- `isolate` — run Vitest in isolated mode (separate threads/processes).

Migration helpers, when moving a project onto Vitest:

- `ng g @schematics/angular:migrate-karma-to-vitest` — swaps Karma config and
  dependencies for Vitest.
- `ng g refactor-jasmine-vitest --include <path>` — converts Jasmine specs to
  Vitest. Add `--fake-async` to convert `fakeAsync`/`tick` to Vitest fake
  timers (keeping the result zone-less), and `--browser-mode` to target Vitest
  Browser Mode for component tests.

These are for migrating existing suites. Newly generated specs should already
follow the zone-less, `vi`-based patterns in this skill and need no migration.

## What NOT to do

```ts
// ❌ Zone-based async
import { fakeAsync, tick } from '@angular/core/testing';

// ❌ Jasmine globals
spyOn(service, 'load');

// ❌ Setting signal input by assignment
component.userId = 'abc';

// ❌ Reading a signal without calling it
expect(component.fullName).toBe('Ada');

// ❌ Declarations array for standalone components
TestBed.configureTestingModule({ declarations: [UserProfile] });

// ❌ Hollow test
it('works', () => { expect(true).toBe(true); });
```

## When in doubt

If a piece of code has any branch, any conditional, any input variation, any side effect, or any return value worth asserting — it gets a spec. The only files that legitimately skip the spec are pure type definitions, re-export barrels, and constants-only files. Everything else is testable, so test it.
