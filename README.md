## @rello-platform/eslint-plugin-permissions

ESLint plugin that forbids string-literal permission slugs in Rello-ecosystem source. Mechanical drift prevention at lint time, complementing the compile-time `PermissionSlug` type guard exported by `@rello-platform/permissions`.

## Why

`@rello-platform/permissions` defines the canonical permission registry as a `PERMISSIONS` const, with each entry exposing a `slug` (e.g. `contacts:read`, `flows:write`, `suppression:lift`). The TypeScript `PermissionSlug` type catches drift in code that flows through `hasPermission(...)` / `requireServiceBearer(...)` / `PlatformCaller.permissions` typed surfaces — but it cannot catch string literals that bypass the type system: untyped map keys, JSON config, picker option values, request bodies, audit-log fixtures, etc.

This rule closes that gap. It flags every `Literal` whose whole-string value matches the canonical permission shape `<resource>:<verb>` and points the developer at the matching `PERMISSIONS.X.slug` constant.

## Matching

The rule matches **whole-string Literal values** that satisfy `/^[a-z][a-z-]*:[a-z][a-z-]+$/`. It fires on `"contacts:read"` but not on:

- URLs: `"https://example.com"` (uppercase / multi-colon / has slashes)
- Error message prose with embedded colons: `"foo: bar"` (whitespace breaks the match)
- CSS selectors: `":hover"` (no resource segment) or `"a:hover"` (still matches if both segments are lowercase + hyphens — escape-hatch with a disable comment if the literal is intentional)
- TypeScript type annotations and identifiers — the rule operates on `Literal` and static `TemplateLiteral` nodes, not on identifiers or type names

Template literals with interpolation (`` `${resource}:${verb}` ``) are skipped — they are runtime-constructed and may legitimately resolve to a non-canonical value. Static template literals (`` `contacts:read` ``) are matched.

## Suggested-fix lookup

When the consumer has `@rello-platform/permissions` installed in `node_modules`, the rule resolves the package at lint time, reads its `SLUG_TO_KEY` export, and surfaces the matching canonical key in the error message:

```
String-literal permission 'contacts:read' — use PERMISSIONS.CONTACTS_READ.slug from @rello-platform/permissions.
```

If the package is not installed (or the literal is not in the canonical registry), the rule still fires but uses a generic message — the regex match alone is sufficient signal that the literal should be canonicalized or removed.

The rule does NOT auto-fix. Replacement requires importing `PERMISSIONS` from `@rello-platform/permissions` (which the rule cannot reliably do via `fixer`), so the developer applies the fix by hand.

## Install

```bash
npm install --save-dev github:rello-platform/eslint-plugin-permissions#v0.1.0
```

(The package is also published to GitHub Packages at `@rello-platform/eslint-plugin-permissions`. Either install form works; the github-ref pin is the platform's existing convention.)

## Use (flat config)

```js
// eslint.config.mjs
import permissionsPlugin from "@rello-platform/eslint-plugin-permissions";

export default [
  // ... your existing config
  {
    plugins: { "@rello-platform/permissions": permissionsPlugin },
    rules: { "@rello-platform/permissions/no-string-permission": "error" },
  },
];
```

Or opt into the bundled recommended config:

```js
import permissionsPlugin from "@rello-platform/eslint-plugin-permissions";

export default [
  // ... your existing config
  permissionsPlugin.configs.recommended,
];
```

## Exempting legitimate string-literal permissions

Some production code must keep string-literal permissions for legitimate reasons — audit-log fixtures, regression tests, historical migration scripts. For these, add an inline disable with a rationale:

```ts
// eslint-disable-next-line @rello-platform/permissions/no-string-permission -- audit log records the historical permission string verbatim
auditLog.record({ permission: "legacy:read" });
```

For directory-wide exemption (test fixtures, historical documentation), use ESLint's standard `ignores` or path-scoped overrides:

```js
{
  files: ["**/*.test.ts", "**/migrations/**"],
  rules: { "@rello-platform/permissions/no-string-permission": "off" },
}
```

The `--<rationale>` suffix on disable comments is a convention enforced separately by `eslint-plugin-eslint-comments/require-description` if the consumer wires it up. This plugin does not require the suffix on its own.

## Test

```bash
npm test
```

Tests cover positive cases (canonical-shape literals fire) across regex shapes, negative cases (URLs, prose with colons, identifiers, interpolated templates), and a smoke check that the rule fires inside JSX and function arguments.

## Versioning

Tracks `@rello-platform/permissions`. The plugin does not bundle the canonical registry — it resolves `SLUG_TO_KEY` from the consumer's installed `@rello-platform/permissions` at lint time. Bumping the canonical registry does not require bumping this plugin.
