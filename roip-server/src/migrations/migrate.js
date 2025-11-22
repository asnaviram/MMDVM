#!/usr/bin/env node
/**
 * Database Migration System
 * Manages database schema migrations with backup and rollback support
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MigrationManager {
    constructor(database, options = {}) {
        this.database = database;
        this.migrationsDir = options.migrationsDir || __dirname;
        this.backupDir = options.backupDir || '/var/backups/roip/migrations';
        this.tableName = options.tableName || 'schema_migrations';
    }

    /**
     * Initialize migration system
     */
    async initialize() {
        console.log('Initializing migration system...');

        // Create migrations table
        await this.database.query(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                id SERIAL PRIMARY KEY,
                version VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                execution_time INTEGER,
                checksum VARCHAR(64)
            )
        `);

        // Create backup directory
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }

        console.log('Migration system initialized');
    }

    /**
     * Get list of migration files
     */
    async getMigrationFiles() {
        try {
            const files = await fs.readdir(this.migrationsDir);
            return files
                .filter(file => file.match(/^\d{14}_.*\.js$/))
                .sort();
        } catch (error) {
            console.error('Error reading migration files:', error);
            return [];
        }
    }

    /**
     * Get applied migrations
     */
    async getAppliedMigrations() {
        try {
            const result = await this.database.query(
                `SELECT version, name, applied_at FROM ${this.tableName} ORDER BY version`
            );
            return result.rows || [];
        } catch (error) {
            console.error('Error getting applied migrations:', error);
            return [];
        }
    }

    /**
     * Get pending migrations
     */
    async getPendingMigrations() {
        const files = await this.getMigrationFiles();
        const applied = await this.getAppliedMigrations();
        const appliedVersions = new Set(applied.map(m => m.version));

        return files.filter(file => {
            const version = file.split('_')[0];
            return !appliedVersions.has(version);
        });
    }

    /**
     * Create database backup
     */
    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.backupDir, `backup_${timestamp}.sql`);

        console.log(`Creating backup: ${backupFile}`);

        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'roip',
            user: process.env.DB_USER || 'roip'
        };

        try {
            const command = `PGPASSWORD="${process.env.DB_PASSWORD}" pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} ${dbConfig.database} > ${backupFile}`;
            await execAsync(command);
            console.log(`Backup created: ${backupFile}`);
            return backupFile;
        } catch (error) {
            console.error('Backup failed:', error.message);
            throw error;
        }
    }

    /**
     * Calculate file checksum
     */
    async calculateChecksum(filePath) {
        const crypto = require('crypto');
        const content = await fs.readFile(filePath, 'utf8');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Run a single migration
     */
    async runMigration(file, direction = 'up') {
        const version = file.split('_')[0];
        const name = file.replace(/^\d{14}_/, '').replace(/\.js$/, '');
        const filePath = path.join(this.migrationsDir, file);

        console.log(`\nRunning migration: ${file} (${direction})`);

        try {
            // Load migration file
            const migration = require(filePath);

            if (typeof migration[direction] !== 'function') {
                throw new Error(`Migration ${file} does not export ${direction}() function`);
            }

            const startTime = Date.now();

            // Begin transaction
            await this.database.query('BEGIN');

            try {
                // Execute migration
                await migration[direction](this.database);

                // Record migration
                if (direction === 'up') {
                    const checksum = await this.calculateChecksum(filePath);
                    const executionTime = Date.now() - startTime;

                    await this.database.query(
                        `INSERT INTO ${this.tableName} (version, name, execution_time, checksum)
                         VALUES ($1, $2, $3, $4)`,
                        [version, name, executionTime, checksum]
                    );
                } else {
                    await this.database.query(
                        `DELETE FROM ${this.tableName} WHERE version = $1`,
                        [version]
                    );
                }

                // Commit transaction
                await this.database.query('COMMIT');

                const executionTime = Date.now() - startTime;
                console.log(`✓ Migration ${direction}: ${file} (${executionTime}ms)`);

                return { success: true, executionTime };
            } catch (error) {
                // Rollback transaction
                await this.database.query('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error(`✗ Migration failed: ${file}`);
            console.error(error);
            throw error;
        }
    }

    /**
     * Migrate up
     */
    async up(options = {}) {
        console.log('='.repeat(60));
        console.log('Running migrations UP');
        console.log('='.repeat(60));

        await this.initialize();

        // Create backup before migration
        if (options.backup !== false) {
            await this.createBackup();
        }

        const pending = await this.getPendingMigrations();

        if (pending.length === 0) {
            console.log('\nNo pending migrations');
            return;
        }

        console.log(`\nFound ${pending.length} pending migration(s):`);
        pending.forEach(file => console.log(`  - ${file}`));

        // Run migrations
        for (const file of pending) {
            await this.runMigration(file, 'up');

            // Exit on first error if requested
            if (options.stopOnError) {
                break;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('Migrations completed');
        console.log('='.repeat(60));
    }

    /**
     * Migrate down
     */
    async down(options = {}) {
        console.log('='.repeat(60));
        console.log('Rolling back migrations DOWN');
        console.log('='.repeat(60));

        await this.initialize();

        // Create backup before rollback
        if (options.backup !== false) {
            await this.createBackup();
        }

        const applied = await this.getAppliedMigrations();

        if (applied.length === 0) {
            console.log('\nNo migrations to rollback');
            return;
        }

        // Get number of migrations to rollback
        const count = options.count || 1;
        const toRollback = applied.slice(-count).reverse();

        console.log(`\nRolling back ${toRollback.length} migration(s):`);
        toRollback.forEach(m => console.log(`  - ${m.version}_${m.name}`));

        // Get migration files
        const files = await this.getMigrationFiles();
        const fileMap = new Map(files.map(f => [f.split('_')[0], f]));

        // Run rollbacks
        for (const migration of toRollback) {
            const file = fileMap.get(migration.version);
            if (file) {
                await this.runMigration(file, 'down');
            } else {
                console.warn(`Warning: Migration file not found for ${migration.version}`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('Rollback completed');
        console.log('='.repeat(60));
    }

    /**
     * Show migration status
     */
    async status() {
        console.log('='.repeat(60));
        console.log('Migration Status');
        console.log('='.repeat(60));

        await this.initialize();

        const files = await this.getMigrationFiles();
        const applied = await this.getAppliedMigrations();
        const appliedMap = new Map(applied.map(m => [m.version, m]));

        console.log('\nMigrations:\n');
        console.log('Status'.padEnd(10), 'Version'.padEnd(16), 'Name'.padEnd(40), 'Applied At');
        console.log('-'.repeat(100));

        for (const file of files) {
            const version = file.split('_')[0];
            const name = file.replace(/^\d{14}_/, '').replace(/\.js$/, '');
            const migration = appliedMap.get(version);

            if (migration) {
                const appliedAt = new Date(migration.applied_at).toLocaleString();
                console.log('✓ Applied'.padEnd(10), version.padEnd(16), name.padEnd(40), appliedAt);
            } else {
                console.log('○ Pending'.padEnd(10), version.padEnd(16), name.padEnd(40), '-');
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`Total: ${files.length} | Applied: ${applied.length} | Pending: ${files.length - applied.length}`);
        console.log('='.repeat(60));
    }

    /**
     * Create new migration file
     */
    async create(name) {
        const timestamp = new Date().toISOString()
            .replace(/[-:]/g, '')
            .replace(/\..+/, '')
            .split('T')
            .join('');

        const fileName = `${timestamp}_${name.replace(/\s+/g, '_')}.js`;
        const filePath = path.join(this.migrationsDir, fileName);

        const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

/**
 * Run the migration
 */
async function up(database) {
    // Add migration code here
    await database.query(\`
        -- Your SQL here
    \`);
}

/**
 * Reverse the migration
 */
async function down(database) {
    // Add rollback code here
    await database.query(\`
        -- Your rollback SQL here
    \`);
}

module.exports = { up, down };
`;

        await fs.writeFile(filePath, template);
        console.log(`Created migration: ${fileName}`);
        console.log(`Path: ${filePath}`);
    }
}

// CLI interface
if (require.main === module) {
    const Database = require('../database/index');

    async function main() {
        const command = process.argv[2];
        const args = process.argv.slice(3);

        // Initialize database
        const db = new Database({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'roip',
            user: process.env.DB_USER || 'roip',
            password: process.env.DB_PASSWORD || 'roip'
        });

        await db.connect();

        const manager = new MigrationManager(db);

        try {
            switch (command) {
                case 'up':
                    await manager.up({ backup: true });
                    break;

                case 'down':
                    const count = parseInt(args[0]) || 1;
                    await manager.down({ count, backup: true });
                    break;

                case 'status':
                    await manager.status();
                    break;

                case 'create':
                    const name = args.join(' ');
                    if (!name) {
                        console.error('Error: Migration name required');
                        console.log('Usage: node migrate.js create <migration-name>');
                        process.exit(1);
                    }
                    await manager.create(name);
                    break;

                default:
                    console.log('Database Migration Tool\n');
                    console.log('Usage:');
                    console.log('  node migrate.js up              - Run pending migrations');
                    console.log('  node migrate.js down [count]    - Rollback migrations (default: 1)');
                    console.log('  node migrate.js status          - Show migration status');
                    console.log('  node migrate.js create <name>   - Create new migration');
                    console.log('\nExamples:');
                    console.log('  node migrate.js up');
                    console.log('  node migrate.js down 2');
                    console.log('  node migrate.js create add users table');
                    process.exit(command ? 1 : 0);
            }

            await db.disconnect();
            process.exit(0);
        } catch (error) {
            console.error('Error:', error.message);
            await db.disconnect();
            process.exit(1);
        }
    }

    main();
}

module.exports = MigrationManager;
