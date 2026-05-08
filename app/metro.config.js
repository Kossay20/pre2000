// Polyfill for Node 18 compatibility with newer metro/expo versions
if (!Array.prototype.toReversed) {
    Array.prototype.toReversed = function () {
        return [...this].reverse();
    };
}

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .tflite files as assets
config.resolver.assetExts.push('tflite');

// PHASE 1.1 FIX (E2E audit 2026-05-08): expo-sqlite/web/worker.ts imports
// "./wa-sqlite/wa-sqlite.wasm" which Metro web bundler cannot resolve. The
// failed worker bundle was retried on every request, causing HMR oscillation
// that made E2E testing impossible. Stub the import with an empty module on
// web only — the main app does not currently use SQLite on web (only mobile).
const emptyModule = path.resolve(__dirname, '__mocks__/empty-module.js');
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && moduleName.endsWith('wa-sqlite.wasm')) {
        return { type: 'sourceFile', filePath: emptyModule };
    }
    if (originalResolveRequest) {
        return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
