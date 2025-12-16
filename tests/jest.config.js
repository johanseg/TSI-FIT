module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/..'],
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@tsi-fit-score/shared$': '<rootDir>/../shared/src',
    '^@tsi-fit-score/shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
  collectCoverageFrom: [
    'worker/src/**/*.ts',
    'api/src/**/*.ts',
    'shared/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
};

