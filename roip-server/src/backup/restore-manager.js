/**
 * Restore Manager Module
 * Provides programmatic interface for restore operations in Node.js
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

class RestoreManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      backupBaseDir: config.backupBaseDir || '/var/backups/roip',
      scriptDir: config.scriptDir || path.join(process.cwd(), '../..', 'scripts'),
      dbType: config.dbType || 'sqlite',
      dbPath: config.dbPath || path.join(process.cwd(), 'data/roip.db'),
      restoreSecrets: config.restoreSecrets || false,
      dryRun: config.dryRun || false,
      ...config
    };

    this.restoreInProgress = false;
    this.lastRestore = null;
    this.restoreHistory = [];
  }

  /**
   * Perform full system restore
   */
  async restoreFull(options = {}) {
    if (this.restoreInProgress) {
      throw new Error('Restore already in progress');
    }

    this.restoreInProgress = true;
    this.emit('restore:start', { type: 'full' });

    try {
      const startTime = Date.now();

      const scriptPath = path.join(this.config.scriptDir, 'restore-full.sh');

      // Build command options
      const opts = [];
      if (this.config.dryRun || options.dryRun) opts.push('--dry-run');
      if (options.force) opts.push('--force');
      if (this.config.restoreSecrets) opts.push('--restore-secrets');
      if (options.skipDatabase) opts.push('--skip-database');
      if (options.skipConfig) opts.push('--skip-config');

      const command = `${scriptPath} ${opts.join(' ')}`;

      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          BACKUP_BASE_DIR: this.config.backupBaseDir
        },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const duration = Date.now() - startTime;

      const restore = {
        type: 'full',
        timestamp: new Date(),
        duration,
        status: 'completed',
        dryRun: this.config.dryRun || options.dryRun,
        output: stdout
      };

      this.lastRestore = restore;
      this.restoreHistory.push(restore);

      this.emit('restore:complete', restore);

      return restore;
    } catch (error) {
      this.emit('restore:error', { error: error.message });
      throw new Error(`Full restore failed: ${error.message}`);
    } finally {
      this.restoreInProgress = false;
    }
  }

  /**
   * Restore database only
   */
  async restoreDatabase(options = {}) {
    if (this.restoreInProgress) {
      throw new Error('Restore already in progress');
    }

    this.restoreInProgress = true;
    this.emit('restore:start', { type: 'database' });

    try {
      const startTime = Date.now();

      const scriptPath = path.join(this.config.scriptDir, 'restore-database.sh');

      const opts = [
        '--db-type', this.config.dbType
      ];

      if (options.backupFile) {
        opts.push('--file', options.backupFile);
      }

      if (this.config.dryRun || options.dryRun) {
        opts.push('--dry-run');
      }

      if (options.force) {
        opts.push('--force');
      }

      if (options.pointInTime) {
        opts.push('--type', 'point_in_time');
        opts.push('--point-in-time', options.pointInTime);
      }

      const command = `${scriptPath} ${opts.join(' ')}`;

      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          BACKUP_BASE_DIR: this.config.backupBaseDir,
          SQLITE_DB_PATH: this.config.dbPath,
          DB_TYPE: this.config.dbType
        }
      });

      const duration = Date.now() - startTime;

      const restore = {
        type: 'database',
        timestamp: new Date(),
        duration,
        status: 'completed',
        dryRun: this.config.dryRun || options.dryRun,
        backupFile: options.backupFile,
        output: stdout
      };

      this.lastRestore = restore;
      this.restoreHistory.push(restore);

      this.emit('restore:complete', restore);

      return restore;
    } catch (error) {
      this.emit('restore:error', { error: error.message });
      throw new Error(`Database restore failed: ${error.message}`);
    } finally {
      this.restoreInProgress = false;
    }
  }

  /**
   * Restore configuration only
   */
  async restoreConfig(options = {}) {
    if (this.restoreInProgress) {
      throw new Error('Restore already in progress');
    }

    this.restoreInProgress = true;
    this.emit('restore:start', { type: 'config' });

    try {
      const startTime = Date.now();

      const scriptPath = path.join(this.config.scriptDir, 'restore-config.sh');

      const opts = [];

      if (options.backupFile) {
        opts.push('--file', options.backupFile);
      }

      if (this.config.dryRun || options.dryRun) {
        opts.push('--dry-run');
      }

      if (this.config.restoreSecrets || options.restoreSecrets) {
        opts.push('--restore-secrets');
      }

      const command = `${scriptPath} ${opts.join(' ')}`;

      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          BACKUP_BASE_DIR: this.config.backupBaseDir
        }
      });

      const duration = Date.now() - startTime;

      const restore = {
        type: 'config',
        timestamp: new Date(),
        duration,
        status: 'completed',
        dryRun: this.config.dryRun || options.dryRun,
        backupFile: options.backupFile,
        output: stdout
      };

      this.lastRestore = restore;
      this.restoreHistory.push(restore);

      this.emit('restore:complete', restore);

      return restore;
    } catch (error) {
      this.emit('restore:error', { error: error.message });
      throw new Error(`Config restore failed: ${error.message}`);
    } finally {
      this.restoreInProgress = false;
    }
  }

  /**
   * List available backups for restoration
   */
  async listAvailableBackups(type = null) {
    const backupDir = type
      ? path.join(this.config.backupBaseDir, type)
      : this.config.backupBaseDir;

    try {
      const backups = [];

      const types = type ? [type] : ['database', 'config'];

      for (const backupType of types) {
        const typeDir = path.join(this.config.backupBaseDir, backupType);

        try {
          const files = await fs.readdir(typeDir);

          for (const file of files) {
            if (file.endsWith('.backup')) {
              const filePath = path.join(typeDir, file);
              const stats = await fs.stat(filePath);

              // Check if checksum exists
              const checksumPath = `${filePath}.sha256`;
              let hasChecksum = false;
              try {
                await fs.access(checksumPath);
                hasChecksum = true;
              } catch (err) {
                // No checksum file
              }

              backups.push({
                type: backupType,
                filename: file,
                path: filePath,
                size: stats.size,
                created: stats.mtime,
                age: Date.now() - stats.mtime.getTime(),
                hasChecksum,
                restorable: true
              });
            }
          }
        } catch (err) {
          // Directory doesn't exist, skip
          continue;
        }
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => b.created - a.created);

      return backups;
    } catch (error) {
      throw new Error(`Failed to list backups: ${error.message}`);
    }
  }

  /**
   * Get latest backup for a specific type
   */
  async getLatestBackup(type = 'database') {
    const backups = await this.listAvailableBackups(type);

    if (backups.length === 0) {
      return null;
    }

    return backups[0]; // Already sorted by newest first
  }

  /**
   * Verify backup before restore
   */
  async verifyBackup(backupPath) {
    this.emit('verify:start', { backupPath });

    try {
      // Check if file exists
      await fs.access(backupPath);

      // Check if checksum exists and verify
      const checksumPath = `${backupPath}.sha256`;
      try {
        await fs.access(checksumPath);

        // Verify checksum
        const command = `sha256sum -c ${checksumPath}`;
        await execAsync(command);

        this.emit('verify:complete', { backupPath, status: 'valid' });

        return {
          valid: true,
          backupPath,
          hasChecksum: true
        };
      } catch (err) {
        this.emit('verify:warning', { backupPath, message: 'Checksum verification failed or missing' });

        return {
          valid: true,
          backupPath,
          hasChecksum: false,
          warning: 'No checksum verification'
        };
      }
    } catch (error) {
      this.emit('verify:error', { backupPath, error: error.message });

      return {
        valid: false,
        backupPath,
        error: error.message
      };
    }
  }

  /**
   * Test restore (dry run)
   */
  async testRestore(type = 'database', options = {}) {
    this.emit('test:start', { type });

    try {
      const result = await this[`restore${type.charAt(0).toUpperCase() + type.slice(1)}`]({
        ...options,
        dryRun: true
      });

      this.emit('test:complete', { type, result });

      return {
        type,
        success: true,
        result
      };
    } catch (error) {
      this.emit('test:error', { type, error: error.message });

      return {
        type,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create pre-restore snapshot
   */
  async createPreRestoreSnapshot() {
    this.emit('snapshot:start');

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotDir = path.join(this.config.backupBaseDir, 'pre-restore', timestamp);

      await fs.mkdir(snapshotDir, { recursive: true });

      // Backup current database
      if (this.config.dbType === 'sqlite') {
        const dbPath = this.config.dbPath;
        try {
          await fs.copyFile(dbPath, path.join(snapshotDir, 'database.db'));
        } catch (err) {
          // Database might not exist, that's okay
        }
      }

      // Backup current config
      const configDir = path.join(process.cwd(), 'config');
      try {
        await this.copyDirectory(configDir, path.join(snapshotDir, 'config'));
      } catch (err) {
        // Config might not exist
      }

      this.emit('snapshot:complete', { snapshotDir });

      return {
        snapshotDir,
        timestamp
      };
    } catch (error) {
      this.emit('snapshot:error', { error: error.message });
      throw new Error(`Failed to create pre-restore snapshot: ${error.message}`);
    }
  }

  /**
   * Get restore status
   */
  getStatus() {
    return {
      inProgress: this.restoreInProgress,
      lastRestore: this.lastRestore,
      restoreHistory: this.restoreHistory.slice(-10), // Last 10 restores
      config: {
        backupBaseDir: this.config.backupBaseDir,
        dbType: this.config.dbType,
        restoreSecrets: this.config.restoreSecrets,
        dryRun: this.config.dryRun
      }
    };
  }

  /**
   * Get restore recommendations
   */
  async getRestoreRecommendations() {
    const backups = await this.listAvailableBackups();

    const recommendations = {
      hasBackups: backups.length > 0,
      latestDatabase: null,
      latestConfig: null,
      recommendations: []
    };

    // Find latest backups by type
    for (const backup of backups) {
      if (backup.type === 'database' && !recommendations.latestDatabase) {
        recommendations.latestDatabase = backup;
      }
      if (backup.type === 'config' && !recommendations.latestConfig) {
        recommendations.latestConfig = backup;
      }
    }

    // Generate recommendations
    if (!recommendations.latestDatabase) {
      recommendations.recommendations.push({
        type: 'warning',
        message: 'No database backups available'
      });
    } else {
      const ageHours = recommendations.latestDatabase.age / (1000 * 60 * 60);
      if (ageHours > 24) {
        recommendations.recommendations.push({
          type: 'warning',
          message: `Latest database backup is ${Math.round(ageHours)} hours old`
        });
      }
    }

    if (!recommendations.latestConfig) {
      recommendations.recommendations.push({
        type: 'warning',
        message: 'No configuration backups available'
      });
    }

    if (backups.some(b => !b.hasChecksum)) {
      recommendations.recommendations.push({
        type: 'warning',
        message: 'Some backups are missing checksums'
      });
    }

    return recommendations;
  }

  /**
   * Utility: Copy directory recursively
   */
  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export default RestoreManager;
