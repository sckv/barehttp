module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^callsites$': '<rootDir>/src/__tests__/__mocks__/callsites.cjs',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: ['<rootDir>/src/examples'],
  testMatch: ['<rootDir>/src/**/**.test.ts'],
  setupFiles: ['<rootDir>/.jest-setup.js'],
};
