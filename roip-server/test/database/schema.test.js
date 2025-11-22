/**
 * Database Schema Tests
 * Tests table creation, indexes, and constraints
 */
import { DatabaseModule } from '../../src/database/database.js';
import fs from 'fs';

const TEST_DB = '/tmp/test_roip_schema.db';

describe('Database Schema Tests', () => {
  let db;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new DatabaseModule({ type: 'sqlite', sqlite: { filename: TEST_DB } });
    await db.initialize();
  });

  afterAll(async () => {
    await db?.closeConnection();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test('all tables should exist', () => {
    const result = db.db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get();
    expect(result.cnt).toBe(5);
  });

  test('users table should have required columns', () => {
    const info = db.db.pragma('table_info(users)');
    const names = info.map(c => c.name);
    expect(names).toContain('id');
    expect(names).toContain('username');
    expect(names).toContain('email');
  });

  test('indexes should be created', () => {
    const result = db.db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").get();
    expect(result.cnt).toBeGreaterThan(5);
  });

  test('foreign keys should be enforced', () => {
    const result = db.db.pragma('foreign_keys');
    expect(result[0].foreign_keys).toBe(1);
  });
});
