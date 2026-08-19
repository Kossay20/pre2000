module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
        '^.+\\.js$': 'babel-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    moduleNameMapper: {
        '^react-native$': 'react-native-web',
    },
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/e2e/',
        '/scripts/',
        // Needs a JVM and a running Firestore emulator — `npm run test:rules`.
        '/firestore-rules-tests/',
    ],
    globals: {
        __DEV__: true,
    },
};
