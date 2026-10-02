/**
 * Final-release round 5, content/RTL/chat cluster (C-036, C-044, C-045, E-022).
 * Source-level wiring, like finalReleaseR4WaveA.test.ts: the screens are .tsx and the repo
 * ships no React renderer.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { language: 'en', t: (k: string) => k, changeLanguage: jest.fn() },
}));

import { analyzeMessage } from '../../services/chatbotService';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'];

describe('C-036 — weeks 1-8 do not show a formed fetus', () => {
  // A formed fetus is ~100-150 KB of photographic detail; the month 1-2 stand-ins are simple
  // gradients with one shape, which compress far below that.
  it.each(['month-1.png', 'month-2.png'])('%s is a 600x600 abstract illustration, not a render', (file) => {
    const buf = fs.readFileSync(path.join(root, 'assets/images/baby-3d', file));
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.readUInt32BE(16)).toBe(600);
    expect(buf.readUInt32BE(20)).toBe(600);
    expect(buf.length).toBeLessThan(100 * 1024);
  });
});

describe('C-044 — BabyEvolution development bullets in RTL', () => {
  const src = read('src/screens/BabyEvolutionScreen.tsx');

  it('no longer reverses the row on top of the document direction', () => {
    expect(src).not.toMatch(/row-reverse/);
    expect(src).not.toMatch(/factRowRtl|factBulletRtl/);
  });

  it('spaces bullet and text with a direction-neutral gap', () => {
    expect(src).toMatch(/factRow: \{[^}]*gap: 8/);
  });
});

describe('C-045 — urgent-consult triage says one thing once', () => {
  it('the swelling reply carries the reviewed message without a second recommendation', async () => {
    const r: any = await analyzeMessage('my face is swollen');
    expect(r.type).toBe('red_flag');
    expect(r.redFlag.severity).toBe('urgent_consult');
    expect(r.message).not.toContain('redFlagHigh');
    expect(r.message.split('\n\n')).toHaveLength(1);
  });

  it('the alert block under the bubble titles emergencies only', () => {
    const src = read('src/screens/ChatbotScreen.tsx');
    expect(src).not.toMatch(/redFlagHigh/);
    expect(src).toMatch(/severity === 'emergency' && \(\s*<Text style=\{styles\.alertTitle\}>/);
  });

  it.each(LOCALES)('%s no longer ships the orphaned "discuss with your midwife" key', (lang) => {
    const c = JSON.parse(read(`src/i18n/locales/${lang}/common.json`));
    expect(c.chatResponse.redFlagHigh).toBeUndefined();
  });
});

describe('E-022 — no dead unmountOnBlur', () => {
  it('App.tsx does not set an option bottom-tabs v7 ignores', () => {
    const code = read('App.tsx')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/unmountOnBlur/);
    expect(read('node_modules/@react-navigation/bottom-tabs/src/types.tsx')).not.toMatch(/unmountOnBlur/);
  });
});
