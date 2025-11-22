/**
 * Database Query Analysis and Optimization Tool
 * Analyzes slow queries and suggests performance improvements
 */

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'roip',
  user: process.env.DB_USER || 'roip_user',
  password: process.env.DB_PASSWORD || 'roip_password',
  max: 5
};

const pool = new Pool(dbConfig);

/**
 * Enable query statistics collection
 */
async function enableQueryStats() {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
    console.log('✓ pg_stat_statements extension enabled');
  } catch (error) {
    console.error('Failed to enable pg_stat_statements:', error.message);
    console.error('Add to postgresql.conf: shared_preload_libraries = \'pg_stat_statements\'');
  }
}

/**
 * Analyze slow queries
 * @param {Object} options - Analysis options
 * @returns {Promise<Array>} Slow queries with analysis
 */
async function analyzeSlowQueries(options = {}) {
  const {
    minMeanTime = 100,  // Queries with mean time > 100ms
    limit = 20
  } = options;

  console.log('\n=== Analyzing Slow Queries ===\n');

  try {
    const result = await pool.query(`
      SELECT
        queryid,
        LEFT(query, 200) as query_preview,
        calls,
        total_exec_time,
        mean_exec_time,
        min_exec_time,
        max_exec_time,
        stddev_exec_time,
        rows,
        100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) AS cache_hit_ratio
      FROM pg_stat_statements
      WHERE mean_exec_time > $1
      ORDER BY total_exec_time DESC
      LIMIT $2
    `, [minMeanTime, limit]);

    const slowQueries = result.rows;

    console.log(`Found ${slowQueries.length} slow queries:\n`);

    const analysis = [];

    for (const query of slowQueries) {
      console.log('─'.repeat(80));
      console.log(`Query ID: ${query.queryid}`);
      console.log(`Preview: ${query.query_preview}...`);
      console.log(`\nStatistics:`);
      console.log(`  Calls: ${query.calls}`);
      console.log(`  Total Time: ${query.total_exec_time.toFixed(2)}ms`);
      console.log(`  Mean Time: ${query.mean_exec_time.toFixed(2)}ms`);
      console.log(`  Max Time: ${query.max_exec_time.toFixed(2)}ms`);
      console.log(`  Cache Hit Ratio: ${query.cache_hit_ratio?.toFixed(2) || 'N/A'}%`);

      // Suggest optimizations
      const suggestions = suggestOptimizations(query);
      if (suggestions.length > 0) {
        console.log(`\nSuggestions:`);
        suggestions.forEach((s, i) => {
          console.log(`  ${i + 1}. ${s}`);
        });
      }

      analysis.push({
        query: query.query_preview,
        stats: {
          calls: query.calls,
          totalTime: query.total_exec_time,
          meanTime: query.mean_exec_time,
          maxTime: query.max_exec_time,
          cacheHitRatio: query.cache_hit_ratio
        },
        suggestions
      });

      console.log('');
    }

    return analysis;

  } catch (error) {
    console.error('Error analyzing queries:', error.message);
    return [];
  }
}

/**
 * Suggest query optimizations
 * @param {Object} query - Query statistics
 * @returns {Array<string>} Optimization suggestions
 */
function suggestOptimizations(query) {
  const suggestions = [];

  // Check cache hit ratio
  if (query.cache_hit_ratio !== null && query.cache_hit_ratio < 90) {
    suggestions.push(`Low cache hit ratio (${query.cache_hit_ratio.toFixed(2)}%). Consider increasing shared_buffers or optimizing query.`);
  }

  // High variance suggests inconsistent performance
  if (query.stddev_exec_time > query.mean_exec_time * 0.5) {
    suggestions.push('High execution time variance. Check for missing indexes or table bloat.');
  }

  // High frequency, high cost queries
  if (query.calls > 1000 && query.mean_exec_time > 50) {
    suggestions.push('Frequently executed slow query. Prime candidate for optimization.');
  }

  // Suggest index analysis
  const queryLower = query.query_preview.toLowerCase();
  if (queryLower.includes('where') || queryLower.includes('join')) {
    suggestions.push('Analyze query execution plan (EXPLAIN ANALYZE) to identify missing indexes.');
  }

  // Check for SELECT *
  if (queryLower.includes('select *')) {
    suggestions.push('Avoid SELECT *. Specify only needed columns to reduce data transfer.');
  }

  // Check for N+1 queries
  if (query.calls > 100 && query.mean_exec_time < 10) {
    suggestions.push('Possible N+1 query pattern. Consider batch loading or query consolidation.');
  }

  return suggestions;
}

/**
 * Find missing indexes
 * @returns {Promise<Array>} Suggested indexes
 */
async function findMissingIndexes() {
  console.log('\n=== Finding Missing Indexes ===\n');

  try {
    const result = await pool.query(`
      SELECT
        schemaname,
        tablename,
        seq_scan,
        seq_tup_read,
        idx_scan,
        seq_tup_read / seq_scan as avg_seq_read,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS table_size
      FROM pg_stat_user_tables
      WHERE seq_scan > 0
        AND (idx_scan IS NULL OR seq_scan > idx_scan)
      ORDER BY seq_tup_read DESC
      LIMIT 10
    `);

    console.log('Tables with high sequential scans (may need indexes):\n');

    result.rows.forEach(table => {
      console.log(`Table: ${table.schemaname}.${table.tablename}`);
      console.log(`  Size: ${table.table_size}`);
      console.log(`  Sequential Scans: ${table.seq_scan}`);
      console.log(`  Index Scans: ${table.idx_scan || 0}`);
      console.log(`  Avg Rows per Seq Scan: ${table.avg_seq_read?.toFixed(0) || 'N/A'}`);
      console.log('');
    });

    return result.rows;

  } catch (error) {
    console.error('Error finding missing indexes:', error.message);
    return [];
  }
}

/**
 * Analyze table statistics
 * @returns {Promise<Array>} Table statistics
 */
async function analyzeTableStats() {
  console.log('\n=== Table Statistics ===\n');

  try {
    const result = await pool.query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        CASE
          WHEN n_live_tup > 0
          THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2)
          ELSE 0
        END as dead_row_percent
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);

    result.rows.forEach(table => {
      console.log(`Table: ${table.schemaname}.${table.tablename}`);
      console.log(`  Total Size: ${table.total_size}`);
      console.log(`  Table Size: ${table.table_size}`);
      console.log(`  Index Size: ${table.index_size}`);
      console.log(`  Live Rows: ${table.live_rows}`);
      console.log(`  Dead Rows: ${table.dead_rows} (${table.dead_row_percent}%)`);
      console.log(`  Operations: ${table.inserts} inserts, ${table.updates} updates, ${table.deletes} deletes`);

      if (table.dead_row_percent > 20) {
        console.log(`  ⚠️  High dead row percentage. Consider VACUUM ANALYZE.`);
      }
      console.log('');
    });

    return result.rows;

  } catch (error) {
    console.error('Error analyzing table stats:', error.message);
    return [];
  }
}

/**
 * Analyze index usage
 * @returns {Promise<Array>} Index usage statistics
 */
async function analyzeIndexUsage() {
  console.log('\n=== Index Usage Analysis ===\n');

  try {
    const result = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
      LIMIT 15
    `);

    console.log('Unused or rarely used indexes:\n');

    result.rows.forEach(index => {
      console.log(`Index: ${index.indexname}`);
      console.log(`  Table: ${index.schemaname}.${index.tablename}`);
      console.log(`  Size: ${index.index_size}`);
      console.log(`  Scans: ${index.idx_scan}`);

      if (index.idx_scan === 0) {
        console.log(`  ⚠️  UNUSED - Consider dropping this index`);
      } else if (index.idx_scan < 10) {
        console.log(`  ⚠️  Rarely used - Evaluate if needed`);
      }
      console.log('');
    });

    return result.rows;

  } catch (error) {
    console.error('Error analyzing index usage:', error.message);
    return [];
  }
}

/**
 * Generate optimization report
 * @returns {Promise<Object>} Complete analysis report
 */
async function generateOptimizationReport() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   Database Query Optimization Report        ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    database: dbConfig.database,
    slowQueries: [],
    missingIndexes: [],
    tableStats: [],
    indexUsage: []
  };

  try {
    await enableQueryStats();

    report.slowQueries = await analyzeSlowQueries({ minMeanTime: 50, limit: 20 });
    report.missingIndexes = await findMissingIndexes();
    report.tableStats = await analyzeTableStats();
    report.indexUsage = await analyzeIndexUsage();

    // Save report
    const reportDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const filename = `db-optimization-report-${Date.now()}.json`;
    const filepath = path.join(reportDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

    console.log('\n─'.repeat(80));
    console.log(`\n✓ Report saved to: ${filepath}\n`);

    return report;

  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run analysis if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateOptimizationReport()
    .then(() => {
      console.log('Analysis complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Analysis failed:', error);
      process.exit(1);
    });
}

export {
  analyzeSlowQueries,
  findMissingIndexes,
  analyzeTableStats,
  analyzeIndexUsage,
  generateOptimizationReport
};
