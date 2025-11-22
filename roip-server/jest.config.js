/**
 * Jest Configuration for RoIP Server
 * Configured for ES modules and comprehensive test coverage
 */

export default {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.example.js',
    '!src/**/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],
  testMatch: ['**/test/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  transformIgnorePatterns: [],
  injectGlobals: true,
  verbose: true,
  bail: false,
  maxWorkers: '50%',
  testTimeout: 30000
};
