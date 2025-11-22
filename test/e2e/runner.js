#!/usr/bin/env node
/**
 * E2E Test Runner
 * Executes comprehensive RoIP integration tests
 */

import E2ETestHarness from './test-harness.js';
import config from './config.js';

async function main() {
  try {
    const harness = new E2ETestHarness(config);
    const results = await harness.run();

    // Exit with success code
    process.exit(0);
  } catch (error) {
    console.error('E2E test failed:', error);
    process.exit(1);
  }
}

main();
