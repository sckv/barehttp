module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts'],
  testMatch: ['**/__tests__/**/*.test.ts'],
};
