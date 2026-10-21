/**
 * Production builds must strip `console.log` / `warn` / `debug`.
 *
 * `src/utils/logger.ts` routes app logging through a scoped logger that stays
 * silent outside dev, but nothing stops a stray `console.log` in a component —
 * and in a pregnancy app the values passing through are due dates, weights, blood
 * pressure and symptoms. The babel plugin is the backstop.
 *
 * The subtle part is the cache key. `api.cache(true)` declares the config
 * invariant, so Babel resolves it once and reuses it — and Metro's cache outlives
 * a single command, so a dev build can prime the cache and a later production
 * build silently reuse the dev config, plugin and all. This pins both the branch
 * and the cache key that makes the branch reachable.
 */
const loadBabelConfig = () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../babel.config') as (api: BabelApi) => {
    presets: unknown[];
    plugins: unknown[];
  };

interface BabelApi {
  cache: {
    (forever: boolean): void;
    using: (fn: () => unknown) => void;
    never?: () => void;
    forever?: () => void;
  };
}

/** Minimal stand-in for Babel's config API, recording how the cache was declared. */
const makeApi = () => {
  const calls = { cacheForever: false, usingKeys: [] as unknown[] };
  const cache = ((forever: boolean) => {
    if (forever) calls.cacheForever = true;
  }) as BabelApi['cache'];
  cache.using = (fn: () => unknown) => {
    calls.usingKeys.push(fn());
  };
  return { api: { cache } as BabelApi, calls };
};

const pluginNames = (plugins: unknown[]): string[] =>
  plugins.map((p) => (Array.isArray(p) ? String(p[0]) : String(p)));

describe('babel.config.js', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.resetModules();
    // `process.env.NODE_ENV` is typed non-optional under @types/node, so it
    // cannot be `delete`d directly; go through the index signature.
    if (originalNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('strips console calls in a production build', () => {
    process.env.NODE_ENV = 'production';
    const { api } = makeApi();

    const config = loadBabelConfig()(api);

    expect(pluginNames(config.plugins)).toContain('transform-remove-console');
  });

  it('keeps console.error so crash reporting still sees failures', () => {
    process.env.NODE_ENV = 'production';
    const { api } = makeApi();

    const entry = loadBabelConfig()(api).plugins.find(
      (p) => Array.isArray(p) && p[0] === 'transform-remove-console',
    ) as [string, { exclude: string[] }];

    expect(entry[1].exclude).toContain('error');
  });

  it.each([['development'], ['test'], [undefined]])(
    'leaves console calls alone when NODE_ENV is %s',
    (env) => {
      if (env === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
      else process.env.NODE_ENV = env;
      const { api } = makeApi();

      const config = loadBabelConfig()(api);

      expect(pluginNames(config.plugins)).not.toContain('transform-remove-console');
    },
  );

  it('keys its cache on NODE_ENV instead of declaring itself invariant', () => {
    process.env.NODE_ENV = 'production';
    const { api, calls } = makeApi();

    loadBabelConfig()(api);

    expect(calls.cacheForever).toBe(false);
    expect(calls.usingKeys).toEqual(['production']);
  });

  it('still applies the expo preset', () => {
    process.env.NODE_ENV = 'production';
    const { api } = makeApi();

    expect(loadBabelConfig()(api).presets).toContain('babel-preset-expo');
  });
});
