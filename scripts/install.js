/**
 * gridge-harness install
 *
 * Alias for `init` — invoked by `npm run install-harness` in consumer projects.
 * Provides a convenient entry point without requiring `npx gridge-harness init`.
 *
 * Usage (in consumer project):
 *   npm run install-harness          -- interactive
 *   npm run install-harness -- --yes -- non-interactive
 *
 * Refs: scripts/init.js
 */

'use strict';

const path = require('path');

// init.js 재사용 — require 하면 즉시 main() 실행됨
require(path.join(__dirname, 'init.js'));
