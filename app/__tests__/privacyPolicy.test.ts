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

  // Kick sessions, contractions and the hospital bag sync to the account of a signed-in
  // user (trackerSync.ts); a guest's stay on the phone until she creates one. The policy
  // used to list them as never leaving the phone.
  const SYNCED_TRACKERS: Record<(typeof LOCALES)[number], string[]> = {
    fr: ['mouvements du bébé', 'contractions', 'valise de maternité'],
    en: ['baby movements', 'contractions', 'hospital bag'],
    ar: ['حركات الجنين', 'الانقباضات', 'حقيبة الولادة'],
    tn: ['حركات البيبي', 'الانقباضات', 'شنطة الولادة'],
  };

  it.each(LOCALES)('%s: synced trackers are health data, not "kept only on your phone"', lang => {
    const p = load(lang, 'common').privacy;
    for (const term of SYNCED_TRACKERS[lang]) {
      expect({ term, inDeviceOnly: p.collection.deviceDesc.includes(term) }).toEqual({ term, inDeviceOnly: false });
      expect({ term, inHealth: p.collection.healthDesc.includes(term) }).toEqual({ term, inHealth: true });
      // Guests: the policy says these wait on the phone for an account.
      expect({ term, inGuest: p.guestMode.text.toLowerCase().includes(term) }).toEqual({ term, inGuest: true });
    }
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
      // (The list of features kept only on the phone — hydration, saved articles… — may and does say so.)
      expect(site(file)).not.toMatch(/vos données restent sur votre téléphone|your data stays on your phone|data stays on your phone/);
    },
  );

  it.each([
    ['privacy.html', /Données gardées uniquement sur votre téléphone[^<]*<\/strong>([^<]*)/, ['mouvements du bébé', 'contractions', 'valise']],
    ['privacy-en.html', /Kept only on your phone:<\/strong>([^<]*)/, ['baby movements', 'contractions', 'hospital bag']],
    ['delete-account.html', /Tout ce qui est gardé sur votre téléphone :([^<]*)/, ['mouvements du bébé', 'contractions', 'valise']],
    ['delete-account-en.html', /Everything kept on your phone:([^<]*)/, ['baby movements', 'contractions', 'hospital bag']],
  ] as const)('%s does not list the synced trackers as phone-only', (file, re, terms) => {
    // Kick sessions, contractions and the hospital bag sync to the account (trackerSync.ts).
    const list = site(file).match(re);
    expect(list).not.toBeNull();
    for (const term of terms) expect({ file, term, phoneOnly: list![1].includes(term) }).toEqual({ file, term, phoneOnly: false });
  });

  // The in-app policy states the legal basis for health data (explicit consent, with the
  // date and policy version recorded) and how to withdraw it. The public page is the URL
  // both consoles hold, and it said neither (GDPR art. 13(1)(c), 13(2)(c)).
  const pageText = (file: string) =>
    site(file).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&rarr;/g, '→').replace(/\s+/g, ' ');
  const section = (file: string, from: RegExp, to: RegExp) => {
    const text = pageText(file);
    const start = text.search(from);
    const end = text.slice(start + 1).search(to) + start + 1;
    expect({ file, found: start > -1 && end > start }).toEqual({ file, found: true });
    return text.slice(start, end);
  };

  it.each([
    ['fr', 'privacy.html'],
    ['en', 'privacy-en.html'],
  ] as const)('%s %s states the explicit-consent basis in the in-app words', (lang, file) => {
    const consent: string = load(lang, 'common').privacy.usage.consent;
    expect(pageText(file).toLowerCase()).toContain(consent.toLowerCase());
  });

  it.each([
    ['fr', 'privacy.html', /Retrait du consentement/, /Par email/],
    ['en', 'privacy-en.html', /Withdrawing consent/, /By email/],
  ] as const)('%s %s says how to withdraw that consent, with and without an account', (lang, file, from, to) => {
    const c = load(lang, 'common');
    const withdraw = section(file, from, to);
    for (const label of [c.privacyData.deleteAccount, c.privacyData.eraseGuestData, c.medicalProfile.settingsTitle]) {
      expect({ file, label, found: withdraw.includes(label) }).toEqual({ file, label, found: true });
    }
  });

  it.each([
    ['fr', 'privacy.html', /6\. Durée de Conservation/, /7\. Vos Droits/, 'identifiant anonyme'],
    ['en', 'privacy-en.html', /6\. Retention/, /7\. Your Rights/, 'anonymous identifier'],
  ] as const)('%s %s says how long guest data stays on the servers, without inventing a period', (lang, file, from, to, anon) => {
    // With Anonymous Auth on, a guest's entries sit in Firestore under an anonymous uid
    // until "Erase my data"; nothing deletes them automatically today. The period is the
    // owner's decision (RELEASE_READINESS §4, 5 ter) — the page states what happens now
    // and carries no placeholder number.
    const retention = section(file, from, to);
    expect(retention).toContain(anon);
    expect(retention).toContain(load(lang, 'common').privacyData.eraseGuestData);
    expect(retention).not.toMatch(/(?:\d+|\bN)\s*(?:jours|days|mois|months|semaines|weeks)|TODO|XX|\[/);
  });

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
