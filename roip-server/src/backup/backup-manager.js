/**
 * Backup Manager Module
 * Provides programmatic interface for backup operations in Node.js
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

class BackupManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      backupBaseDir: config.backupBaseDir || '/var/backups/roip',
      scriptDir: config.scriptDir || path.join(process.cwd(), '../..', 'scripts'),
      dbType: config.dbType || 'sqlite',
      dbPath: config.dbPath || path.join(process.cwd(), 'data/roip.db'),
      encryption: config.encryption !== false,
      compression: config.compression !== false,
      uploadOffsite: config.uploadOffsite || false,
      retentionDays: config.retentionDays || 14,
      ...config
    };

    this.backupInProgress = false;
    this.lastBackup = null;
    this.backupHistory = [];
  }

  /**
   * Perform a full system backup
   */
  async backupAll(options = {}) {
    if (this.backupInProgress) {
      throw new Error('Backup already in progress');
    }

    this.backupInProgress = true;
    this.emit('backup:start', { type: 'full' });

    try {
      const startTime = Date.now();

      const scriptPath = path.join(this.config.scriptDir, 'backup-all.sh');

      // Build command options
      const opts = [];
      if (this.config.uploadOffsite) opts.push('--upload');
      if (options.parallel !== false) opts.push('--parallel');

      const command = `${scriptPath} ${opts.join(' ')}`;

      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          BACKUP_BASE_DIR: this.config.backupBaseDir
        },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const duration = Date.now() - startTime;

      const backup = {
        id: this.generateBackupId(),
        type: 'full',
        timestamp: new Date(),
        duration,
        size: await this.getBackupSize(),
        status: 'completed',
        output: stdout
      };

      this.lastBackup = backup;
      this.backupHistory.push(backup);

      this.emit('backup:complete', backup);

      return backup;
    } catch (error) {
      this.emit('backup:error', { error: error.message });
      throw new Error(`Backup failed: ${error.message}`);
    } finally {
      this.backupInProgress = false;
    }
  }

  /**
   * Backup database only
   */
  async backupDatabase(options = {}) {
    if (this.backupInProgress) {
      throw new Error('Backup already in progress');
    }

    this.backupInProgress = true;
    this.emit('backup:start', { type: 'database' });

    try {
      const startTime = Date.now();

      const scriptPath = path.join(this.config.scriptDir, 'backup-database.sh');

      const opts = [
        '--db-type', this.config.dbType,
        '--type', options.type || 'full'
      ];

      if (this.config.uploadOffsite) opts.push('--upload');
      if (!this.config.encryption) opts.push('--no-encrypt');
      if (!this.config.compression) opts.push('--no-compress');

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

      const backup = {
        id: this.generateBackupId(),
        type: 'database',
        timestamp: new Date(),
        duration,
        size: await this.getBackupSize('database'),
        status: 'completed',
        output: stdout
      };

      this.lastBackup = backup;
      this.backupHistory.push(backup);

      this.emit('backup:complete', backup);

      return backup;
    } catch (error) {
      this.emit('backup:error', { error: error.message });
      throw new Error(`Database backup failed: ${error.message}`);
    } finally {
      this.backupInProgress = false;
    }
  }

  /**
   * Backup configuration only
   */
  async backupConfig(options = {}) {
    if (this.backupInProgress) {
      throw new Error('Backup already in progress');
    }

    this.backupInProgress = true;
    this.emit('backup:start', { type: 'config' });

    try {
      const startTime = Date.now();

      const scriptPath = path.join(this.config.scriptDir, 'backup-config.sh');

      const opts = [];
      if (options.includeSecrets) opts.push('--include-secrets');
      if (this.config.uploadOffsite) opts.push('--upload');

      const command = `${scriptPath} ${opts.join(' ')}`;

      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          BACKUP_BASE_DIR: this.config.backupBaseDir
        }
      });

      const duration = Date.now() - startTime;

      const backup = {
        id: this.generateBackupId(),
        type: 'config',
        timestamp: new Date(),
        duration,
        size: await this.getBackupSize('config'),
        status: 'completed',
        output: stdout
      };

      this.lastBackup = backup;
      this.backupHistory.push(backup);

      this.emit('backup:complete', backup);

      return backup;
    } catch (error) {
      this.emit('backup:error', { error: error.message });
      throw new Error(`Config backup failed: ${error.message}`);
    } finally {
      this.backupInProgress = false;
    }
  }

  /**
   * Verify backups
   */
  async verifyBackups(mode = 'full') {
    this.emit('verify:start', { mode });

    try {
      const scriptPath = path.join(this.config.scriptDir, 'verify-backups.sh');

      const command = `${scriptPath} --mode ${mode}`;

      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          BACKUP_BASE_DIR: this.config.backupBaseDir
        }
      });

      const result = {
        mode,
        timestamp: new Date(),
        status: 'passed',
        output: stdout
      };

      this.emit('verify:complete', result);

      return result;
    } catch (error) {
      this.emit('verify:error', { error: error.message });
      return {
        mode,
        timestamp: new Date(),
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * List available backups
   */
  async listBackups(type = null) {
    const backupDir = type
      ? path.join(this.config.backupBaseDir, type)
      : this.config.backupBaseDir;

    try {
      const backups = [];

      const types = type ? [type] : ['database', 'config', 'logs', 'firmware', 'certificates'];

      for (const backupType of types) {
        const typeDir = path.join(this.config.backupBaseDir, backupType);

        try {
          const files = await fs.readdir(typeDir);

          for (const file of files) {
            if (file.endsWith('.backup') || file.endsWith('.tar.gz')) {
              const filePath = path.join(typeDir, file);
              const stats = await fs.stat(filePath);

              backups.push({
                type: backupType,
                filename: file,
                path: filePath,
                size: stats.size,
                created: stats.mtime,
                age: Date.now() - stats.mtime.getTime()
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
   * Get backup statistics
   */
  async getBackupStats() {
    const backups = await this.listBackups();

    const stats = {
      total: backups.length,
      byType: {},
      totalSize: 0,
      oldestBackup: null,
      newestBackup: null,
      averageSize: 0
    };

    for (const backup of backups) {
      // Count by type
      if (!stats.byType[backup.type]) {
        stats.byType[backup.type] = { count: 0, size: 0 };
      }
      stats.byType[backup.type].count++;
      stats.byType[backup.type].size += backup.size;

      // Total size
      stats.totalSize += backup.size;

      // Oldest/newest
      if (!stats.oldestBackup || backup.created < stats.oldestBackup.created) {
        stats.oldestBackup = backup;
      }
      if (!stats.newestBackup || backup.created > stats.newestBackup.created) {
        stats.newestBackup = backup;
      }
    }

    stats.averageSize = stats.total > 0 ? stats.totalSize / stats.total : 0;

    return stats;
  }

  /**
   * Delete old backups based on retention policy
   */
  async cleanupOldBackups() {
    this.emit('cleanup:start');

    try {
      const backups = await this.listBackups();
      const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);

      const deletedBackups = [];

      for (const backup of backups) {
        if (backup.created.getTime() < cutoffTime) {
          await fs.unlink(backup.path);

          // Also delete checksum file if exists
          try {
            await fs.unlink(`${backup.path}.sha256`);
          } catch (err) {
            // Ignore if checksum doesn't exist
          }

          deletedBackups.push(backup);
        }
      }

      this.emit('cleanup:complete', { deleted: deletedBackups.length });

      return {
        deleted: deletedBackups.length,
        backups: deletedBackups
      };
    } catch (error) {
      this.emit('cleanup:error', { error: error.message });
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Schedule automated backups
   */
  scheduleBackup(cron, type = 'full', options = {}) {
    // This would integrate with a cron library in production
    // For now, we'll just return the schedule configuration

    const schedule = {
      id: this.generateBackupId(),
      cron,
      type,
      options,
      enabled: true,
      lastRun: null,
      nextRun: null
    };

    this.emit('schedule:created', schedule);

    return schedule;
  }

  /**
   * Generate unique backup ID
   */
  generateBackupId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get total backup size
   */
  async getBackupSize(type = null) {
    const dir = type
      ? path.join(this.config.backupBaseDir, type)
      : this.config.backupBaseDir;

    try {
      const { stdout } = await execAsync(`du -sb ${dir}`);
      const size = parseInt(stdout.split('\t')[0]);
      return size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get backup status
   */
  getStatus() {
    return {
      inProgress: this.backupInProgress,
      lastBackup: this.lastBackup,
      backupHistory: this.backupHistory.slice(-10), // Last 10 backups
      config: {
        backupBaseDir: this.config.backupBaseDir,
        dbType: this.config.dbType,
        encryption: this.config.encryption,
        compression: this.config.compression,
        uploadOffsite: this.config.uploadOffsite,
        retentionDays: this.config.retentionDays
      }
    };
  }
}

export default BackupManager;
