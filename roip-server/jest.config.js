/**
 * Jest Configuration for RoIP Server
 * Configured for ES modules and comprehensive test coverage
 */

export default {
  testEnvironment: 'node',

  // Global setup and teardown
  globalSetup: './test/setup.js',
  globalTeardown: './test/teardown.js',

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.example.js',
    '!src/**/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov', 'json'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Test configuration
  testMatch: ['**/test/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],

  // Module resolution
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  transformIgnorePatterns: [],

  // Global settings
  injectGlobals: false,
  verbose: true,
  bail: false,
  maxWorkers: '50%',
  testTimeout: 30000,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: false
};
