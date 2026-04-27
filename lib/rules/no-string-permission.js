"use strict";

/**
 * @fileoverview Flags string-literal permission slugs in Rello-ecosystem source.
 *
 * Canonical permissions live in `@rello-platform/permissions`. The `PermissionSlug`
 * type guards code that flows through typed signatures, but it cannot catch string
 * literals that bypass the type system: untyped map keys, JSON config, request
 * bodies, picker option values constructed from raw strings, etc.
 *
 * This rule matches every Literal whose whole-string value matches the canonical
 * permission shape `<resource>:<verb>` (e.g. `contacts:read`, `flows:write`,
 * `suppression:lift`). When the consumer has `@rello-platform/permissions`
 * installed, the rule looks up the canonical PermissionKey via the package's
 * `SLUG_TO_KEY` export and surfaces it in the error message so the fix is
 * mechanical: replace `"contacts:read"` with `PERMISSIONS.CONTACTS_READ.slug`.
 *
 * The regex `/^[a-z][a-z-]*:[a-z][a-z-]+$/` is conservative on purpose — it
 * matches the actual canonical slug shape (lowercase + hyphens; single colon;
 * non-empty resource and verb segments) and skips URLs (`https://...`),
 * key:value JSON in error messages (`"foo: bar"` has a space), CSS pseudo
 * selectors (uppercase), etc.
 *
 * Disable comments are accepted via standard ESLint mechanics. The
 * `--reason` prefix convention is enforced separately by
 * `eslint-plugin-eslint-comments/require-description` if the consumer
 * configures it; this rule does not enforce or require it on its own.
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
    // is installed at a layout we cannot resolve from cwd). The rule still
    // fires on the regex match — only the suggested-key lookup is skipped.
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
      stringPermissionNoKey:
        "String-literal permission '{{literal}}' — use the canonical PERMISSIONS constant from @rello-platform/permissions (or remove it if no longer canonical).",
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

      const key = slugToKey
        ? Object.prototype.hasOwnProperty.call(slugToKey, value)
          ? slugToKey[value]
          : undefined
        : undefined;

      if (key) {
        context.report({
          node,
          messageId: "stringPermissionWithKey",
          data: { literal: value, key },
        });
      } else {
        context.report({
          node,
          messageId: "stringPermissionNoKey",
          data: { literal: value },
        });
      }
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
