/**
 * Privacy policy consistency (App Store 5.1.1(i)/(v), Play User Data + deletion policy).
 *
 * The policy exists three times: in-app (privacy.* keys), on the website, and implicitly in
 * the store forms. Each copy drifted on its own before — the in-app text still said
 * "December 2024" and "request deletion", and the website sent people to a Settings row that
 * did not exist. These guards pin the facts that must agree.
 */
import fs from 'fs';
import path from 'path';

const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const APP = path.resolve(__dirname, '..');
const SITE = path.resolve(APP, '..', 'website');

const load = (lang: string, ns: string) =>
  JSON.parse(fs.readFileSync(path.join(APP, 'src', 'i18n', 'locales', lang, `${ns}.json`), 'utf8'));
const site = (file: string) => fs.readFileSync(path.join(SITE, file), 'utf8');
const screen = fs.readFileSync(path.join(APP, 'src', 'screens', 'PrivacyPolicyScreen.tsx'), 'utf8');

const strings = (node: unknown): string[] =>
  typeof node === 'string' ? [node] : Object.values(node as object).flatMap(strings);

// Placeholders PrivacyPolicyScreen supplies: its `paths` object plus the footer year.
const pathsBlock = screen.slice(screen.indexOf('const paths = {'), screen.indexOf('};', screen.indexOf('const paths = {')));
const SUPPLIED = new Set([...pathsBlock.matchAll(/^\s*(\w+):/gm)].map(m => m[1]).concat('year'));

describe('in-app privacy policy', () => {
  it.each(LOCALES)('%s: every placeholder is one the screen supplies', lang => {
    const used = strings(load(lang, 'common').privacy).flatMap(s => [...s.matchAll(/{{(\w+)}}/g)].map(m => m[1]));
    expect(used.filter(v => !SUPPLIED.has(v))).toEqual([]);
  });

  it.each(LOCALES)('%s: dated 2026-09-30, footer year not hardcoded', lang => {
    const p = load(lang, 'common').privacy;
    expect(p.lastUpdated).toMatch(/30/);
    expect(p.lastUpdated).toMatch(/2026/);
    expect(JSON.stringify(p)).not.toMatch(/2024/);
    expect(p.footer).toContain('{{year}}');
  });

  it.each(LOCALES)('%s: deletion is self-service from both entry points, not "on request"', lang => {
    const d = load(lang, 'common').privacy.rights.deletionDesc;
    expect(d).toContain('{{deleteFromProfile}}');
    expect(d).toContain('{{deleteFromSettings}}');
  });

  it.each(LOCALES)('%s: names the processors and the health data it holds', lang => {
    const p = load(lang, 'common').privacy;
    expect(Object.keys(p.processors)).toEqual(
      expect.arrayContaining(['firebase', 'sentry', 'expo', 'fonts']),
    );
    expect(Object.keys(p.collection)).toEqual(
      expect.arrayContaining(['health', 'medical', 'emergency', 'device', 'assistant', 'technical']),
    );
    expect(p.retention.text.length).toBeGreaterThan(0);
  });

  // With Anonymous Auth enabled (a console switch, not a release) a guest's health entries,
  // appointments and reminders are stored in Firestore under her anonymous uid. The guest
  // section and the erase row must be true whether or not that switch is on.
  const DEVICE_ONLY_CLAIMS: Record<(typeof LOCALES)[number], { guest: string; erase: string }> = {
    fr: { guest: 'ne sont pas envoyées à nos serveurs', erase: 'enregistrées sur cet appareil' },
    en: { guest: 'not sent to our servers', erase: 'stored on this device' },
    ar: { guest: 'ولا تُرسل إلى خوادمنا', erase: 'المحفوظة على هذا الجهاز' },
    tn: { guest: 'ما تتبعثش للسيرفرات', erase: 'اللي مسجلة في هالتليفون' },
  };

  it.each(LOCALES)('%s: guest mode does not promise the data never reaches our servers', lang => {
    const c = load(lang, 'common');
    expect(c.privacy.guestMode.text).not.toContain(DEVICE_ONLY_CLAIMS[lang].guest);
    expect(c.privacy.guestMode.text).toContain('{{eraseGuest}}');
    expect(c.privacyData.eraseGuestDataDesc).not.toContain(DEVICE_ONLY_CLAIMS[lang].erase);
  });

  it('uses the contact address the website publishes', () => {
    const email = screen.match(/CONTACT_EMAIL = '([^']+)'/)![1];
    expect(site('privacy.html')).toContain(`mailto:${email}`);
    expect(site('privacy-en.html')).toContain(`mailto:${email}`);
  });
});

describe('website deletion instructions match the app', () => {
  // The labels a reviewer has to find on screen, read from the locale files the app renders.
  const labels = (lang: 'fr' | 'en') => {
    const c = load(lang, 'common');
    const p = load(lang, 'profile');
    const html = (s: string) => s.replace(/&/g, '&amp;');
    return [c.screen.myProfile, c.dangerZone, p.deleteAccount, c.screen.settings, html(c.privacyData.title),
      c.privacyData.deleteAccount, c.privacyData.eraseGuestData].map(String);
  };

  it.each([
    ['fr', 'delete-account.html'],
    ['fr', 'privacy.html'],
    ['en', 'delete-account-en.html'],
    ['en', 'privacy-en.html'],
  ] as const)('%s %s names only rows that exist', (lang, file) => {
    const page = site(file);
    for (const label of labels(lang)) expect({ file, label, found: page.includes(label) }).toEqual({ file, label, found: true });
    // "Réglages" / "Data & Privacy" were the labels of a path that never existed.
    expect(page).not.toMatch(/Réglages|Data &amp; Privacy/);
  });

  it.each(['privacy.html', 'privacy-en.html', 'delete-account.html', 'delete-account-en.html'])(
    '%s does not tell guests their data stays on the phone',
    file => {
      // (The list of features kept only on the phone — kicks, contractions… — may and does say so.)
      expect(site(file)).not.toMatch(/vos données restent sur votre téléphone|your data stays on your phone|data stays on your phone/);
    },
  );

  it.each(['privacy.html', 'privacy-en.html'])('%s is dated 2026-09-30', file => {
    expect(site(file)).toMatch(/30 septembre 2026|September 30, 2026/);
  });

  it.each(['privacy.html', 'privacy-en.html', 'delete-account.html', 'delete-account-en.html'])(
    '%s does not claim assistant conversations are stored',
    file => {
      // The assistant runs on the device and keeps nothing (ChatbotScreen holds messages in state only).
      expect(site(file)).not.toMatch(/Conversations avec l'assistant|Assistant Conversations|conversations avec l'assistant et|assistant conversations and/i);
    },
  );
});
