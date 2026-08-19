module.exports = function (api) {
    // NOT `api.cache(true)`. That tells Babel the config never varies, so the
    // first resolution wins for the lifetime of the cache — and Metro's cache
    // outlives a single command. Prime it with a dev build and a later production
    // build can reuse the dev config, silently shipping every console.log. Keying
    // the cache on NODE_ENV is what makes the branch below actually take effect.
    api.cache.using(() => process.env.NODE_ENV);

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // Strip console.log/warn/debug in production builds for performance and security
            // We keep console.error so crash trackers can still see critical errors
            ...(isProduction
                ? [['transform-remove-console', { exclude: ['error'] }]]
                : []
            ),
        ],
    };
};
