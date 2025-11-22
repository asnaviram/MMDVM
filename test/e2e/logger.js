/**
 * E2E Test Logger
 */

import fs from 'fs';
import path from 'path';

class TestLogger {
  constructor(config) {
    this.config = config;
    this.logs = [];
    this.startTime = new Date();
    this.verbose = config.logging.verbose;

    // Ensure log directory exists
    const logDir = path.dirname(config.logging.file);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const elapsedMs = new Date() - this.startTime;
    const logEntry = {
      timestamp,
      level,
      message,
      elapsedMs,
      data
    };

    this.logs.push(logEntry);

    const logMessage = `[${timestamp}] [${level.toUpperCase()}] (${elapsedMs}ms) ${message}`;
    const fullMessage = data ? `${logMessage} ${JSON.stringify(data)}` : logMessage;

    if (this.verbose || level !== 'debug') {
      console.log(fullMessage);
    }

    // Write to file
    try {
      fs.appendFileSync(this.config.logging.file, fullMessage + '\n');
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  info(message, data) {
    this.log('info', message, data);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  error(message, data) {
    this.log('error', message, data);
  }

  success(message, data) {
    this.log('success', '✓ ' + message, data);
  }

  fail(message, data) {
    this.log('error', '✗ ' + message, data);
  }

  section(title) {
    console.log('\n' + '='.repeat(60));
    console.log(`  ${title}`);
    console.log('='.repeat(60) + '\n');
    this.log('info', `=== ${title} ===`);
  }

  getLogs() {
    return this.logs;
  }

  getDuration() {
    return new Date() - this.startTime;
  }
}

export default TestLogger;
