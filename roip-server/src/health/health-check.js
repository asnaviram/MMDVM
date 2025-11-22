/**
 * Health Check System
 * Provides comprehensive health monitoring endpoints
 */

const os = require('os');
const { performance } = require('perf_hooks');

class HealthCheck {
    constructor(database, cache) {
        this.database = database;
        this.cache = cache;
        this.startTime = Date.now();
        this.startupComplete = false;
        this.healthChecks = new Map();
        this.dependencies = new Map();

        // Register default health checks
        this.registerHealthCheck('database', this.checkDatabase.bind(this));
        this.registerHealthCheck('cache', this.checkCache.bind(this));
        this.registerHealthCheck('memory', this.checkMemory.bind(this));
        this.registerHealthCheck('disk', this.checkDisk.bind(this));
    }

    /**
     * Register a health check function
     */
    registerHealthCheck(name, checkFunction) {
        this.healthChecks.set(name, checkFunction);
    }

    /**
     * Register a dependency
     */
    registerDependency(name, checkFunction) {
        this.dependencies.set(name, checkFunction);
    }

    /**
     * Mark startup as complete
     */
    markStartupComplete() {
        this.startupComplete = true;
    }

    /**
     * Basic health endpoint
     * GET /health
     */
    async getHealth() {
        const uptime = Date.now() - this.startTime;
        const uptimeSeconds = Math.floor(uptime / 1000);

        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: uptimeSeconds,
            version: process.env.APP_VERSION || '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
    }

    /**
     * Readiness probe
     * GET /health/ready
     * Indicates if the service is ready to receive traffic
     */
    async getReadiness() {
        const checks = {};
        let ready = true;

        // Check all dependencies
        for (const [name, checkFn] of this.dependencies.entries()) {
            try {
                const result = await checkFn();
                checks[name] = {
                    status: result ? 'ready' : 'not_ready',
                    ready: result
                };
                if (!result) ready = false;
            } catch (error) {
                checks[name] = {
                    status: 'error',
                    ready: false,
                    error: error.message
                };
                ready = false;
            }
        }

        // Check startup completion
        if (!this.startupComplete) {
            ready = false;
        }

        return {
            ready,
            startup_complete: this.startupComplete,
            checks,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Liveness probe
     * GET /health/live
     * Indicates if the service is alive and should not be restarted
     */
    async getLiveness() {
        try {
            // Perform lightweight checks
            const memoryUsage = process.memoryUsage();
            const heapUsed = memoryUsage.heapUsed / memoryUsage.heapTotal;

            // Service is alive if:
            // 1. Process is running (implicit)
            // 2. Memory is not critically high
            // 3. Event loop is not blocked
            const alive = heapUsed < 0.95; // 95% threshold

            if (!alive) {
                return {
                    alive: false,
                    reason: 'memory_critical',
                    heap_used_percent: (heapUsed * 100).toFixed(2),
                    timestamp: new Date().toISOString()
                };
            }

            return {
                alive: true,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                alive: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Startup probe
     * GET /health/startup
     * Indicates if the application has finished starting up
     */
    async getStartup() {
        return {
            started: this.startupComplete,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Detailed health endpoint
     * GET /health/detailed
     * Provides comprehensive health information
     */
    async getDetailedHealth() {
        const checks = {};
        let overall = 'healthy';

        // Run all health checks
        for (const [name, checkFn] of this.healthChecks.entries()) {
            try {
                const result = await checkFn();
                checks[name] = result;
                if (result.status !== 'healthy') {
                    overall = 'degraded';
                }
            } catch (error) {
                checks[name] = {
                    status: 'unhealthy',
                    error: error.message
                };
                overall = 'unhealthy';
            }
        }

        // System metrics
        const systemMetrics = this.getSystemMetrics();
        const processMetrics = this.getProcessMetrics();

        return {
            status: overall,
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            version: process.env.APP_VERSION || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            checks,
            system: systemMetrics,
            process: processMetrics
        };
    }

    /**
     * Check database health
     */
    async checkDatabase() {
        if (!this.database) {
            return {
                status: 'not_configured',
                message: 'Database not configured'
            };
        }

        try {
            const start = performance.now();
            await this.database.query('SELECT 1');
            const duration = performance.now() - start;

            return {
                status: 'healthy',
                response_time: `${duration.toFixed(2)}ms`,
                pool: this.database.pool ? {
                    total: this.database.pool.totalCount,
                    idle: this.database.pool.idleCount,
                    waiting: this.database.pool.waitingCount
                } : null
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Check cache health
     */
    async checkCache() {
        if (!this.cache) {
            return {
                status: 'not_configured',
                message: 'Cache not configured'
            };
        }

        try {
            const start = performance.now();
            const testKey = '__health_check__';
            await this.cache.set(testKey, 'test', 1);
            const value = await this.cache.get(testKey);
            const duration = performance.now() - start;

            if (value === 'test') {
                return {
                    status: 'healthy',
                    response_time: `${duration.toFixed(2)}ms`
                };
            } else {
                return {
                    status: 'unhealthy',
                    error: 'Cache read/write test failed'
                };
            }
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Check memory health
     */
    async checkMemory() {
        const memoryUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryPercent = (usedMemory / totalMemory) * 100;

        const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

        let status = 'healthy';
        if (heapUsedPercent > 90 || memoryPercent > 90) {
            status = 'critical';
        } else if (heapUsedPercent > 75 || memoryPercent > 75) {
            status = 'warning';
        }

        return {
            status,
            heap_used: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            heap_total: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
            heap_used_percent: `${heapUsedPercent.toFixed(2)}%`,
            rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
            system_memory_used_percent: `${memoryPercent.toFixed(2)}%`,
            system_free: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
            system_total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`
        };
    }

    /**
     * Check disk health
     */
    async checkDisk() {
        // Note: This is a simplified check
        // In production, use a library like 'diskusage' for accurate disk space checking
        return {
            status: 'healthy',
            message: 'Disk check not implemented (requires diskusage library)'
        };
    }

    /**
     * Get system metrics
     */
    getSystemMetrics() {
        const cpus = os.cpus();
        const loadAverage = os.loadavg();

        return {
            platform: os.platform(),
            arch: os.arch(),
            cpus: cpus.length,
            load_average: {
                '1m': loadAverage[0].toFixed(2),
                '5m': loadAverage[1].toFixed(2),
                '15m': loadAverage[2].toFixed(2)
            },
            total_memory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            free_memory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`
        };
    }

    /**
     * Get process metrics
     */
    getProcessMetrics() {
        const memoryUsage = process.memoryUsage();
        const uptime = Date.now() - this.startTime;

        return {
            pid: process.pid,
            node_version: process.version,
            uptime: `${Math.floor(uptime / 1000)}s`,
            memory: {
                rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
                heap_total: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                heap_used: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`
            },
            cpu_usage: process.cpuUsage()
        };
    }

    /**
     * Express middleware for health endpoints
     */
    middleware() {
        return async (req, res, next) => {
            try {
                const path = req.path;

                switch (path) {
                    case '/health':
                        const health = await this.getHealth();
                        return res.status(200).json(health);

                    case '/health/ready':
                        const readiness = await this.getReadiness();
                        const readyStatus = readiness.ready ? 200 : 503;
                        return res.status(readyStatus).json(readiness);

                    case '/health/live':
                        const liveness = await this.getLiveness();
                        const liveStatus = liveness.alive ? 200 : 503;
                        return res.status(liveStatus).json(liveness);

                    case '/health/startup':
                        const startup = await this.getStartup();
                        const startupStatus = startup.started ? 200 : 503;
                        return res.status(startupStatus).json(startup);

                    case '/health/detailed':
                        const detailed = await this.getDetailedHealth();
                        const detailedStatus = detailed.status === 'healthy' ? 200 :
                                              detailed.status === 'degraded' ? 200 : 503;
                        return res.status(detailedStatus).json(detailed);

                    default:
                        next();
                }
            } catch (error) {
                console.error('Health check error:', error);
                res.status(503).json({
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        };
    }
}

module.exports = HealthCheck;
