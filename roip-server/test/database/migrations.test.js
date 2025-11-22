/**
 * Database Migrations Tests
 */
import { DatabaseModule } from '../../src/database/database.js';
import fs from 'fs';

const TEST_DB = '/tmp/test_roip_migs.db';

describe('Database Migrations', () => {
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

  test('database should be initialized', () => {
    expect(db.isInitialized).toBe(true);
  });

  test('database file should exist', () => {
    expect(fs.existsSync(TEST_DB)).toBe(true);
  });

  test('WAL mode should be enabled', () => {
    const result = db.db.pragma('journal_mode');
    expect(result[0].journal_mode).toBe('wal');
  });

  test('integrity check should pass', () => {
    const result = db.db.pragma('integrity_check');
    expect(result[0].integrity_check).toBe('ok');
  });

  test('CRUD should work after migration', async () => {
    const user = await db.createUser({
      username: 'migtest',
      email: 'mig@test.com',
      password_hash: 'hash'
    });
    expect(user.id).toBeDefined();
  });
});
