---
name: angular-file-separation
description: >-
  Enforces three-file separation for every Angular component using the Angular
  22+ naming convention: a TypeScript class file, an HTML template file, and
  an SCSS or CSS stylesheet — all sharing the same hyphenated base name (for
  example user-profile.ts, user-profile.html, user-profile.scss), with NO
  .component suffix. The component decorator must reference the template and
  styles via templateUrl and styleUrls, never via inline template or styles.
  Use this skill whenever the user asks for an Angular component, directive,
  or any code that includes a Component decorator — including new components,
  refactors, examples, demos, and snippets. Apply even for tiny components
  where inline templates would normally be idiomatic. Look for @angular/core
  imports, Component decorators, or any mention of Angular components as
  triggers. Do not use for AngularJS (1.x), React, Vue, Svelte, or
  non-Angular TypeScript projects.
version: 2.2.0
tags:
  - angular
  - angular-22
  - components
  - file-structure
  - conventions
globs:
  - "**/*.ts"
  - "**/*.html"
  - "**/*.scss"
  - "**/*.css"
---

# Angular File Separation (Angular 22+)

## Rule

Every Angular component **must** be split into three separate files that share
the same hyphenated base name. Following Angular 22+ conventions, the
`.component` suffix is **dropped**:

1. **`<name>.ts`** — the component class, decorator, inputs, outputs, and logic
2. **`<name>.html`** — the template markup
3. **`<name>.scss`** (or `.css`) — the component-scoped styles

The `@Component` decorator references the template and styles by path:

```ts
// user-profile.ts
import { Component, input } from '@angular/core';

// Note: `standalone: true` is omitted. Standalone is the default since Angular
// v19, and Angular 22 flags an explicit `standalone: true` as redundant.
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.html',
  styleUrls: ['./user-profile.scss'],
})
export class UserProfile {
  readonly userId = input.required<string>();
}
```

```html
<!-- user-profile.html -->
<section class="user-profile">
  <h2>User {{ userId() }}</h2>
</section>
```

```scss
// user-profile.scss
.user-profile {
  padding: 1rem;
}
```

## What NOT to do

### ❌ Do not use inline `template` or `styles`

```ts
// ❌ Wrong — inline template
@Component({
  selector: 'app-user-profile',
  template: `<div>{{ userId() }}</div>`,
  styles: [`div { color: red; }`],
})
export class UserProfile { /* ... */ }
```

### ❌ Do not use the legacy `.component` suffix in file names

```
// ❌ Wrong — pre-Angular-20 file naming
user-profile.component.ts
user-profile.component.html
user-profile.component.scss
```

### ❌ Do not append `Component` to the class name

```ts
// ❌ Wrong — legacy class naming
export class UserProfileComponent { /* ... */ }

// ✅ Right — Angular 22+
export class UserProfile { /* ... */ }
```

## Why

- **Angular 22+ official convention** — matches `ng generate` output and the
  current Angular style guide at https://angular.dev/style-guide.
- **Consistency** across the codebase regardless of component size.
- **Editor tooling** (HTML/SCSS language servers, formatters, linters) works
  better against real files than tagged template literals.
- **Diff readability** — template changes don't pollute TypeScript diffs and
  vice versa.

## Stylesheet extension: always prefer SCSS

**Default to `.scss` for every component stylesheet.** SCSS is the strongly
preferred choice for Angular 22+ code generation. Only use `.css` when one
of the following is true:

1. The user explicitly asks for plain CSS
2. The existing project clearly uses `.css` throughout (check `angular.json`
   → `schematics` → `@schematics/angular:component` → `style`, or scan
   existing component folders for `.css` vs `.scss` files)
3. The project has no SCSS support configured and adding it is out of scope

In every other case — new components, examples, demos, snippets, greenfield
projects, when the project's preference is ambiguous, or when the user
hasn't specified — generate `.scss`. Even a stylesheet with no Sass-specific
syntax should still be saved as `.scss` for consistency, since SCSS is a
superset of CSS and the file extension signals project conventions to
tooling and contributors.

When generating a component, the `@Component` decorator should reference
the SCSS file:

```ts
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.html',
  styleUrls: ['./user-profile.scss'],  // always .scss by default
})
export class UserProfile {}
```

Do not split a component across `.css` and `.scss` files. Pick one extension
per project and stick with it.

## Working with legacy projects

If editing an existing project that still uses `.component.*` suffixes
throughout, **prioritize consistency within that project** — match the
existing convention rather than mixing styles. The Angular style guide
explicitly says: "Whenever you encounter a situation in which these rules
contradict the style of a particular file, prioritize maintaining
consistency."

For brand-new components or greenfield projects, always use the Angular 22+
convention (no suffix).

## Multiple stylesheets

If a component has more than one stylesheet, append descriptive words to the
base name:

```ts
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.html',
  styleUrls: [
    './user-profile-settings.scss',
    './user-profile-subscription.scss',
  ],
})
export class UserProfile { /* ... */ }
```

## Applies to

- New components generated from scratch
- Refactors of existing inline-template components
- Example snippets and demos in chat
- Components inside libraries, feature modules, or standalone setups

## Does NOT apply to

- Directives without templates
- Pipes
- Services, guards, resolvers, interceptors
- Test files (`.spec.ts`) — those stay as a single file by convention
- AngularJS 1.x, React, Vue, or other frameworks
