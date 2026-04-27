"use strict";

const { RuleTester, Linter } = require("eslint");
const { test } = require("node:test");
const assert = require("node:assert");

const rule = require("../lib/rules/no-string-permission");
const plugin = require("../index.js");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

// ---------------------------------------------------------------------------
// RuleTester suite — positive (rule fires) + negative (rule passes).
//
// Every canonical-shape literal under test (e.g. `contacts:read`, `flows:write`)
// is one that exists in @rello-platform/permissions@v0.1.0's SLUG_TO_KEY map,
// because this test runs from the plugin repo root with permissions installed
// as a devDependency. The expected messageId is therefore `stringPermissionWithKey`.
//
// For the not-in-canonical regex-only path, see the dedicated `node:test` block
// below — RuleTester does not have an easy way to mock the resolver per-case.
// ---------------------------------------------------------------------------

tester.run("no-string-permission", rule, {
  valid: [
    // --- Non-permission strings (regex must not match) ---
    // URLs
    { code: `const x = "https://example.com";` },
    { code: `const x = "http://localhost:3000/api";` },

    // Prose with embedded colons (whitespace breaks the match)
    { code: `const msg = "error: failed to load";` },
    { code: `const msg = "key: value";` },

    // Single-segment (no colon)
    { code: `const x = "contacts";` },
    { code: `const x = "flows";` },

    // Multi-colon (more than one ':')
    { code: `const x = "a:b:c";` },

    // Empty resource segment
    { code: `const x = ":read";` },

    // Empty verb segment
    { code: `const x = "contacts:";` },

    // Uppercase-containing — canonical is lowercase + hyphens only
    { code: `const x = "Contacts:Read";` },
    { code: `const x = "CONTACTS:READ";` },
    { code: `const x = "contacts:Read";` },

    // Underscores — canonical uses hyphens, not underscores
    { code: `const x = "contacts_read:write";` },
    { code: `const x = "contacts:read_only";` },

    // Numbers — regex requires a-z start
    { code: `const x = "1contacts:read";` },
    { code: `const x = "contacts:1read";` },

    // Identifiers / function names — not Literal nodes
    { code: `import contacts_read from "./x";` },
    { code: `const contacts = 1;` },
    { code: `function flows() {}` },

    // Numbers and regex literals — not strings
    { code: `const n = 123;` },
    { code: `const re = /contacts:read/;` },

    // Comments — not Literal nodes
    {
      code: `
        // The contacts:read permission gates this endpoint.
        const guarded = true;
      `,
    },

    // Template literal with interpolation — skipped as runtime-constructed
    { code: "const x = `${resource}:read`;" },
    { code: "const x = `contacts:${verb}`;" },

    // Object key (not value) — Literal as a property key still triggers if it
    // matches the regex; this is intentional. The "valid" line below tests an
    // identifier-form key, which is NOT a Literal.
    { code: `const obj = { contacts_read: true };` },
  ],

  invalid: [
    // --- Canonical-shape literals (resolved against installed permissions) ---
    {
      code: `const x = "contacts:read";`,
      errors: [
        {
          messageId: "stringPermissionWithKey",
          data: { literal: "contacts:read", key: "CONTACTS_READ" },
        },
      ],
    },
    {
      code: `const x = "contacts:write";`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },
    {
      code: `const x = 'flows:create';`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },
    {
      code: `const x = 'flows:manage';`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },
    {
      code: `const x = "events:write";`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },
    {
      code: `const x = "leads:read";`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },
    {
      code: `const x = "leads:write";`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },

    // Hyphenated resource segment
    {
      code: `const x = "subject-preferences:read";`,
      errors: [
        {
          messageId: "stringPermissionWithKey",
          data: { literal: "subject-preferences:read", key: "SUBJECT_PREFERENCES_READ" },
        },
      ],
    },

    // Hyphenated verb segment
    {
      code: `const x = "flows:read-milo-managed";`,
      errors: [
        {
          messageId: "stringPermissionWithKey",
          data: {
            literal: "flows:read-milo-managed",
            key: "FLOWS_READ_MILO_MANAGED",
          },
        },
      ],
    },

    // Function argument
    {
      code: `requireServiceBearer(req, "contacts:read");`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },

    // Object property value
    {
      code: `const config = { permission: "flows:create" };`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },

    // JSX attribute value
    {
      code: `const el = <Gate permission="leads:read" />;`,
      errors: [{ messageId: "stringPermissionWithKey" }],
    },

    // Static template literal (no interpolation)
    {
      code: "const x = `contacts:read`;",
      errors: [{ messageId: "stringPermissionWithKey" }],
    },

    // Array of literals
    {
      code: `const perms = ["contacts:read", "events:write"];`,
      errors: [
        { messageId: "stringPermissionWithKey" },
        { messageId: "stringPermissionWithKey" },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Direct-Linter tests for the regex-only path (canonical lookup miss) and
// for inline disable-comment behavior.
//
// RuleTester intentionally cannot easily test disable-comment suppression
// (disables are processed by Linter, not by the rule itself). These tests
// use Linter.verify directly to assert end-to-end behavior, which is the
// same pathway a consumer's `npx eslint .` follows.
// ---------------------------------------------------------------------------

function lintCode(code) {
  const linter = new Linter();
  return linter.verify(code, {
    plugins: { "@rello-platform/permissions": plugin },
    rules: { "@rello-platform/permissions/no-string-permission": "error" },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  });
}

test("no-string-permission: regex match for non-canonical slug uses noKey message", () => {
  // `imaginary:perm` matches the regex but is not in @rello-platform/permissions's
  // SLUG_TO_KEY map, so the noKey branch fires.
  const messages = lintCode(`const x = "imaginary:perm";`);
  assert.strictEqual(messages.length, 1, "expected exactly one diagnostic");
  assert.strictEqual(
    messages[0].messageId,
    "stringPermissionNoKey",
    "expected noKey message for slug not in canonical",
  );
  assert.match(
    messages[0].message,
    /imaginary:perm/,
    "diagnostic should quote the offending literal",
  );
});

test("no-string-permission: inline eslint-disable-next-line suppresses the diagnostic", () => {
  const code = [
    "// eslint-disable-next-line @rello-platform/permissions/no-string-permission -- legacy migration script",
    'const x = "contacts:read";',
  ].join("\n");
  const messages = lintCode(code);
  assert.strictEqual(
    messages.length,
    0,
    "expected the disable comment to suppress the diagnostic",
  );
});

test("no-string-permission: disable-line without rationale also suppresses (rationale is a separate plugin's concern)", () => {
  const code = [
    "// eslint-disable-next-line @rello-platform/permissions/no-string-permission",
    'const x = "contacts:read";',
  ].join("\n");
  const messages = lintCode(code);
  assert.strictEqual(
    messages.length,
    0,
    "expected the bare disable comment to suppress the diagnostic; require-description is enforced by eslint-plugin-eslint-comments, not this rule",
  );
});

test("no-string-permission: block-disable suppresses for the wrapped range", () => {
  const code = [
    "/* eslint-disable @rello-platform/permissions/no-string-permission -- audit log section */",
    'const a = "contacts:read";',
    'const b = "events:write";',
    "/* eslint-enable @rello-platform/permissions/no-string-permission */",
    'const c = "leads:read";',
  ].join("\n");
  const messages = lintCode(code);
  assert.strictEqual(
    messages.length,
    1,
    "expected only the post-enable literal `leads:read` to fire",
  );
  assert.match(messages[0].message, /leads:read/);
});

console.log("all tests passed");
