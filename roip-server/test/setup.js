/**
 * Global Test Setup
 * Runs once before all tests
 * Loads environment variables and performs global test initialization
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Setup function that runs before all tests
 */
export default async function globalSetup() {
  console.log('\n🔧 Running global test setup...\n');

  // Load test environment variables
  const envPath = join(__dirname, '.env.test');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('✓ Loaded test environment variables from .env.test');
  } else {
    console.warn('⚠ Warning: .env.test not found, using defaults');
  }

  // Set NODE_ENV to test if not already set
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
  }

  // Ensure JWT_SECRET is set for tests
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'sMJRViY5CsmsVQKFKWGOwrvGmNCvqaXEiKu+kGYF8wg=';
    console.log('✓ Set default JWT_SECRET for tests');
  }

  // Create test directories
  const testDirs = [
    join(process.cwd(), 'logs'),
    join(process.cwd(), 'test-data'),
    join(process.cwd(), 'coverage')
  ];

  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✓ Created directory: ${dir}`);
    }
  }

  // Clean up old test databases
  const testDbFiles = [
    '/tmp/test_roip_schema.db',
    '/tmp/test_roip_crud.db',
    '/tmp/test_roip_queries.db',
    '/tmp/test_roip_migs.db',
    '/tmp/test_roip_perf.db'
  ];

  for (const dbFile of testDbFiles) {
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
      console.log(`✓ Cleaned up old test database: ${dbFile}`);
    }
  }

  // Set test-specific timeouts
  if (!process.env.TEST_TIMEOUT) {
    process.env.TEST_TIMEOUT = '30000';
  }

  // Suppress console logs during tests (optional)
  if (process.env.SUPPRESS_TEST_LOGS === 'true') {
    global.console.log = jest.fn();
    global.console.info = jest.fn();
    global.console.debug = jest.fn();
  }

  console.log('\n✅ Global test setup completed\n');
}
