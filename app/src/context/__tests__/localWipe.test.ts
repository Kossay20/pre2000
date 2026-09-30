/**
 * The local half of an erase (logout, "Reset profile", guest "Erase my data", account
 * deletion) — GDPR Art. 17 on the device.
 *
 * storageKeys.test.ts pins the keys someone remembered to list. This test does not rely on
 * memory: it reads every AsyncStorage write in src/, works out the key each one uses, seeds
 * an in-memory store with all of them, runs wipeLocalUserData and checks that nothing but
 * the device-level preferences below survives. A service that starts persisting a new key
 * fails here until the key is purged or explicitly declared device-level.
 */
import fs from 'fs';
import path from 'path';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
}));
const mockCancelAll = jest.fn(async () => undefined);
jest.mock('../../services/notificationService', () => ({ cancelAllNotifications: () => mockCancelAll() }));
const mockClearCache = jest.fn();
jest.mock('../../services/contentService', () => ({ clearContentCache: () => mockClearCache() }));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));

import { wipeLocalUserData } from '../localWipe';

// Kept on purpose: not personal data, and wiping them would only make the next person on
// this phone redo a device setting.
const DEVICE_LEVEL_KEYS = new Set([
  'app_locale',               // chosen language (LanguageSelectScreen, i18n)
  '@home_welcome_seen_v1',    // first-run welcome already shown on this device (HomeScreen)
  '@notification_primer_dismissed_v1', // notification invitation already shown (notificationPermissionFlow)
]);

const SRC = path.resolve(__dirname, '..', '..');
const DYNAMIC = '<dynamic>';

// Key constants exported by storageKeys.ts are imported by name elsewhere.
const SHARED_CONSTANTS: Record<string, string> = {};
for (const m of fs.readFileSync(path.join(SRC, 'context', 'storageKeys.ts'), 'utf8')
  .matchAll(/export const (\w+)\s*=\s*'([^']+)'/g)) SHARED_CONSTANTS[m[1]] = m[2];

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });

/** Every key written through AsyncStorage in src/, with DYNAMIC standing for a runtime suffix. */
const scanWrittenKeys = (): { keys: Map<string, string>; unresolved: string[] } => {
  const keys = new Map<string, string>(); // key -> file
  const unresolved: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/AsyncStorage\.(setItem|mergeItem|multiSet)\(/.test(text)) continue;
    const rel = path.relative(SRC, file);

    // String constants in this file: `const KEY = '...'` and `NAME: '...'` object members.
    const constants: Record<string, string> = { ...SHARED_CONSTANTS };
    for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*[:=]\s*['"]([^'"\n]+)['"]/g)) constants[m[1]] = m[2];

    const resolveTemplate = (tpl: string) =>
      tpl.replace(/\$\{\s*([^}]+?)\s*\}/g, (_, expr) => (constants[expr] !== undefined ? constants[expr] : DYNAMIC));

    const resolveExpr = (expr: string, depth = 0): string[] => {
      expr = expr.trim();
      let m: RegExpMatchArray | null;
      if ((m = expr.match(/^['"]([^'"]+)['"]$/))) return [m[1]];
      if ((m = expr.match(/^`([^`]*)`$/))) return [resolveTemplate(m[1])];
      if ((m = expr.match(/^\w+\.(\w+)$/)) && constants[m[1]] !== undefined) return [constants[m[1]]];
      if (depth > 2) return [];
      if ((m = expr.match(/^(\w+)\(/))) {
        // A key-builder function: resolve the template literal(s) it returns.
        const def = text.match(new RegExp(`(?:const|function)\\s+${m[1]}\\b[\\s\\S]*?\\n\\}`));
        return def ? [...def[0].matchAll(/`([^`]*)`/g)].map(t => resolveTemplate(t[1])) : [];
      }
      if ((m = expr.match(/^(\w+)$/))) {
        if (constants[m[1]] !== undefined) return [constants[m[1]]];
        // A local: resolve every candidate on its right-hand side (e.g. a ternary).
        const def = text.match(new RegExp(`(?:const|let)\\s+${m[1]}\\s*=([\\s\\S]*?);`));
        if (!def) return [];
        const rhs = def[1];
        const out = [...rhs.matchAll(/`([^`]*)`/g)].map(t => resolveTemplate(t[1]));
        const withoutTemplates = rhs.replace(/`[^`]*`/g, ' ');
        for (const id of withoutTemplates.match(/\b[A-Z][A-Z0-9_]+\b/g) ?? []) {
          if (constants[id] !== undefined) out.push(constants[id]);
        }
        return out;
      }
      return [];
    };

    for (const call of text.matchAll(/AsyncStorage\.(?:setItem|mergeItem)\(\s*([^,]+?)\s*,/g)) {
      const resolved = resolveExpr(call[1]);
      if (resolved.length === 0) unresolved.push(`${rel}: ${call[1]}`);
      for (const k of resolved) keys.set(k, rel);
    }
    if (/AsyncStorage\.multiSet\(/.test(text)) unresolved.push(`${rel}: multiSet (resolve by hand)`);
  }
  return { keys, unresolved };
};

const concrete = (key: string) => key.split(DYNAMIC).join('sample-uid');

describe('wipeLocalUserData covers every key the app writes', () => {
  const { keys, unresolved } = scanWrittenKeys();

  it('resolves every AsyncStorage write in src/ to a key', () => {
    expect(unresolved).toEqual([]);
  });

  it('finds the stores we know about (guards the scanner itself)', () => {
    const found = [...keys.keys()];
    for (const k of [
      'user_profile', 'guestProfile', 'kick_counter_v1', 'contraction_timer_v1', 'hospital_bag_v1',
      'hydration_data_v1', '@bookmarks_v1', '@pending_appointment_draft', '@rdv_reminders',
      '@reminder_settings_v1', 'reminders_v2_settings_guest', 'ttcProfile', 'ramadan_pregnancy_v1',
    ]) {
      expect(found).toContain(k);
    }
    expect(found).toContain(`@weight_entries_${DYNAMIC}`);
    expect(found.some(k => k.startsWith('@daily_checklist_v2_'))).toBe(true);
  });

  it('erases all of them except the declared device-level preferences, and cancels notifications', async () => {
    mockStore.clear();
    for (const k of keys.keys()) mockStore.set(concrete(k), 'x');
    for (const k of DEVICE_LEVEL_KEYS) mockStore.set(k, 'x');

    await wipeLocalUserData();

    const survivors = [...mockStore.keys()].filter(k => !DEVICE_LEVEL_KEYS.has(k));
    expect(survivors.map(k => `${k} (${keys.get(k) ?? '?'})`)).toEqual([]);
    for (const k of DEVICE_LEVEL_KEYS) expect(mockStore.has(k)).toBe(true);
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    expect(mockClearCache).toHaveBeenCalledTimes(1);
  });

  it('still erases the storage when cancelling notifications fails', async () => {
    mockStore.clear();
    mockStore.set('kick_counter_v1', 'x');
    mockCancelAll.mockRejectedValueOnce(new Error('native module missing'));
    await wipeLocalUserData();
    expect(mockStore.has('kick_counter_v1')).toBe(false);
  });
});

// Every place that erases the device must go through the one function above.
describe('AuthContext delegates the local erase to wipeLocalUserData', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'AuthContext.tsx'), 'utf8');
  const block = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

  it.each([
    ['logout', 'const logout', 'const updateProfile'],
    ['resetProfile', 'const resetProfile', 'const clearLocalStateAfterDeletion'],
    ['account deletion', 'const clearLocalStateAfterDeletion', 'const deleteAccount'],
  ])('%s', (_name, from, to) => {
    expect(block(from, to)).toMatch(/await\s+wipeLocalUserData\(\)/);
  });
});
