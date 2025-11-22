/**
 * Migration: Add Performance Indexes
 * Created: 2025-01-01T00:00:02.000Z
 */

/**
 * Run the migration
 */
async function up(database) {
    console.log('Adding performance indexes...');

    // Composite indexes for common queries
    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_call_logs_device_time
        ON call_logs(caller_device_id, started_at DESC);
    `);

    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_user_active
        ON sessions(user_id, ended_at)
        WHERE ended_at IS NULL;
    `);

    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_devices_active
        ON devices(status, last_seen DESC)
        WHERE status = 'online';
    `);

    // JSONB indexes for event metadata
    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_events_metadata
        ON events USING gin(metadata);
    `);

    // Full-text search indexes
    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_users_search
        ON users USING gin(to_tsvector('english',
            coalesce(username, '') || ' ' ||
            coalesce(email, '') || ' ' ||
            coalesce(display_name, '')
        ));
    `);

    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_devices_search
        ON devices USING gin(to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(device_id, '')
        ));
    `);

    console.log('Performance indexes created successfully');
}

/**
 * Reverse the migration
 */
async function down(database) {
    console.log('Dropping performance indexes...');

    await database.query(`DROP INDEX IF EXISTS idx_call_logs_device_time`);
    await database.query(`DROP INDEX IF EXISTS idx_sessions_user_active`);
    await database.query(`DROP INDEX IF EXISTS idx_devices_active`);
    await database.query(`DROP INDEX IF EXISTS idx_events_metadata`);
    await database.query(`DROP INDEX IF EXISTS idx_users_search`);
    await database.query(`DROP INDEX IF EXISTS idx_devices_search`);

    console.log('Performance indexes dropped successfully');
}

module.exports = { up, down };
