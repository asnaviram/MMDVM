/**
 * Automated Bottleneck Detection and Analysis
 * Uses clinic.js suite to identify performance bottlenecks
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PROFILES_DIR = path.join(process.cwd(), 'profiles');
const SERVER_PATH = path.join(process.cwd(), 'roip-server', 'src', 'server.js');

// Ensure profiles directory exists
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

/**
 * Run Clinic Doctor - diagnoses performance issues
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} Path to analysis results
 */
async function runClinicDoctor(options = {}) {
  const {
    duration = 60000,  // 1 minute by default
    loadTest = true
  } = options;

  console.log('\n=== Running Clinic Doctor ===\n');
  console.log('Clinic Doctor analyzes event loop, I/O, and CPU patterns');
  console.log(`Duration: ${duration}ms\n`);

  return new Promise((resolve, reject) => {
    const args = [
      'doctor',
      '--on-port', 'node ./test/load-testing/api-load-test.js',
      '--dest', PROFILES_DIR,
      '--',
      SERVER_PATH
    ];

    const clinic = spawn('clinic', args, {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    // Run load test if enabled
    if (loadTest) {
      setTimeout(() => {
        console.log('\nStarting load test...\n');
        runLoadTest('api');
      }, 5000);
    }

    // Stop after duration
    setTimeout(() => {
      console.log('\nStopping profiling...\n');
      clinic.kill('SIGINT');
    }, duration);

    clinic.on('close', (code) => {
      if (code === 0) {
        console.log('\n✓ Clinic Doctor analysis complete');
        console.log(`Results saved to: ${PROFILES_DIR}`);
        resolve(PROFILES_DIR);
      } else {
        reject(new Error(`Clinic Doctor exited with code ${code}`));
      }
    });

    clinic.on('error', reject);
  });
}

/**
 * Run Clinic Bubbleprof - analyzes async operations
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} Path to analysis results
 */
async function runClinicBubbleprof(options = {}) {
  const {
    duration = 60000
  } = options;

  console.log('\n=== Running Clinic Bubbleprof ===\n');
  console.log('Bubbleprof analyzes async operations and delays');
  console.log(`Duration: ${duration}ms\n`);

  return new Promise((resolve, reject) => {
    const args = [
      'bubbleprof',
      '--dest', PROFILES_DIR,
      '--',
      SERVER_PATH
    ];

    const clinic = spawn('clinic', args, {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    setTimeout(() => {
      runLoadTest('api');
    }, 5000);

    setTimeout(() => {
      clinic.kill('SIGINT');
    }, duration);

    clinic.on('close', (code) => {
      if (code === 0) {
        console.log('\n✓ Clinic Bubbleprof analysis complete');
        resolve(PROFILES_DIR);
      } else {
        reject(new Error(`Clinic Bubbleprof exited with code ${code}`));
      }
    });

    clinic.on('error', reject);
  });
}

/**
 * Run Clinic Flame - generates flame graphs
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} Path to analysis results
 */
async function runClinicFlame(options = {}) {
  const {
    duration = 60000
  } = options;

  console.log('\n=== Running Clinic Flame ===\n');
  console.log('Flame generates CPU flame graphs');
  console.log(`Duration: ${duration}ms\n`);

  return new Promise((resolve, reject) => {
    const args = [
      'flame',
      '--dest', PROFILES_DIR,
      '--',
      SERVER_PATH
    ];

    const clinic = spawn('clinic', args, {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    setTimeout(() => {
      runLoadTest('api');
    }, 5000);

    setTimeout(() => {
      clinic.kill('SIGINT');
    }, duration);

    clinic.on('close', (code) => {
      if (code === 0) {
        console.log('\n✓ Clinic Flame analysis complete');
        resolve(PROFILES_DIR);
      } else {
        reject(new Error(`Clinic Flame exited with code ${code}`));
      }
    });

    clinic.on('error', reject);
  });
}

/**
 * Run load test
 * @param {string} type - Test type ('api' or 'call')
 */
function runLoadTest(type = 'api') {
  const testFile = type === 'api'
    ? './test/load-testing/api-load-test.js'
    : './test/load-testing/call-load-test.js';

  console.log(`Running ${type} load test...`);

  const k6 = spawn('k6', ['run', testFile], {
    stdio: 'inherit'
  });

  k6.on('error', (error) => {
    console.warn('Failed to run k6 load test:', error.message);
    console.log('Install k6: https://k6.io/docs/getting-started/installation');
  });
}

/**
 * Analyze Node.js built-in profiler output
 * @param {string} profilePath - Path to .cpuprofile file
 * @returns {Object} Analysis summary
 */
function analyzeCPUProfile(profilePath) {
  console.log(`\n=== Analyzing CPU Profile ===\n`);
  console.log(`Profile: ${profilePath}\n`);

  try {
    const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const { nodes, samples } = profileData;

    // Aggregate function call times
    const functionTimes = new Map();

    nodes.forEach(node => {
      const functionName = node.callFrame.functionName || '(anonymous)';
      const url = node.callFrame.url || 'unknown';
      const key = `${functionName} - ${url}`;

      if (!functionTimes.has(key)) {
        functionTimes.set(key, {
          name: functionName,
          url,
          hitCount: 0,
          selfTime: 0
        });
      }

      const data = functionTimes.get(key);
      data.hitCount += node.hitCount || 0;
    });

    // Sort by hit count
    const hotFunctions = Array.from(functionTimes.values())
      .filter(f => f.hitCount > 0)
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 20);

    console.log('Top 20 Hot Functions:\n');
    hotFunctions.forEach((fn, idx) => {
      console.log(`${idx + 1}. ${fn.name}`);
      console.log(`   URL: ${fn.url}`);
      console.log(`   Hit Count: ${fn.hitCount}`);
      console.log('');
    });

    // Identify bottlenecks
    const bottlenecks = [];
    hotFunctions.slice(0, 5).forEach(fn => {
      bottlenecks.push({
        function: fn.name,
        location: fn.url,
        impact: 'high',
        suggestion: getOptimizationSuggestion(fn.name)
      });
    });

    return {
      profilePath,
      hotFunctions: hotFunctions.slice(0, 10),
      bottlenecks,
      totalSamples: samples?.length || 0
    };

  } catch (error) {
    console.error('Error analyzing profile:', error.message);
    return null;
  }
}

/**
 * Get optimization suggestion based on function name
 * @param {string} functionName - Function name
 * @returns {string} Optimization suggestion
 */
function getOptimizationSuggestion(functionName) {
  const lower = functionName.toLowerCase();

  if (lower.includes('json.parse') || lower.includes('json.stringify')) {
    return 'Consider using faster JSON parsers (e.g., fast-json-stringify) or reducing serialization';
  }

  if (lower.includes('buffer')) {
    return 'Optimize buffer operations, consider buffer pooling';
  }

  if (lower.includes('crypto')) {
    return 'Crypto operations are CPU intensive. Consider caching or async processing';
  }

  if (lower.includes('regex') || lower.includes('match')) {
    return 'Optimize regular expressions or consider alternative string processing';
  }

  if (lower.includes('map') || lower.includes('filter') || lower.includes('reduce')) {
    return 'Consider more efficient data structures or reduce iterations';
  }

  return 'Profile function execution to identify specific optimization opportunities';
}

/**
 * Comprehensive bottleneck analysis
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete analysis report
 */
async function runComprehensiveAnalysis(options = {}) {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   Comprehensive Bottleneck Analysis          ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    analyses: {}
  };

  try {
    // Run Clinic Doctor
    console.log('\n[1/3] Running Clinic Doctor...');
    report.analyses.doctor = await runClinicDoctor(options).catch(e => {
      console.warn('Clinic Doctor failed:', e.message);
      return null;
    });

    // Run Clinic Flame
    console.log('\n[2/3] Running Clinic Flame...');
    report.analyses.flame = await runClinicFlame(options).catch(e => {
      console.warn('Clinic Flame failed:', e.message);
      return null;
    });

    // Run Clinic Bubbleprof
    console.log('\n[3/3] Running Clinic Bubbleprof...');
    report.analyses.bubbleprof = await runClinicBubbleprof(options).catch(e => {
      console.warn('Clinic Bubbleprof failed:', e.message);
      return null;
    });

    // Save report
    const filename = `bottleneck-analysis-${Date.now()}.json`;
    const filepath = path.join(PROFILES_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

    console.log('\n─'.repeat(80));
    console.log(`\n✓ Analysis complete!`);
    console.log(`Report saved to: ${filepath}`);
    console.log(`\nOpen the HTML reports in ${PROFILES_DIR} to view detailed results\n`);

    return report;

  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  const options = {
    duration: 90000  // 90 seconds
  };

  switch(command) {
    case 'doctor':
      runClinicDoctor(options).catch(console.error);
      break;
    case 'flame':
      runClinicFlame(options).catch(console.error);
      break;
    case 'bubbleprof':
      runClinicBubbleprof(options).catch(console.error);
      break;
    case 'all':
      runComprehensiveAnalysis(options).catch(console.error);
      break;
    default:
      console.log('Usage: node find-bottlenecks.js [doctor|flame|bubbleprof|all]');
      process.exit(1);
  }
}

export {
  runClinicDoctor,
  runClinicFlame,
  runClinicBubbleprof,
  analyzeCPUProfile,
  runComprehensiveAnalysis
};
