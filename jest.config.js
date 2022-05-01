module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: ['<rootDir>/src/examples'],
  testMatch: ['<rootDir>/src/**/**.test.ts'],
  setupFiles: ['<rootDir>/.jest-setup.js'],
};
