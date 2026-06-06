---
name: angular-rxjs-best-practices
version: 1.1.0
description: >-
  Enforces modern RxJS patterns in Angular 22+ code: signal interop (toSignal,
  toObservable), automatic unsubscription with takeUntilDestroyed, async pipe in
  templates, firstValueFrom for one-shot reads, and operator composition with
  switchMap, mergeMap, exhaustMap, and concatMap. Covers the Angular 22
  HttpClient (Fetch backend by default, withXhr + reportUploadProgress for
  upload progress), the now-stable Resource APIs (httpResource, rxResource,
  resource), and debounced() for signals. Forbids manual ngOnDestroy
  subscription tracking, nested subscribes, leaking subscriptions, subscribing
  in services that return observables, and deprecated operators. Use whenever
  generating Angular code involving observables, subscriptions, HttpClient,
  Router events, FormControl valueChanges, or reactive forms. Look for rxjs in
  package.json, Observable imports, or .subscribe calls. Do not use for
  non-Angular RxJS projects, Promise-only code, or AngularJS (1.x).
tags:
  - angular
  - angular-22
  - rxjs
  - observables
  - signals
  - best-practices
globs:
  - "**/*.ts"
---

# Angular RxJS Best Practices

## Core principle

In Angular 22+, signals are the primary state primitive. RxJS is still
essential for event streams (HttpClient, Router events, FormControl
valueChanges, websockets, user input streams), but the boundary between
RxJS and components should be as thin as possible. Convert observables to
signals at the component edge using `toSignal`; subscribe directly only
when there's a genuine side effect to perform.

## The subscription rule

**Every subscription must have automatic cleanup.** The acceptable cleanup
mechanisms, in order of preference:

1. **`async` pipe in the template** — Angular handles subscription and
   teardown
2. **`toSignal()`** — converts observable to signal with automatic cleanup
3. **`takeUntilDestroyed()`** from `@angular/core/rxjs-interop` — for
   explicit subscriptions in components/directives
4. **`firstValueFrom()`** / `lastValueFrom()` — for one-shot reads that
   complete naturally
5. **Operators that complete** — `take(1)`, `first()`, `takeWhile`, when
   completion is guaranteed

Manual `Subscription` tracking with `ngOnDestroy` is forbidden in new code.

## Subscription cleanup patterns

### Preferred — template handles it

```ts
@Component({
  template: `
    @if (user(); as u) {
      <p>{{ u.name }}</p>
    }
  `,
})
export class UserProfile {
  private readonly api = inject(UserApi);
  protected readonly user = toSignal(this.api.currentUser$);
}
```

### Preferred — toSignal at the edge

```ts
export class UsersList {
  private readonly api = inject(UsersApi);

  protected readonly users = toSignal(this.api.list$(), { initialValue: [] });
  protected readonly count = computed(() => this.users().length);
}
```

### Acceptable — takeUntilDestroyed for side effects

```ts
export class NotificationBar {
  private readonly notifications = inject(NotificationService);
  private readonly toast = inject(ToastService);

  constructor() {
    this.notifications.stream$
      .pipe(takeUntilDestroyed())
      .subscribe(n => this.toast.show(n.message));
  }
}
```

### Acceptable — firstValueFrom for one-shot reads

```ts
async save(user: User): Promise<void> {
  await firstValueFrom(this.api.update(user));
  this.router.navigate(['/users']);
}
```

### Forbidden — manual cleanup

```ts
// Wrong — error-prone, verbose, easy to forget
export class UserProfile implements OnDestroy {
  private destroy$ = new Subject<void>();
  user?: User;

  ngOnInit() {
    this.api.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(u => this.user = u);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

### Forbidden — unsubscribed subscription

```ts
// Wrong — leaks
ngOnInit() {
  this.api.currentUser$.subscribe(u => this.user = u);
}
```

## Signal interop

### `toSignal` — observable to signal

Use at the component edge to convert an HTTP stream, router event, or any
observable into a signal the template can read directly.

```ts
import { toSignal } from '@angular/core/rxjs-interop';

protected readonly user = toSignal(this.api.currentUser$, {
  initialValue: null,
});

// Read in template or computed:
protected readonly isLoggedIn = computed(() => this.user() !== null);
```

Notes:
- `toSignal` must be called in an injection context (constructor, field
  initializer, or via `runInInjectionContext`)
- Subscription is created immediately, regardless of whether the signal is
  read
- Provide `initialValue` unless the observable emits synchronously
- Errors thrown by the source are thrown when the signal is read; handle
  upstream with `catchError`

### `toObservable` — signal to observable

Use when feeding a signal into an RxJS pipeline (e.g. debounced search):

```ts
import { toObservable } from '@angular/core/rxjs-interop';

export class SearchBox {
  protected readonly query = signal('');

  private readonly results = toSignal(
    toObservable(this.query).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.api.search(q)),
    ),
    { initialValue: [] },
  );
}
```

## Resource APIs (Angular 22, stable)

`resource()`, `rxResource()`, and `httpResource()` are **stable in Angular 22**.
They model read-only async data inside the signal graph: each returns a
`Resource` exposing `value()`, `status()`, `isLoading()`, `error()`, and
`hasValue()`, and automatically reloads when a signal read in its request
changes. Prefer them over a hand-rolled `toSignal(this.http.get(...))` when the
value is "the latest result of an async call keyed by some signal."

`httpResource` — request-driven HTTP as a signal:

```ts
export class UserCard {
  readonly userId = input.required<string>();

  // Reloads whenever userId() changes; no manual subscribe.
  protected readonly user = httpResource<User>(
    () => `/api/users/${this.userId()}`,
  );
}
```

```html
@if (user.isLoading()) { <spinner /> }
@else if (user.error()) { <p>Couldn't load user.</p> }
@else if (user.hasValue()) { <p>{{ user.value().name }}</p> }
```

`rxResource` — when the loader is an observable (lets you keep RxJS operators):

```ts
protected readonly results = rxResource({
  params: () => this.query(),
  stream: ({ params }) => this.api.search(params),  // returns Observable
});
```

`resource` — when the loader returns a promise.

Notes:
- Resources are for **read-only** async data. For owned, writable state — or
  orchestration a plain resource can't express (multi-step flows, retry/backoff,
  buffering websocket events) — use a signal, a SignalStore, or an explicit
  `takeUntilDestroyed()` subscription.
- v22 adds `chain()` in the request function to compose dependent resources, and
  an `id` option so `resource`/`rxResource` can be cached across SSR → client.
- A resource's loader runs in an injection context; create resources in field
  initializers or the constructor.

## Debouncing a signal with `debounced()`

Angular 22 adds `debounced()` (in `@angular/core`) to debounce **any** signal —
distinct from form-field debouncing (`debounce(field, ms)`) and async-validator
debouncing (`validateHttp(field, { debounce })`). It returns a `Resource`, not a
signal, because a debounced value has state (settled / pending / error):

```ts
protected readonly query = signal('');
protected readonly debouncedQuery = debounced(() => this.query(), 300);

// Feed the stabilized value into another async source:
protected readonly users = httpResource<User[]>(
  () => `/api/users?q=${this.debouncedQuery.value()}`,
);
```

Use `debouncedQuery.isLoading()` to show that input hasn't settled yet. For a
pure RxJS pipeline you still use `toObservable(signal).pipe(debounceTime(...))`
as shown above; reach for `debounced()` when you want the debounced value to
drive a resource or other signal-graph consumer.

## Operator selection

The single most common RxJS mistake is picking the wrong flattening
operator. Use the right one for the semantics:

| Operator | Use when |
|---|---|
| `switchMap` | Cancel previous inner observable when new outer emits (search, navigation-driven loads) |
| `mergeMap` | Run all inner observables in parallel (fire-and-forget logging, parallel uploads) |
| `concatMap` | Queue inner observables sequentially (ordered writes, sequential animations) |
| `exhaustMap` | Ignore new outer emissions while inner is active (submit button to prevent double-submit) |

```ts
// Search — switchMap (cancel stale requests)
results$ = this.query$.pipe(
  debounceTime(300),
  switchMap(q => this.api.search(q)),
);

// Form submission — exhaustMap (ignore double-clicks)
this.submit$.pipe(
  exhaustMap(() => this.api.save(this.form.value)),
  takeUntilDestroyed(),
).subscribe();

// Logging events — mergeMap (don't care about order)
this.events$.pipe(
  mergeMap(e => this.api.log(e)),
).subscribe();

// Sequential writes — concatMap (preserve order)
this.queue$.pipe(
  concatMap(item => this.api.write(item)),
).subscribe();
```

## HttpClient patterns

### Angular 22 HttpClient defaults (Fetch, withXhr, progress)

Angular 22 makes the **Fetch backend the default**. Practical consequences:

- `withFetch()` is now redundant (and deprecated) — remove it from
  `provideHttpClient(...)`. The upgrade migration strips it for you.
- **Fetch cannot report upload progress.** If you track upload progress (a
  determinate progress bar fed by `HttpEventType.UploadProgress`), opt back into
  the XHR backend with `withXhr()`:

  ```ts
  // app.config.ts
  provideHttpClient(withXhr(), withInterceptors([errorInterceptor]))
  ```

- The `reportProgress` request option is deprecated in favor of
  `reportUploadProgress` and `reportDownloadProgress`. Use the specific one:

  ```ts
  const req = new HttpRequest('POST', url, body, { reportUploadProgress: true });
  ```

  (Upload progress still requires the XHR backend; download progress works on
  both.)

If you don't use progress events, stay on the Fetch default and change nothing.

### Type the response

```ts
// Right
this.http.get<User[]>('/api/users');

// Wrong — untyped
this.http.get('/api/users');
```

### Don't subscribe in services

Services return observables. Components convert to signals or subscribe.

```ts
// Right — service returns the observable
// Angular 22: @Service() is the preferred decorator for a root singleton that
// injects its deps via inject() — it's equivalent to
// @Injectable({ providedIn: 'root' }). Use @Injectable when you need a
// different provider scope or constructor injection.
@Service()
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(): Observable<User[]> {
    return this.http.get<User[]>('/api/users');
  }
}

// Wrong — service swallows the observable
@Service()
export class UsersApi {
  private readonly http = inject(HttpClient);
  users: User[] = [];

  load() {
    this.http.get<User[]>('/api/users').subscribe(u => this.users = u);
  }
}
```

### Handle errors with `catchError`

```ts
loadUser(id: string): Observable<User | null> {
  return this.http.get<User>(`/api/users/${id}`).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 404) return of(null);
      throw err;
    }),
  );
}
```

## FormControl valueChanges

```ts
export class SearchForm {
  protected readonly query = new FormControl('');

  protected readonly results = toSignal(
    this.query.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.api.search(q ?? '')),
    ),
    { initialValue: [] },
  );
}
```

## Router event streams

```ts
constructor() {
  this.router.events.pipe(
    filter((e): e is NavigationEnd => e instanceof NavigationEnd),
    takeUntilDestroyed(),
  ).subscribe(e => this.analytics.pageView(e.urlAfterRedirects));
}
```

## Forbidden patterns

### Nested subscribes

```ts
// Wrong — subscription hell, no cancellation, hard to compose
this.userId$.subscribe(id => {
  this.api.getUser(id).subscribe(user => {
    this.api.getOrders(user.id).subscribe(orders => {
      this.orders = orders;
    });
  });
});

// Right — flatten with operators
this.userId$.pipe(
  switchMap(id => this.api.getUser(id)),
  switchMap(user => this.api.getOrders(user.id)),
  takeUntilDestroyed(),
).subscribe(orders => this.orders.set(orders));
```

### Calling `.subscribe()` just to read a value

```ts
// Wrong
let userId: string;
this.user$.pipe(take(1)).subscribe(u => userId = u.id);

// Right
const userId = (await firstValueFrom(this.user$)).id;
```

### Mutating outer state in `tap` for primary logic

`tap` is for side effects (logging, debugging). Don't use it as your main
data flow. If `tap` updates application state, the logic belongs in
`subscribe` or a signal.

### Deprecated operators

Avoid `toPromise()` (deprecated since RxJS 7) — use `firstValueFrom` or
`lastValueFrom`. Avoid `combineAll`, `flatMap` (rename of `mergeMap`),
`partition` (the static one), and other deprecated names. Prefer the
modern equivalents.

### Subjects exposed as public API

```ts
// Wrong — anyone can call .next() and corrupt state
@Injectable({ providedIn: 'root' })
export class UserStore {
  user$ = new BehaviorSubject<User | null>(null);
}

// Right — expose as Observable, keep Subject private
@Injectable({ providedIn: 'root' })
export class UserStore {
  private readonly userSubject = new BehaviorSubject<User | null>(null);
  readonly user$ = this.userSubject.asObservable();

  setUser(user: User | null): void {
    this.userSubject.next(user);
  }
}

// Better — use a signal instead
@Injectable({ providedIn: 'root' })
export class UserStore {
  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();

  setUser(user: User | null): void {
    this._user.set(user);
  }
}
```

## When to choose signals vs RxJS

Use **signals** for:
- Component-local state
- Derived/computed values
- Template bindings
- Synchronous reactive values
- State that's read more than it's transformed

Use **RxJS** for:
- HTTP requests
- Router events
- FormControl valueChanges and statusChanges
- Websockets, SSE, event streams
- Anything that emits over time with operators (debounce, throttle, retry)
- Coordinating multiple async sources (combineLatest, forkJoin)

Convert at the boundary: RxJS for the transformation pipeline, `toSignal`
to expose the result to templates.

## Quick reference

```
Subscribe in template      → use async pipe
Subscribe in component     → toSignal, or takeUntilDestroyed
Read once                  → firstValueFrom
Cancel stale (search)      → switchMap
Ignore duplicates (submit) → exhaustMap
Run in parallel            → mergeMap
Run sequentially           → concatMap
Convert signal to obs      → toObservable
Convert obs to signal      → toSignal
Request-driven HTTP signal → httpResource / rxResource (v22 stable)
Debounce a signal value    → debounced(signal, ms) (v22)
Need upload progress (v22) → provideHttpClient(withXhr()) + reportUploadProgress
Expose subject publicly    → don't; use signal or asObservable
toPromise()                → firstValueFrom / lastValueFrom
ngOnDestroy + Subject      → takeUntilDestroyed
```
