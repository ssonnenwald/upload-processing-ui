---
name: angular-naming-conventions
description: >-
  Enforces Angular 22+ official naming conventions across all generated Angular
  code. Covers file names (hyphenated, no .component/.service/.directive
  suffix), class names (no Component/Service/Directive suffix), selectors
  (kebab-case with app prefix for components, camelCase with app prefix for
  attribute directives), TypeScript identifiers (PascalCase classes,
  camelCase members), the Angular 22 @Service() decorator, special-case
  suffixes (-pipe, -guard, -module, and domain suffixes like -store, -api,
  -client for services), and test file naming with the .spec.ts ending. Use
  this skill whenever the user asks for Angular code of any kind — components,
  directives, services, pipes, guards, resolvers, interceptors, modules,
  routes, stores, or tests. Look for @angular/core imports, Component or
  Directive or Injectable or Service or Pipe decorators, or any mention of
  Angular as triggers. Do not use for AngularJS (1.x), React, Vue, or
  non-Angular TypeScript projects.
version: 1.1.0
tags:
  - angular
  - angular-22
  - naming
  - conventions
  - style-guide
globs:
  - "**/*.ts"
  - "**/*.html"
  - "**/*.scss"
  - "**/*.css"
---

# Angular 22+ Naming Conventions

Source of truth: https://angular.dev/style-guide

This skill enforces the **2025 naming convention** (default in Angular 20+ and
continued in 21 and 22). The previous "2016" convention with `.component.ts`,
`.service.ts`, etc. is legacy and only used in projects that opted into it via
`ng new --file-name-style-guide 2016`.

## File names

### General rules

- **Separate words with hyphens.** `user-profile.ts`, not `userProfile.ts` or
  `user_profile.ts`.
- **Match the file name to the primary TypeScript identifier.** A class named
  `UserProfile` lives in `user-profile.ts`.
- **Avoid generic names** like `helpers.ts`, `utils.ts`, `common.ts`. Use
  names that describe the purpose.
- **Tests** use `.spec.ts`: `user-profile.spec.ts`.

### Suffix rules by file type

| Type | Old (legacy) | New (Angular 20+) |
|------|--------------|-------------------|
| Component | `user-profile.component.ts` | `user-profile.ts` |
| Component template | `user-profile.component.html` | `user-profile.html` |
| Component styles | `user-profile.component.scss` | `user-profile.scss` |
| Directive | `highlight.directive.ts` | `highlight.ts` |
| Service | `auth.service.ts` | `auth-store.ts`, `auth-api.ts`, `auth-client.ts` (domain-specific) |
| Pipe | `currency.pipe.ts` | `currency-pipe.ts` |
| Guard | `auth.guard.ts` | `auth-guard.ts` |
| Resolver | `user.resolver.ts` | `user-resolver.ts` |
| Interceptor | `auth.interceptor.ts` | `auth-interceptor.ts` |
| Module (legacy) | `shared.module.ts` | `shared-module.ts` |
| Routes | `app-routing.module.ts` | `app.routes.ts` |
| Bootstrap | `main.ts` | `main.ts` |

**Key insight:** Components, directives, and services drop the suffix
entirely. Pipes, guards, resolvers, interceptors, and modules use a
**hyphenated** suffix instead of the old dotted one.

### Services use domain-specific suffixes

Services no longer use the word "service" in the file or class name. Choose a
suffix that describes the role:

- `-store` — holds and exposes state (e.g. `auth-store.ts`)
- `-api` — wraps an external API (e.g. `users-api.ts`)
- `-client` — HTTP client wrapper (e.g. `payments-client.ts`)
- `-repository` — data access layer (e.g. `orders-repository.ts`)
- No suffix — pure utility (e.g. `logger.ts`)

### The `@Service()` decorator (Angular 22+)

Angular 22 introduces a dedicated `@Service()` decorator (from `@angular/core`).
With no arguments it is exactly equivalent to `@Injectable({ providedIn: 'root' })`
— a tree-shakeable, application-wide singleton — and it is what `ng generate service`
emits by default in v22. It is the preferred decorator for the common root-singleton
case; the file/class naming rules above are unchanged (still no `Service` suffix on
the class).

```ts
// users-api.ts — Angular 22 preferred form
import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Service()
export class UsersApi {
  private readonly http = inject(HttpClient);
}
```

Constraints and options:

- The class **must** use the `inject()` function for its own dependencies —
  constructor parameter injection is not supported with `@Service()`. (A
  parameterless constructor for setup work is fine.)
- For a non-root scope, pass `@Service({ autoProvided: false })` and list the
  class in a `providers` array yourself, or keep using
  `@Injectable({ providedIn: 'platform' | 'any' })` / explicit providers.
- `@Injectable()` is **not** deprecated — keep it when you need a provider scope
  other than root, a `useFactory`/`useExisting` provider, or constructor
  injection. Generate those with `ng generate service --injectable`.
- When editing an existing project, match what the surrounding services already
  use — don't mix `@Service()` and `@Injectable({ providedIn: 'root' })` in the
  same area purely for style. Consistency wins.

## Class names

### Drop the type suffix from class names

```ts
// ✅ Right — Angular 22+
export class UserProfile { /* @Component */ }
export class HighlightOnHover { /* @Directive */ }
export class AuthStore { /* @Service() or @Injectable */ }

// ❌ Wrong — legacy
export class UserProfileComponent { /* ... */ }
export class HighlightOnHoverDirective { /* ... */ }
export class AuthService { /* ... */ }
```

### Exceptions that keep their suffix in the class name

Pipes, guards, resolvers, and modules **do** keep the type word in the class:

```ts
export class CurrencyPipe implements PipeTransform { /* ... */ }
export class AuthGuard implements CanActivate { /* ... */ }
export class UserResolver implements Resolve<User> { /* ... */ }
export class SharedModule { /* ... */ }
```

### Casing

- **Classes**: `PascalCase` — `UserProfile`, `AuthStore`
- **Interfaces / types**: `PascalCase` — `User`, `OrderStatus`
- **Methods / properties / signals**: `camelCase` — `firstName`, `loadUsers()`
- **Constants** (module-level immutables): `UPPER_SNAKE_CASE` — `MAX_RETRIES`
- **Enums**: `PascalCase` with `PascalCase` members — `OrderStatus.Pending`

## Selectors

### Component selectors

- **Element selector**, kebab-case, with your app prefix: `app-user-profile`
- Match the file name with the prefix prepended
- Pick a 2–4 letter app-specific prefix (`app-` is the default; for a movie
  app called MovieReel, use `mr-`)

```ts
@Component({
  selector: 'app-user-profile',  // ✅
  // ...
})
export class UserProfile {}
```

### Directive selectors

- **Attribute selector**, camelCase, with your app prefix: `[appTooltip]`,
  `[mrTooltip]`

```ts
@Directive({
  selector: '[appHighlight]',  // ✅
})
export class Highlight {}
```

## Inputs, outputs, and signals

### Inputs

Prefer the signal-based `input()` function. Mark as `readonly`:

```ts
readonly userId = input.required<string>();
readonly variant = input<'compact' | 'detailed'>('compact');
```

Name inputs for **what they are**, not for their type:

```ts
// ✅
readonly disabled = input(false);
readonly userId = input.required<string>();

// ❌
readonly isDisabled = input(false);     // drop `is` prefix
readonly userIdValue = input<string>(); // drop `Value` suffix
```

### Outputs

Use `output()`. Name with a **verb that describes the event**:

```ts
readonly userSaved = output<User>();      // ✅
readonly cancelClicked = output<void>();  // ✅
readonly onSave = output<User>();          // ❌ — drop the `on` prefix
```

### Event handlers in templates

Name handlers for **what they do**, not for the trigger:

```html
<!-- ✅ -->
<button (click)="saveUserData()">Save</button>

<!-- ❌ -->
<button (click)="handleClick()">Save</button>
```

## Access modifiers

- Use `protected` for members used **only** by the template — they're not
  part of the component's public API.
- Use `readonly` for properties initialized by Angular (`input`, `output`,
  `model`, queries).

```ts
export class UserProfile {
  readonly firstName = input<string>();
  readonly lastName = input<string>();

  // Only used by the template — protected, not public.
  protected fullName = computed(() => `${this.firstName()} ${this.lastName()}`);
}
```

## Project structure naming

- All UI code under `src/`
- Bootstrap in `src/main.ts`
- Group by **feature**, not by file type. Use directories like
  `show-times/film-calendar/`, not `components/`, `services/`, `directives/`.

```
src/
├─ movie-reel/
│  ├─ show-times/
│  │  ├─ film-calendar/
│  │  │  ├─ film-calendar.ts
│  │  │  ├─ film-calendar.html
│  │  │  ├─ film-calendar.scss
│  │  │  └─ film-calendar.spec.ts
│  │  ├─ film-details/
│  ├─ reserve-tickets/
│  │  ├─ payment-info/
│  │  ├─ purchase-confirmation/
```

## When project context conflicts with these rules

If editing an existing project that uses legacy `.component.ts`,
`.service.ts`, etc. throughout, **match the existing project's convention**.
Consistency within a project beats compliance with the new style guide. Only
adopt the new convention for greenfield projects or when the project has
already migrated.

Look for these signals to detect convention:
- `angular.json` may have `"fileNameStyleGuide": "2016"` or `"2025"` under
  schematics
- File listing: if you see `.component.ts` files, the project is on the
  legacy convention
- Class names ending in `Component`, `Service`, `Directive` indicate legacy

## Quick reference card

```
UserProfile component → user-profile.ts + user-profile.html + user-profile.scss
                       class UserProfile, selector 'app-user-profile'

Highlight directive  → highlight.ts
                       class Highlight, selector '[appHighlight]'

AuthStore service    → auth-store.ts
                       class AuthStore (no Service suffix)
                       @Service() in v22 (= @Injectable({providedIn:'root'}))

CurrencyPipe         → currency-pipe.ts
                       class CurrencyPipe (keeps Pipe suffix)

AuthGuard            → auth-guard.ts
                       class AuthGuard (keeps Guard suffix)

Routes               → app.routes.ts
Bootstrap            → main.ts
Tests                → <name>.spec.ts
```
