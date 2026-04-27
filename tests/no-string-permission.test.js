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
// Membership-only fire (v0.2.0): the rule fires iff the literal is a member of
// the canonical SLUG_TO_KEY map exported by @rello-platform/permissions. Shape
// collisions with non-permission namespaces are NOT flagged.
//
// Every canonical-shape literal in the `invalid` array is one that exists in
// @rello-platform/permissions's SLUG_TO_KEY map, because this test runs from
// the plugin repo root with permissions installed as a devDependency. The
// expected messageId is `stringPermissionWithKey`.
//
// The `valid` array includes the false-positive regression surface (tag slugs,
// node module specifiers, Mailgun option keys, etc.) that v0.1.0 fired on with
// stringPermissionNoKey and v0.2.0 must not flag.
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
    // matches the regex AND is in canonical; this test uses an identifier-form
    // key, which is NOT a Literal.
    { code: `const obj = { contacts_read: true };` },

    // --- v0.2.0 false-positive regression surface ---
    // These literals MATCH the regex (lowercase resource, colon, lowercase
    // verb) but are NOT in @rello-platform/permissions's SLUG_TO_KEY. Under
    // v0.1.0 they fired stringPermissionNoKey; under v0.2.0 they must be
    // silent.
    //
    // Node.js module specifiers
    { code: `import { createHash } from "node:crypto";` },
    { code: `import path from "node:path";` },
    { code: `import { test } from "node:test";` },

    // Mailgun option keys (3rd-party API namespacing)
    { code: `const opts = { "o:tag": "newsletter" };` },
    { code: `const opts = { "o:tracking": "yes" };` },
    { code: `const opts = { "o:tracking-opens": "yes" };` },
    { code: `const opts = { "o:tracking-clicks": "yes" };` },

    // Lead/tag slugs — same shape as permissions but a different namespace.
    // Tags live in their own registry; not relevant to permissions canon.
    { code: `const tag = "harvest-home:hot";` },
    { code: `const tag = "harvest-home:warm";` },
    { code: `const tag = "harvest-home:cold";` },
    { code: `const tag = "harvest-home:monitor";` },
    { code: `const tag = "oven:past-client";` },
    { code: `const tag = "source:referral";` },
    { code: `const tag = "ns:unsubscribed";` },
    { code: `const tag = "property:single-family";` },
    { code: `const tag = "property:condo";` },
    { code: `const tag = "property:townhouse";` },
    { code: `const tag = "financing:fha";` },
    { code: `const tag = "financing:conventional";` },
    { code: `const tag = "financing:va";` },
    { code: `const tag = "interest:market-updates";` },
    { code: `const tag = "interest:refinance";` },
    { code: `const tag = "interest:investment";` },

    // RSS / XML namespace keys
    { code: `const ns = "content:encoded";` },
    { code: `const ns = "atom:link";` },
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
// Direct-Linter tests for the membership-only fire semantic and for inline
// disable-comment behavior.
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

test("no-string-permission: regex match WITHOUT canonical membership is silent (v0.2.0 R1)", () => {
  // `imaginary:perm` matches the regex but is not in @rello-platform/permissions's
  // SLUG_TO_KEY map. Under v0.2.0 the rule must NOT fire — membership-only.
  const messages = lintCode(`const x = "imaginary:perm";`);
  assert.strictEqual(
    messages.length,
    0,
    "expected zero diagnostics for non-canonical regex match (v0.2.0 membership-only)",
  );
});

test("no-string-permission: canonical literal still fires withKey", () => {
  const messages = lintCode(`const x = "contacts:read";`);
  assert.strictEqual(messages.length, 1, "expected exactly one diagnostic");
  assert.strictEqual(
    messages[0].messageId,
    "stringPermissionWithKey",
    "expected withKey message for canonical literal",
  );
  assert.match(messages[0].message, /CONTACTS_READ/);
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

test("no-string-permission: false-positive class — node module specifiers are silent", () => {
  const messages = lintCode([
    'import path from "node:path";',
    'import { createHash } from "node:crypto";',
    'import { test } from "node:test";',
  ].join("\n"));
  assert.strictEqual(messages.length, 0, "node: specifiers must not fire under v0.2.0");
});

test("no-string-permission: false-positive class — Mailgun option keys are silent", () => {
  const messages = lintCode(`
    const opts = {
      "o:tag": "newsletter",
      "o:tracking": "yes",
      "o:tracking-opens": "yes",
      "o:tracking-clicks": "yes",
    };
  `);
  assert.strictEqual(messages.length, 0, "o: Mailgun keys must not fire under v0.2.0");
});

test("no-string-permission: false-positive class — tag slugs are silent", () => {
  const messages = lintCode(`
    const tags = [
      "harvest-home:hot",
      "harvest-home:warm",
      "harvest-home:cold",
      "harvest-home:monitor",
      "oven:past-client",
      "source:referral",
      "ns:unsubscribed",
      "property:single-family",
      "financing:fha",
      "interest:market-updates",
    ];
  `);
  assert.strictEqual(messages.length, 0, "tag slugs must not fire under v0.2.0");
});

console.log("all tests passed");
