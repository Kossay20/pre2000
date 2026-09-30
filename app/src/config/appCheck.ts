/**
 * Metro resolves `appCheck.web` / `appCheck.native` at bundle time.
 * This barrel exists so TypeScript can resolve `./appCheck`.
 */
export { bridgeAppCheck } from './appCheck.native';
