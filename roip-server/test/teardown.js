/**
 * Global Test Teardown
 * Runs once after all tests complete
 * Performs cleanup and resource deallocation
 */

import fs from 'fs';
import { join } from 'path';

/**
 * Teardown function that runs after all tests
 */
export default async function globalTeardown() {
  console.log('\n🧹 Running global test teardown...\n');

  // Clean up test databases
  const testDbFiles = [
    '/tmp/test_roip_schema.db',
    '/tmp/test_roip_crud.db',
    '/tmp/test_roip_queries.db',
    '/tmp/test_roip_migs.db',
    '/tmp/test_roip_perf.db',
    './test-roip.db',
    './test-roip.db-shm',
    './test-roip.db-wal'
  ];

  for (const dbFile of testDbFiles) {
    try {
      if (fs.existsSync(dbFile)) {
        fs.unlinkSync(dbFile);
        console.log(`✓ Cleaned up test database: ${dbFile}`);
      }
    } catch (error) {
      console.warn(`⚠ Could not delete ${dbFile}: ${error.message}`);
    }
  }

  // Clean up test data directories (optional - keep coverage reports)
  const cleanupDirs = [
    join(process.cwd(), 'test-data')
  ];

  for (const dir of cleanupDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`✓ Cleaned up directory: ${dir}`);
      }
    } catch (error) {
      console.warn(`⚠ Could not delete ${dir}: ${error.message}`);
    }
  }

  // Clean up test log files
  const testLogFiles = [
    join(process.cwd(), 'logs', 'test.log')
  ];

  for (const logFile of testLogFiles) {
    try {
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
        console.log(`✓ Cleaned up log file: ${logFile}`);
      }
    } catch (error) {
      console.warn(`⚠ Could not delete ${logFile}: ${error.message}`);
    }
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('✓ Forced garbage collection');
  }

  console.log('\n✅ Global test teardown completed\n');
}
