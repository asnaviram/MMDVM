/**
 * Performance Profiling Tools for ESP32 RoIP Server
 * Provides CPU profiling, heap snapshots, and memory leak detection
 */

import v8Profiler from 'v8-profiler-next';
import fs from 'fs';
import path from 'path';

const PROFILES_DIR = path.join(process.cwd(), 'profiles');

// Ensure profiles directory exists
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

/**
 * Start CPU profiling
 * @param {string} name - Profile name
 * @returns {Function} Stop function to end profiling and save results
 */
export function startCPUProfile(name = 'profile') {
  console.log(`[Profiler] Starting CPU profile: ${name}`);
  v8Profiler.startProfiling(name, true);

  return () => {
    console.log(`[Profiler] Stopping CPU profile: ${name}`);
    const profile = v8Profiler.stopProfiling(name);

    return new Promise((resolve, reject) => {
      const filename = `${name}-${Date.now()}.cpuprofile`;
      const filepath = path.join(PROFILES_DIR, filename);

      profile.export((error, result) => {
        if (error) {
          reject(error);
          return;
        }

        fs.writeFileSync(filepath, result);
        profile.delete();

        console.log(`[Profiler] CPU profile saved to: ${filepath}`);
        console.log(`[Profiler] Analyze with: chrome://inspect or speedscope.app`);
        resolve(filepath);
      });
    });
  };
}

/**
 * Take a heap snapshot
 * @param {string} name - Snapshot name
 * @returns {Promise<string>} Path to saved snapshot
 */
export function takeHeapSnapshot(name = 'heap') {
  console.log(`[Profiler] Taking heap snapshot: ${name}`);

  return new Promise((resolve, reject) => {
    const snapshot = v8Profiler.takeSnapshot(name);
    const filename = `${name}-${Date.now()}.heapsnapshot`;
    const filepath = path.join(PROFILES_DIR, filename);

    snapshot.export((error, result) => {
      if (error) {
        reject(error);
        return;
      }

      fs.writeFileSync(filepath, result);
      snapshot.delete();

      const stats = fs.statSync(filepath);
      console.log(`[Profiler] Heap snapshot saved to: ${filepath}`);
      console.log(`[Profiler] Snapshot size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[Profiler] Analyze with Chrome DevTools Memory profiler`);
      resolve(filepath);
    });
  });
}

/**
 * Monitor memory usage over time
 * @param {number} interval - Check interval in milliseconds
 * @param {Function} callback - Called when potential leak detected
 * @returns {Function} Stop function to end monitoring
 */
export function monitorMemory(interval = 60000, callback = null) {
  const snapshots = [];
  let isMonitoring = true;

  console.log(`[Profiler] Starting memory monitoring (interval: ${interval}ms)`);

  const intervalId = setInterval(() => {
    if (!isMonitoring) return;

    const usage = process.memoryUsage();
    const timestamp = Date.now();

    snapshots.push({
      timestamp,
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers
    });

    // Keep only last 100 snapshots
    if (snapshots.length > 100) {
      snapshots.shift();
    }

    // Analyze trend if we have enough data
    if (snapshots.length >= 10) {
      const analysis = analyzeMemoryTrend(snapshots);

      console.log(`[Profiler] Memory Usage:`, {
        heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
        trend: `${(analysis.heapGrowthRate / 1024 / 1024).toFixed(2)} MB/min`
      });

      // Detect potential memory leak
      if (analysis.isPotentialLeak) {
        const warning = {
          type: 'POTENTIAL_MEMORY_LEAK',
          heapGrowthRate: analysis.heapGrowthRate,
          trend: analysis.trend,
          timestamp: new Date().toISOString()
        };

        console.warn('[Profiler] ⚠️  POTENTIAL MEMORY LEAK DETECTED', warning);

        if (callback) {
          callback(warning);
        }

        // Auto-capture heap snapshot
        takeHeapSnapshot(`leak-detection-${Date.now()}`).catch(console.error);
      }
    }
  }, interval);

  // Return stop function
  return () => {
    console.log('[Profiler] Stopping memory monitoring');
    isMonitoring = false;
    clearInterval(intervalId);
    return snapshots;
  };
}

/**
 * Analyze memory trend
 * @param {Array} snapshots - Memory snapshots
 * @returns {Object} Analysis results
 */
function analyzeMemoryTrend(snapshots) {
  if (snapshots.length < 2) {
    return { heapGrowthRate: 0, trend: 'stable', isPotentialLeak: false };
  }

  // Calculate linear regression for heap growth
  const recent = snapshots.slice(-10);
  const n = recent.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  recent.forEach((snapshot, i) => {
    const x = i;
    const y = snapshot.heapUsed;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
  const timeMinutes = timeDiff / 60000;

  // Growth rate in bytes per minute
  const heapGrowthRate = slope * (60000 / (timeDiff / (n - 1)));

  // Determine trend
  let trend = 'stable';
  const thresholdMB = 5; // 5MB per minute is concerning

  if (heapGrowthRate > thresholdMB * 1024 * 1024) {
    trend = 'increasing';
  } else if (heapGrowthRate < -thresholdMB * 1024 * 1024) {
    trend = 'decreasing';
  }

  // Flag as potential leak if growing >10MB/min consistently
  const isPotentialLeak = heapGrowthRate > 10 * 1024 * 1024;

  return {
    heapGrowthRate,
    trend,
    isPotentialLeak,
    timeWindow: timeMinutes
  };
}

/**
 * Calculate trend from snapshots
 * @param {Array} snapshots - Array of memory snapshots
 * @returns {number} Average growth in bytes
 */
function calculateTrend(snapshots) {
  if (snapshots.length < 2) return 0;

  const first = snapshots[0].heapUsed;
  const last = snapshots[snapshots.length - 1].heapUsed;

  return (last - first) / snapshots.length;
}

/**
 * Compare two heap snapshots
 * @param {string} snapshot1Path - Path to first snapshot
 * @param {string} snapshot2Path - Path to second snapshot
 * @returns {Object} Comparison results
 */
export function compareHeapSnapshots(snapshot1Path, snapshot2Path) {
  // This is a placeholder - actual implementation would require
  // heap-snapshot parser library
  console.log(`[Profiler] Comparing snapshots:`);
  console.log(`  Baseline: ${snapshot1Path}`);
  console.log(`  Current: ${snapshot2Path}`);
  console.log(`[Profiler] Use Chrome DevTools to compare snapshots manually`);

  return {
    baseline: snapshot1Path,
    current: snapshot2Path,
    note: 'Use Chrome DevTools Memory profiler for detailed comparison'
  };
}

/**
 * Profile a specific function
 * @param {Function} fn - Function to profile
 * @param {string} name - Profile name
 * @returns {Promise<any>} Function result
 */
export async function profileFunction(fn, name = 'function') {
  const stopCPU = startCPUProfile(name);

  try {
    const result = await fn();
    await stopCPU();
    return result;
  } catch (error) {
    await stopCPU();
    throw error;
  }
}

/**
 * Generate performance report
 * @param {Object} options - Report options
 * @returns {Object} Performance report
 */
export function generatePerformanceReport(options = {}) {
  const usage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const uptime = process.uptime();

  const report = {
    timestamp: new Date().toISOString(),
    uptime: uptime,
    memory: {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      rssMB: (usage.rss / 1024 / 1024).toFixed(2),
      heapUsedMB: (usage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (usage.heapTotal / 1024 / 1024).toFixed(2)
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      userMS: (cpuUsage.user / 1000).toFixed(2),
      systemMS: (cpuUsage.system / 1000).toFixed(2)
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid
    }
  };

  if (options.save) {
    const filename = `performance-report-${Date.now()}.json`;
    const filepath = path.join(PROFILES_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`[Profiler] Performance report saved to: ${filepath}`);
  }

  return report;
}

// Export monitoring instance for easy cleanup
let activeMonitor = null;

export function startAutoMonitoring(interval = 60000) {
  if (activeMonitor) {
    console.warn('[Profiler] Monitoring already active');
    return;
  }

  activeMonitor = monitorMemory(interval, (warning) => {
    // Auto-generate report on leak detection
    generatePerformanceReport({ save: true });
  });

  return activeMonitor;
}

export function stopAutoMonitoring() {
  if (activeMonitor) {
    const snapshots = activeMonitor();
    activeMonitor = null;
    return snapshots;
  }
  return [];
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Profiler] Received SIGINT, cleaning up...');
  stopAutoMonitoring();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Profiler] Received SIGTERM, cleaning up...');
  stopAutoMonitoring();
  process.exit(0);
});
