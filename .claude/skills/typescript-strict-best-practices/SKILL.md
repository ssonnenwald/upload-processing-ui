---
name: typescript-strict-best-practices
version: 1.1.0
description: >-
  Enforces TypeScript strict mode best practices across all generated
  TypeScript and Angular code. Covers strict compiler flags (strict,
  noImplicitAny, strictNullChecks, strictFunctionTypes,
  strictPropertyInitialization, noUncheckedIndexedAccess), forbidden patterns
  (any, non-null assertions, type assertions over guards, ts-ignore), and
  preferred patterns (unknown over any, readonly properties, discriminated
  unions over enums, as const for literals, narrow types in signatures,
  explicit return types on public APIs, type guards for runtime narrowing).
  Applies to every TypeScript file: Angular components, services, pipes,
  guards, utility functions, type definitions, and tests. Use whenever
  generating, editing, or reviewing .ts files. Look for tsconfig.json,
  typescript in package.json, or any .ts file as project signals. Do not use
  for plain JavaScript projects, Flow-typed projects, or projects with strict
  mode explicitly disabled and no migration plan.
tags:
  - typescript
  - strict-mode
  - type-safety
  - best-practices
  - angular
  - angular-22
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/tsconfig*.json"
---

# TypeScript Strict Best Practices

## Core principle

Generate code that compiles cleanly under TypeScript `strict: true` with the
additional flags `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
enabled. Treat the type system as a tool to make invalid states
unrepresentable, not as decoration on JavaScript.

## Required compiler flags

When creating or recommending a `tsconfig.json`, enable these flags. They are
non-negotiable for new projects:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true
  }
}
```

`strict: true` is the umbrella flag — the individual flags below it are
listed explicitly so readers know what they're getting. Add
`noUncheckedIndexedAccess` and `noImplicitOverride` on top.

## Angular 22 and TypeScript 6

Angular 22 **requires TypeScript v6** (`typescript: "~6.0.x"` or newer in the
`6.x` line). TypeScript 5.9 and earlier are no longer supported. When setting up
or upgrading an Angular 22 project:

- Pin `typescript` to the `6.x` range that Angular's `peerDependencies` allows.
- If you lint with `typescript-eslint`, use a version whose `typescript` peer
  range includes 6.x (older `8.x` releases cap at `<6.1.0`, which still covers
  TypeScript `6.0`, but verify before bumping TypeScript further).
- `strictTemplates` is now **on by default** in Angular 22, so you no longer
  need it in `angularCompilerOptions` — leaving it set to `true` is harmless but
  redundant. Only add `strictTemplates: false` if you are deliberately opting
  out (the upgrade migration adds that line for projects that did not already
  enable it).
- The strict flags above are unchanged by the TypeScript 6 bump; code that was
  clean under TS 5 + `strict` stays clean.

## Forbidden patterns

These do not appear in generated code, ever, without an explicit comment
justifying why:

### `any` is forbidden

```ts
// Wrong
function process(data: any) { return data.value; }

// Right
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return data.value;
  }
  throw new Error('Invalid data shape');
}

// Right when truly polymorphic — use generics
function identity<T>(value: T): T { return value; }
```

If `any` is genuinely required (interop with untyped library, gradual
migration), add a comment explaining why and prefer `// eslint-disable-next-line`
scoped to a single line rather than the whole file.

### Non-null assertion `!` is forbidden

```ts
// Wrong — silently breaks if user is undefined
const name = user!.name;

// Right — handle the null case explicitly
if (!user) throw new Error('User required');
const name = user.name;

// Right — narrow with a guard
const name = user?.name ?? 'Anonymous';
```

The only acceptable use of `!` is when the type system genuinely cannot
infer non-nullness that's guaranteed by external invariants (e.g. a value
returned from a DI container that's always present). Even then, prefer
runtime assertion.

### `@ts-ignore` and `@ts-nocheck` are forbidden

Use `@ts-expect-error` instead, which causes a compile error if the
underlying issue is fixed and the comment becomes unnecessary. Always
include a justification:

```ts
// @ts-expect-error - third-party types missing for legacy.module, see #123
import { foo } from 'legacy-module';
```

### Type assertions (`as`) are a last resort

Prefer type guards and narrowing over assertions. A type assertion tells
TypeScript "trust me" — it does not check the value. Use only when:

1. Asserting from `unknown` after a runtime check the type system cannot
   express
2. Narrowing a literal-to-string assertion (`as const`)
3. Working around a known TypeScript limitation, with a comment

```ts
// Wrong — assertion without verification
const user = data as User;

// Right — guard first, then narrow
function isUser(x: unknown): x is User {
  return typeof x === 'object' && x !== null && 'id' in x && 'name' in x;
}
if (isUser(data)) {
  // data is User here, no assertion needed
}
```

### Don't use `Function` or `Object` types

These are too broad. Use specific signatures:

```ts
// Wrong
function run(callback: Function) { callback(); }
function take(thing: Object) {}

// Right
function run(callback: () => void) { callback(); }
function take(thing: Record<string, unknown>) {}
```

## Preferred patterns

### Use `unknown` over `any` for inputs of unknown shape

`unknown` forces narrowing before use. `any` silently bypasses the type
system.

```ts
function parse(input: unknown): User {
  if (!isUser(input)) throw new Error('Invalid input');
  return input;
}
```

### Use `readonly` aggressively

Mark properties, array parameters, and object parameters as readonly when
they're not meant to be mutated.

```ts
class UserService {
  private readonly cache = new Map<string, User>();

  process(users: readonly User[]): readonly User[] {
    return users.filter(u => u.active);
  }
}

type ImmutableConfig = Readonly<{
  apiUrl: string;
  retries: number;
}>;
```

For Angular: signal inputs, outputs, and queries are always `readonly`.

### Discriminated unions over enums

Discriminated unions are exhaustive, tree-shakeable, and compose better
with type narrowing than enums.

```ts
// Wrong — enum
enum Status { Loading, Success, Error }
type State = { status: Status; data?: User; error?: string };

// Right — discriminated union
type State =
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: string };

function render(state: State) {
  switch (state.status) {
    case 'loading': return '...';
    case 'success': return state.data.name; // narrowed to User
    case 'error': return state.error;
  }
}
```

If an enum is genuinely needed (e.g. interop with a numeric API), use
`const enum` or a plain object with `as const`.

### `as const` for literal types

```ts
// Wrong — type is string[]
const ROLES = ['admin', 'editor', 'viewer'];

// Right — type is readonly ['admin', 'editor', 'viewer']
const ROLES = ['admin', 'editor', 'viewer'] as const;
type Role = typeof ROLES[number]; // 'admin' | 'editor' | 'viewer'
```

### Narrow types in function signatures

A function should accept the narrowest type it actually needs and return the
narrowest type it can guarantee.

```ts
// Wrong — accepts too much
function getInitials(user: User): string {
  return user.firstName[0] + user.lastName[0];
}

// Right — only depends on names
function getInitials(user: Pick<User, 'firstName' | 'lastName'>): string {
  return user.firstName[0] + user.lastName[0];
}
```

### Explicit return types on public APIs

Inferred return types are fine inside functions and for private helpers,
but exported functions, public methods, and component outputs should have
explicit return types. This prevents accidental API changes from type
inference shifts.

```ts
// Right — explicit on public API
export function loadUser(id: string): Promise<User> {
  return fetch(`/api/users/${id}`).then(r => r.json());
}

// Fine — inferred on private helper
function buildUrl(id: string) {
  return `/api/users/${id}`;
}
```

### Use utility types

Prefer `Partial<T>`, `Required<T>`, `Pick<T, K>`, `Omit<T, K>`,
`Readonly<T>`, `Record<K, V>`, `ReturnType<F>`, `Parameters<F>`,
`Awaited<P>`, and `NonNullable<T>` over re-declaring shapes.

```ts
type UserUpdate = Partial<Omit<User, 'id' | 'createdAt'>>;
type UserMap = Record<string, User>;
type FetchResult = Awaited<ReturnType<typeof fetchUser>>;
```

### Catch with `unknown` (TypeScript 4.4+)

```ts
try {
  await loadUser();
} catch (error) {
  // error is unknown, must be narrowed
  if (error instanceof HttpErrorResponse) {
    handleHttp(error);
  } else if (error instanceof Error) {
    handleGeneric(error);
  } else {
    handleUnknown(error);
  }
}
```

### Use `satisfies` over annotation for literal config

`satisfies` validates a value against a type without widening it.

```ts
// Wrong — loses literal types
const config: Record<string, string | number> = {
  apiUrl: 'https://api.example.com',
  retries: 3,
};

// Right — keeps narrow types, still validates
const config = {
  apiUrl: 'https://api.example.com',
  retries: 3,
} satisfies Record<string, string | number>;

config.retries; // type is 3, not number
```

## Angular-specific TypeScript patterns

### Signal types

```ts
// Right — explicit types on inputs
readonly userId = input.required<string>();
readonly variant = input<'compact' | 'detailed'>('compact');

// Right — explicit type on writable signal
private readonly users = signal<readonly User[]>([]);

// Right — computed inherits its type
protected fullName = computed(() => `${this.firstName()} ${this.lastName()}`);
```

### Service injection

```ts
// Right — inject returns correctly typed instance
private readonly api = inject(UserApi);

// Right — InjectionToken for non-class providers
const CONFIG = new InjectionToken<AppConfig>('app.config');
private readonly config = inject(CONFIG);
```

### Avoid `any` in HTTP responses

```ts
// Wrong
this.http.get('/api/users').subscribe((res: any) => ...)

// Right
this.http.get<User[]>('/api/users').subscribe(users => ...)

// Better — define a response type
interface UsersResponse { items: User[]; total: number; }
this.http.get<UsersResponse>('/api/users');
```

## When working with legacy code

If editing a file that uses `any`, non-null assertions, or other forbidden
patterns extensively, do not rewrite the whole file. Apply strict patterns
to new code added in the same edit and leave a comment if the surrounding
code conflicts. Migration to strict mode should be done deliberately, not
as a drive-by refactor.

If the project's `tsconfig.json` does not have strict mode enabled,
generated code should still follow these patterns — it costs nothing and
makes future migration easier.

## Quick reference

```
any           → unknown + guard, or generic <T>
!  (non-null) → narrow with if/?? or assert at runtime
as Type       → type guard function with `is`
@ts-ignore    → @ts-expect-error with justification
Function      → specific signature: (a: X) => Y
Object        → Record<string, unknown> or specific shape
enum          → discriminated union or `as const` object
mutable array → readonly T[]
inferred API  → explicit return type on exports
catch (e)     → catch (error: unknown) + narrow
typed config  → const x = {...} satisfies Type
```
