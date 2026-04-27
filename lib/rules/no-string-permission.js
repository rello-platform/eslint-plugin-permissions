"use strict";

/**
 * @fileoverview Flags string-literal permission slugs in Rello-ecosystem source.
 *
 * Canonical permissions live in `@rello-platform/permissions`. The `PermissionSlug`
 * type guards code that flows through typed signatures (Phase 4 narrowed every
 * receiver-side helper to `permission: PermissionSlug`), but it cannot catch
 * string literals that bypass the type system: untyped map keys, JSON config,
 * request bodies, picker option values constructed from raw strings, etc.
 *
 * Membership-only fire (v0.2.0): the rule fires iff the literal is a member of
 * the canonical SLUG_TO_KEY map exported by @rello-platform/permissions. Shape
 * collisions with non-permission namespaces — tag slugs (`harvest-home:hot`),
 * node module specifiers (`node:crypto`), Mailgun option keys (`o:tracking`),
 * RSS namespace keys (`content:encoded`) — are NOT flagged. The regex prefilter
 * stays as a fast-path before the membership check.
 *
 * Earlier (v0.1.0) the rule had a second `stringPermissionNoKey` message that
 * fired on regex match without canonical membership; the rationale was typo-
 * catching ("leds:read" for "leads:read"). Phase 4's compile-time PermissionSlug
 * narrowing made that mode redundant for typed surfaces and net-negative for
 * untyped ones (92% false-positive rate at NS scale). Removed in v0.2.0.
 *
 * Disable comments are accepted via standard ESLint mechanics.
 */

const PERMISSION_SLUG_RE = /^[a-z][a-z-]*:[a-z][a-z-]+$/;

const slugToKeyByCwd = new Map();

function loadSlugToKey(cwd) {
  if (!cwd) return null;
  if (slugToKeyByCwd.has(cwd)) return slugToKeyByCwd.get(cwd);
  let result = null;
  try {
    const resolved = require.resolve("@rello-platform/permissions", {
      paths: [cwd],
    });
    // eslint-disable-next-line global-require
    const pkg = require(resolved);
    if (pkg && pkg.SLUG_TO_KEY && typeof pkg.SLUG_TO_KEY === "object") {
      result = pkg.SLUG_TO_KEY;
    }
  } catch {
    // Consumer does not have @rello-platform/permissions installed (or it
    // is installed at a layout we cannot resolve from cwd). Treat the rule
    // as a no-op rather than firing on every shape-colliding literal.
  }
  slugToKeyByCwd.set(cwd, result);
  return result;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow string-literal permission slugs; use PERMISSIONS.X.slug from @rello-platform/permissions",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-permissions#no-string-permission",
    },
    fixable: null,
    schema: [],
    messages: {
      stringPermissionWithKey:
        "String-literal permission '{{literal}}' — use PERMISSIONS.{{key}}.slug from @rello-platform/permissions.",
    },
  },

  create(context) {
    const cwd =
      typeof context.cwd === "string" && context.cwd
        ? context.cwd
        : typeof context.getCwd === "function"
          ? context.getCwd()
          : process.cwd();
    const slugToKey = loadSlugToKey(cwd);

    function checkLiteral(node, value) {
      if (typeof value !== "string") return;
      if (!PERMISSION_SLUG_RE.test(value)) return;

      // Rule is meaningful only when canonical is resolvable. When
      // @rello-platform/permissions is not installed at the consumer
      // layout, treat the rule as a no-op rather than flagging every
      // shape-colliding literal (tag slugs, node module specifiers,
      // Mailgun option keys, etc.).
      if (!slugToKey) return;

      const key = Object.prototype.hasOwnProperty.call(slugToKey, value)
        ? slugToKey[value]
        : undefined;
      if (!key) return; // Shape match but not canonical — not a permission.

      context.report({
        node,
        messageId: "stringPermissionWithKey",
        data: { literal: value, key },
      });
    }

    return {
      Literal(node) {
        checkLiteral(node, node.value);
      },
      // Static template literals (no interpolation) — e.g., `contacts:read`.
      TemplateLiteral(node) {
        if (node.expressions.length !== 0) return;
        if (node.quasis.length !== 1) return;
        const cooked = node.quasis[0].value.cooked;
        checkLiteral(node, cooked);
      },
    };
  },
};

module.exports.PERMISSION_SLUG_RE = PERMISSION_SLUG_RE;
