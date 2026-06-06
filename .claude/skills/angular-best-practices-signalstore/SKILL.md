---
name: angular-best-practices-signalstore
description: >-
  NgRx SignalStore best practices for Angular. Covers shared state,
  computed state, entity management, and RxJS integration with rxMethod.
  Activates when working with @ngrx/signals and @ngrx/signals/entities.
  Do not use for NgRx Store or class-based state services.
  Install alongside angular-best-practices for full coverage.
license: MIT
metadata:
  author: alfredoperez
  version: "1.3.0"
tags: [angular, angular-22, ngrx-signals, signalstore, state-management]
globs:
  - "**/*.ts"
  - "**/*.store.ts"
---

# Angular SignalStore Best Practices

NgRx SignalStore rules for signal-based local and feature state management. Use with the core
[angular-best-practices](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices)
skill for comprehensive Angular coverage.

## Links

- [Core Skill: angular-best-practices](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices)
- [Browse All Skills](https://skills.sh/alfredoperez/angular-best-practices)
- [GitHub Repository](https://github.com/alfredoperez/angular-best-practices)

## When to Apply

- Creating or modifying SignalStore-based state management
- Integrating RxJS side effects with `rxMethod`
- Managing collections with `withEntities`

## Angular 22 notes

- The SignalStore APIs this skill covers (`signalStore`, `withState`,
  `withComputed`, `withMethods`, `withEntities`, `withHooks`, `rxMethod`,
  `patchState`, `entityConfig`) are stable and work unchanged on Angular 22.
- `@ngrx/signals` tracks Angular's major versions. If NgRx has not yet shipped a
  release whose `@angular/core` peer range includes 22, install with
  `--legacy-peer-deps` until it does, then move `@ngrx/*` to the matching major.
  The store APIs themselves do not change.
- **Resource APIs are now stable in v22** (`resource()`, `rxResource()`,
  `httpResource()`). Use them for read-only async data that lives in the signal
  graph (built-in `value`/`isLoading`/`error`, request-driven reloads). Keep
  SignalStore for owned, writable feature/shared state and for orchestration
  that a plain resource can't express — multi-step flows, retry/backoff,
  buffering external (e.g. websocket) events, or coordinating several effects.
  Inside a store, prefer `rxMethod` + `tapResponse` for that orchestration; reach
  for `rxResource`/`httpResource` when the store field is just "latest value of
  an HTTP call keyed by a signal."
- `rxMethod` resolves the injector of its calling context in v22, so calling a
  store method that wires an `rxMethod` from a component constructor (an
  injection context) continues to work as expected.

## Rules

| Rule | Impact | Description |
|------|--------|-------------|
| Use rxMethod for RxJS Integration | MEDIUM | Debounce, switchMap, and other RxJS operators in stores |
| Use SignalStore for Shared State | HIGH | Signal-based reactivity without full NgRx overhead |
| Use withComputed for Derived State | MEDIUM | Centralized memoized derivation logic |
| Use withEntities for Collections | MEDIUM | O(1) lookups and standardized CRUD operations |

## Install

Install from [skills.sh/alfredoperez/angular-best-practices](https://skills.sh/alfredoperez/angular-best-practices):

- Core skill: [angular-best-practices](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices)
- This add-on: [angular-best-practices-signalstore](https://skills.sh/alfredoperez/angular-best-practices/angular-best-practices-signalstore)
