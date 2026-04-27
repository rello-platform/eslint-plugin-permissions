"use strict";

const noStringPermission = require("./lib/rules/no-string-permission");

const plugin = {
  meta: {
    name: "@rello-platform/eslint-plugin-permissions",
    version: require("./package.json").version,
  },
  rules: {
    "no-string-permission": noStringPermission,
  },
  configs: {},
};

plugin.configs.recommended = {
  plugins: { "@rello-platform/permissions": plugin },
  rules: {
    "@rello-platform/permissions/no-string-permission": "error",
  },
};

module.exports = plugin;
module.exports.default = plugin;
