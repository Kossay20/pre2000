/**
 * Guest mode must survive Anonymous Auth being switched on.
 *
 * This is the one behaviour in the app that flips on an *operator* action rather
 * than a release: enabling Anonymous Auth in the Firebase console. Every audit so
 * far ran with it off, so the configuration the app will actually ship into has
 * never been exercised. These tests stand in for that.
 *
 * The bug being pinned: `isGuest` was `!isAuthenticated`. With Anonymous Auth on,
 * `signInAnonymously` succeeds, so someone who tapped "Continue as guest" got
 * `isGuest: false` — hiding every "create an account" prompt (Profile, Calendar,
 * Add appointment, Tasks) at the exact moment they matter, and making the
 * anonymous-link branch of `upgradeGuest` unreachable.
 */
import fs from 'fs';
import path from 'path';
import { deriveIsGuest, hasPermanentAccount } from '../accountMode';

describe('hasPermanentAccount', () => {
  it('is false with no session at all — Anonymous Auth off, local guest fallback', () => {
    expect(hasPermanentAccount(null)).toBe(false);
    expect(hasPermanentAccount(undefined)).toBe(false);
  });

  it('is false for an anonymous session — Anonymous Auth on', () => {
    expect(hasPermanentAccount({ uid: 'AbC123realFirebaseUid', isAnonymous: true })).toBe(false);
  });

  it('is true for a registered account', () => {
    expect(hasPermanentAccount({ uid: 'AbC123realFirebaseUid', isAnonymous: false })).toBe(true);
  });

  it('treats a missing isAnonymous as a permanent account', () => {
    // Firebase always sets the field; a caller passing a partial object is more
    // likely to be a real user object than an anonymous one.
    expect(hasPermanentAccount({ uid: 'AbC123realFirebaseUid' })).toBe(true);
  });
});

describe('deriveIsGuest', () => {
  it.each([
    ['no session (Anonymous Auth off)', null, true],
    ['anonymous session (Anonymous Auth on)', { uid: 'anon-uid', isAnonymous: true }, true],
    ['registered account', { uid: 'real-uid', isAnonymous: false }, false],
  ])('%s → isGuest %s', (_label, identity, expected) => {
    expect(deriveIsGuest(identity as never)).toBe(expected);
  });

  it('gives the SAME answer in both Firebase configurations for a guest', () => {
    // The whole point: flipping the console setting must not change who is a guest.
    const anonymousAuthOff = deriveIsGuest(null);
    const anonymousAuthOn = deriveIsGuest({ uid: 'anon-uid', isAnonymous: true });
    expect(anonymousAuthOn).toBe(anonymousAuthOff);
    expect(anonymousAuthOn).toBe(true);
  });
});

describe('AuthContext wiring', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'AuthContext.tsx'),
    'utf8',
  );

  it('derives isGuest through the predicate, never from `!isAuthenticated`', () => {
    expect(source).toContain('isGuest: deriveIsGuest(effectiveUser)');
    expect(source).not.toContain('isGuest: !isAuthenticated');
  });

  it('will not adopt a stored profile into a permanent account for an anonymous session', () => {
    // The re-onboarding guard reads userProfiles/<uid> and, on a hit, adopts it
    // with `isGuest: false`. Gated on merely being authenticated, that would
    // re-introduce the bug one layer down.
    const guard = source.indexOf('W1 #3 — re-onboarding data-loss guard');
    expect(guard).toBeGreaterThan(-1);
    const preceding = source.slice(Math.max(0, guard - 600), guard);
    expect(preceding).toContain('hasPermanentAccount(effectiveUser)');
  });

  it('will not migrate local guest data to Firestore for an anonymous session', () => {
    const migration = source.indexOf('Guest → auth migration after onboarding signup');
    expect(migration).toBeGreaterThan(-1);
    const preceding = source.slice(Math.max(0, migration - 700), migration);
    expect(preceding).toContain('hasPermanentAccount(effectiveUser)');
  });

  it('keeps the anonymous-link branch of upgradeGuest, which this makes reachable again', () => {
    expect(source).toContain('current.isAnonymous');
    expect(source).toContain('linkWithCredential');
  });
});

describe('the guest privacy claim holds in both configurations', () => {
  const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;

  const bundle = (locale: string, name: string) =>
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'i18n', 'locales', locale, `${name}.json`),
        'utf8',
      ),
    );

  it.each(LOCALES)('%s no longer promises local-only storage', (locale) => {
    // "Your data is saved locally only" is a claim about the storage medium, and
    // it stops being reliably true once a guest is backed by an anonymous session.
    // Both stores' privacy declarations are held to what the app tells the user,
    // so the claim is now about the ACCOUNT, which is true either way.
    const claims = [bundle(locale, 'profile').guestData, bundle(locale, 'common').profile.guestData];

    for (const claim of claims) {
      expect(typeof claim).toBe('string');
      expect(claim.length).toBeGreaterThan(0);
      expect(claim).not.toMatch(/localement|locally|محلي/i);
    }
  });

  it.each(LOCALES)('%s still tells the guest they have no account', (locale) => {
    const claim: string = bundle(locale, 'profile').guestData;
    expect(claim).toMatch(/compte|account|حساب/i);
  });
});
