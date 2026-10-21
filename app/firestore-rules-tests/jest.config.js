/**
 * Separate config: these tests talk to the Firestore emulator over the network,
 * so they need a real Node environment and none of the react-native module
 * mapping the app suite installs.
 */
module.exports = {
    rootDir: __dirname,
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/**/*.test.ts'],
    testTimeout: 30_000,
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { esModuleInterop: true, strict: true, skipLibCheck: true } }],
    },
};
