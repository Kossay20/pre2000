/**
 * Firestore security rules, executed rather than read.
 *
 * `firestore.rules` is the only thing standing between one user's reproductive
 * health data and another's, and until now it had never been run against
 * anything. That is how commit 323f699 happened: a nested wildcard written as
 * `match /{document=**}` also matched the PARENT document, which silently
 * short-circuited the size guard on the parent's own write — a rule that looked
 * correct, reviewed as correct, and did nothing.
 *
 * These run against the Firestore emulator, so every assertion is the real rules
 * engine's verdict.
 *
 *   npm run test:rules
 *
 * Deliberately not part of `npm run verify`: it needs a JVM and a running
 * emulator, and a gate that cannot run on a fresh clone is a gate people learn to
 * skip. It is its own script, to be run before deploying rules.
 */
import fs from 'fs';
import path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

// The purge's own list (src/context/gdprPurge.ts), repeated here because that module pulls
// in the app's logger. gdprPurge.test.ts pins the rules and the purge to the same names.
const legacySubCollections = ['weights', 'events', 'journal', 'chatbot_history'];

const ALICE = 'alice-uid';
const MALLORY = 'mallory-uid';
const TODAY = '2026-08-19';

let testEnv: RulesTestEnvironment;

/** Firestore for a signed-in user (any provider — anonymous sessions look the same here). */
const asAlice = () => testEnv.authenticatedContext(ALICE).firestore();
const asMallory = () => testEnv.authenticatedContext(MALLORY).firestore();
const asVisitor = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'mama-bebe-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('static content', () => {
  it('is readable by any signed-in user, including an anonymous guest', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'articles/a1'), { title_fr: 'Nutrition' });
    });
    await assertSucceeds(getDoc(doc(asAlice(), 'articles/a1')));
  });

  it('is closed to unauthenticated traffic — the anti-scraping guard', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'articles/a1'), { title_fr: 'Nutrition' });
    });
    await assertFails(getDoc(doc(asVisitor(), 'articles/a1')));
  });

  it('is never writable, even by a signed-in user', async () => {
    await assertFails(setDoc(doc(asAlice(), 'articles/a1'), { title_fr: 'injected' }));
    await assertFails(setDoc(doc(asAlice(), 'weeks/25'), { week_number: 25 }));
    await assertFails(setDoc(doc(asAlice(), 'redFlags/rf1'), { severity: 'none' }));
  });
});

describe('user profiles', () => {
  it('lets the owner read and write their own', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { firstName: 'Amira' }));
    await assertSucceeds(getDoc(doc(asAlice(), `userProfiles/${ALICE}`)));
  });

  it("refuses to let anyone read or write someone else's", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `userProfiles/${ALICE}`), { firstName: 'Amira' });
    });
    await assertFails(getDoc(doc(asMallory(), `userProfiles/${ALICE}`)));
    await assertFails(setDoc(doc(asMallory(), `userProfiles/${ALICE}`), { firstName: 'owned' }));
  });

  it('caps free-text names — the guard that was inert before 323f699', async () => {
    // A 1 MB firstName was accepted while the nested wildcard shadowed this rule.
    const huge = 'a'.repeat(5000);
    await assertFails(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { firstName: huge }));
    await assertFails(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { lastName: huge }));
  });

  it('accepts the WeightTracker setup (height, pre-pregnancy weight) merged into a full profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `userProfiles/${ALICE}`), {
        firstName: 'Amira', lastName: 'B', country: 'France', lmp: TODAY, pregnancyStartDate: TODAY, locale: 'fr',
      });
    });
    await assertSucceeds(
      setDoc(
        doc(asAlice(), `userProfiles/${ALICE}`),
        { height: 165, prePregnancyWeight: 60, updatedAt: new Date().toISOString() },
        { merge: true },
      ),
    );
  });

  it('still accepts a name at the boundary', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { firstName: 'a'.repeat(50) }),
    );
  });

  it('types the declared-condition flags — these drive the reminders catalogue', async () => {
    // The context rules compare with strict equality. A string "true" here would be
    // compared against a boolean and match nothing, reproducing the inert-rule
    // defect from the server side, past the client that was just fixed.
    await assertSucceeds(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), {
        hasGestationalDiabetes: true,
        hasHypertension: false,
        isTwinPregnancy: false,
        medicalProfileAnsweredAt: new Date().toISOString(),
      }),
    );
    await assertFails(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { hasGestationalDiabetes: 'true' }),
    );
    await assertFails(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { hasHypertension: 1 }),
    );
    await assertFails(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { isTwinPregnancy: { yes: true } }),
    );
    await assertFails(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), {
        medicalProfileAnsweredAt: 'x'.repeat(200),
      }),
    );
  });

  it('accepts the health-data consent record and nothing shaped otherwise', async () => {
    // Written by onboarding's last step (full profile) and by the consent sheet (a merge
    // of the record alone). It is the proof the processing is allowed: fixed shape.
    const consent = { version: '2026-09-30', at: '2026-09-30T08:00:00.000Z' };
    await assertSucceeds(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), {
        firstName: 'Amira', country: 'France', lmp: TODAY, pregnancyStartDate: TODAY, healthDataConsent: consent,
      }),
    );
    await assertSucceeds(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { healthDataConsent: consent, updatedAt: new Date().toISOString() }, { merge: true }),
    );
    await assertFails(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { healthDataConsent: true }));
    await assertFails(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { healthDataConsent: { version: '2026-09-30' } }));
    await assertFails(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { healthDataConsent: { ...consent, extra: 'x' } }));
    await assertFails(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), { healthDataConsent: { ...consent, at: 'x'.repeat(200) } }));
    await assertFails(setDoc(doc(asMallory(), `userProfiles/${ALICE}`), { healthDataConsent: consent }, { merge: true }));
  });

  it('bounds how many fields the profile document can carry', async () => {
    // This document holds declared diagnoses, and the GDPR export reads it through
    // a whitelist — a field nobody declared is one the subject can never see in her
    // own export. Owner-scoped, so not a cross-user hole; this stops a hand-rolled
    // client planting arbitrary health fields in it.
    const wide: Record<string, boolean> = {};
    for (let i = 0; i < 60; i++) wide[`f${i}`] = true;
    await assertFails(setDoc(doc(asAlice(), `userProfiles/${ALICE}`), wide));
  });

  it('still accepts a complete real profile — the cap is not too tight', async () => {
    // A finished profile already carries around 27 fields. A ceiling that a real
    // user trips is worse than no ceiling, because it fails at onboarding.
    await assertSucceeds(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}`), {
        firstName: 'Amira', lastName: 'B', locale: 'ar', country: 'tunisia',
        city: 'Tunis', ageRange: '25-29', isFirstPregnancy: true,
        lmp: '2026-02-01', pregnancyStartDate: '2026-02-01', dpa: '2026-11-08',
        height: 165, prePregnancyWeight: 60, emergencyContacts: [],
        hasGestationalDiabetes: true, hasHypertension: false, isTwinPregnancy: false,
        medicalProfileAnsweredAt: '2026-08-25T10:00:00.000Z',
        isTTC: false, cycleLength: 28, ovulationDate: '2026-02-15',
        fertileWindowStart: '2026-02-10', fertileWindowEnd: '2026-02-16',
        isCurious: false, exploreWeek: 0, email: 'a@b.co',
        createdAt: '2026-08-25T10:00:00.000Z', updatedAt: '2026-08-25T10:00:00.000Z',
      }),
    );
  });

  it('lets the owner DELETE their own profile — GDPR art. 17', async () => {
    // `allow write` covers delete, and on a delete `request.resource` is null, so a
    // validator that dereferences request.resource.data raises a null error and
    // denies. gdprPurge deletes this document first and does not catch, so the
    // whole account deletion rejects — every later purge step, the auth-user
    // delete, and the local AsyncStorage wipe never run.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `userProfiles/${ALICE}`), {
        firstName: 'Amira',
        hasGestationalDiabetes: true,
      });
    });
    await assertSucceeds(deleteDoc(doc(asAlice(), `userProfiles/${ALICE}`)));
  });

  it('still refuses a delete by anyone else', async () => {
    await assertFails(deleteDoc(doc(asMallory(), `userProfiles/${ALICE}`)));
  });

  it("keeps a diagnosis owner-scoped — it is health data", async () => {
    await assertFails(
      setDoc(doc(asMallory(), `userProfiles/${ALICE}`), { hasGestationalDiabetes: true }),
    );
  });

  it('covers subcollections so account deletion can actually erase them', async () => {
    // gdprPurge walks legacy subcollections; before the nested match existed every
    // read there was permission-denied, swallowed, and "delete my account"
    // reported success while the data survived.
    await assertSucceeds(
      setDoc(doc(asAlice(), `userProfiles/${ALICE}/weights/w1`), { value: 62 }),
    );
    await assertSucceeds(getDocs(collection(asAlice(), `userProfiles/${ALICE}/weights`)));
    await assertSucceeds(deleteDoc(doc(asAlice(), `userProfiles/${ALICE}/weights/w1`)));
    await assertFails(getDocs(collection(asMallory(), `userProfiles/${ALICE}/weights`)));
  });

  // A client cannot list a document's subcollections, so the purge sweeps a fixed list of
  // names. The rules accept exactly that list under both parents: anything else could be
  // written and then never erased.
  it.each(['userProfiles', 'users'])('%s: every subcollection the purge sweeps is open to its owner', async (parent) => {
    for (const sub of legacySubCollections) {
      await assertSucceeds(setDoc(doc(asAlice(), `${parent}/${ALICE}/${sub}/d1`), { value: 1 }));
      await assertSucceeds(getDocs(collection(asAlice(), `${parent}/${ALICE}/${sub}`)));
      await assertSucceeds(deleteDoc(doc(asAlice(), `${parent}/${ALICE}/${sub}/d1`)));
      await assertFails(getDocs(collection(asMallory(), `${parent}/${ALICE}/${sub}`)));
    }
  });

  it.each(['userProfiles', 'users'])('%s: a subcollection the purge does not know is refused, even to the owner', async (parent) => {
    await assertFails(setDoc(doc(asAlice(), `${parent}/${ALICE}/notes/n1`), { text: 'x' }));
    await assertFails(getDocs(collection(asAlice(), `${parent}/${ALICE}/notes`)));
    // The name that counts is the first segment under the user document, whatever follows.
    await assertFails(setDoc(doc(asAlice(), `${parent}/${ALICE}/notes/n1/weights/w1`), { text: 'x' }));
  });
});

describe('deletion requests (deletionRequests/{uid})', () => {
  const request = () => ({ requestedAt: serverTimestamp() });

  it('the owner can record, read, re-record and remove her own request', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `deletionRequests/${ALICE}`), request()));
    await assertSucceeds(getDoc(doc(asAlice(), `deletionRequests/${ALICE}`)));
    await assertSucceeds(setDoc(doc(asAlice(), `deletionRequests/${ALICE}`), request()));
    await assertSucceeds(deleteDoc(doc(asAlice(), `deletionRequests/${ALICE}`)));
  });

  it('reads as "absent" before one exists — every sign-in without a profile asks', async () => {
    const snap = await assertSucceeds(getDoc(doc(asAlice(), `deletionRequests/${ALICE}`)));
    expect(snap.exists()).toBe(false);
  });

  it('nobody else can file, see or withdraw it — that would delete or resurrect her account', async () => {
    await assertFails(setDoc(doc(asMallory(), `deletionRequests/${ALICE}`), request()));
    await assertFails(setDoc(doc(asVisitor(), `deletionRequests/${ALICE}`), request()));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `deletionRequests/${ALICE}`), { requestedAt: new Date() });
    });
    await assertFails(getDoc(doc(asMallory(), `deletionRequests/${ALICE}`)));
    await assertFails(deleteDoc(doc(asMallory(), `deletionRequests/${ALICE}`)));
    await assertFails(getDoc(doc(asVisitor(), `deletionRequests/${ALICE}`)));
  });

  it('holds the server time of the request and nothing else', async () => {
    await assertFails(setDoc(doc(asAlice(), `deletionRequests/${ALICE}`), { requestedAt: 'yesterday' }));
    await assertFails(setDoc(doc(asAlice(), `deletionRequests/${ALICE}`), { ...request(), note: 'x' }));
    await assertFails(setDoc(doc(asAlice(), `deletionRequests/${ALICE}`), {}));
  });

  it('cannot be enumerated, not even by a signed-in user', async () => {
    await assertFails(getDocs(collection(asAlice(), 'deletionRequests')));
  });
});

describe('health data', () => {
  const weight = (uid: string) => ({ user_id: uid, type: 'weight', date: TODAY, value: 62 });

  it('accepts a well-formed entry from its owner', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'healthMetrics/m1'), weight(ALICE)));
  });

  it('refuses an entry attributed to someone else', async () => {
    await assertFails(setDoc(doc(asAlice(), 'healthMetrics/m1'), weight(MALLORY)));
  });

  it("refuses to disclose another user's entries", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'healthMetrics/m1'), weight(ALICE));
    });
    await assertFails(getDoc(doc(asMallory(), 'healthMetrics/m1')));
  });

  it.each([
    ['a negative weight', { ...{ user_id: ALICE, type: 'weight', date: TODAY }, value: -5 }],
    ['an absurd weight', { ...{ user_id: ALICE, type: 'weight', date: TODAY }, value: 900 }],
    ['an unknown metric type', { user_id: ALICE, type: 'horoscope', date: TODAY, value: 1 }],
    ['a non-numeric value', { user_id: ALICE, type: 'weight', date: TODAY, value: 'sixty' }],
  ])('rejects %s', async (_label, payload) => {
    await assertFails(setDoc(doc(asAlice(), 'healthMetrics/m1'), payload));
  });

  it('bounds blood pressure to physiological ranges', async () => {
    const bp = (systolic: number, diastolic: number) => ({
      user_id: ALICE,
      type: 'blood_pressure',
      date: TODAY,
      value: { systolic, diastolic },
    });
    await assertSucceeds(setDoc(doc(asAlice(), 'healthMetrics/bp1'), bp(118, 75)));
    await assertFails(setDoc(doc(asAlice(), 'healthMetrics/bp2'), bp(400, 75)));
    await assertFails(setDoc(doc(asAlice(), 'healthMetrics/bp3'), bp(118, 250)));
  });

  it('bounds glucose and constrains meal context to the known enum', async () => {
    const glucose = (value: number, meal_context: string) => ({
      user_id: ALICE,
      value,
      meal_context,
      date: TODAY,
    });
    await assertSucceeds(setDoc(doc(asAlice(), 'glucoseMetrics/g1'), glucose(5.4, 'fasting')));
    await assertFails(setDoc(doc(asAlice(), 'glucoseMetrics/g2'), glucose(5.4, 'after_yoga')));
    await assertFails(setDoc(doc(asAlice(), 'glucoseMetrics/g3'), glucose(999, 'fasting')));
  });

  it('pins symptomsLog document ids to the owner, so no one can squat the namespace', async () => {
    const payload = { user_id: ALICE, symptoms: ['nausea'], date: TODAY };
    await assertSucceeds(setDoc(doc(asAlice(), `symptomsLog/${ALICE}_${TODAY}`), payload));
    // Right owner, wrong id shape.
    await assertFails(setDoc(doc(asAlice(), 'symptomsLog/whatever'), payload));
    // Mallory cannot pre-create Alice's deterministic id.
    await assertFails(
      setDoc(doc(asMallory(), `symptomsLog/${ALICE}_${TODAY}`), {
        user_id: MALLORY,
        symptoms: ['x'],
        date: TODAY,
      }),
    );
  });

  it('bounds the symptom list', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `symptomsLog/${ALICE}_${TODAY}`), {
        user_id: ALICE,
        symptoms: Array.from({ length: 60 }, (_, i) => `s${i}`),
        date: TODAY,
      }),
    );
  });
});

describe('per-user collections', () => {
  const OWNED = [
    ['userEvents', { title: 'Échographie', date: TODAY }],
    ['userTasks', { title: 'Prendre le fer' }],
    ['weight_entries', { weight: 62 }],
    ['userReminderSettings', { enabled: true }],
    ['userTaskStatuses', { week_number: 25 }],
    ['reminder_settings_v2', { enabled: true, intensity: 3 }],
  ] as const;

  it.each(OWNED)('%s: the owner can write and read back', async (name, payload) => {
    await assertSucceeds(setDoc(doc(asAlice(), `${name}/d1`), { ...payload, user_id: ALICE }));
    await assertSucceeds(getDoc(doc(asAlice(), `${name}/d1`)));
  });

  it.each(OWNED)('%s: another user can neither read nor overwrite it', async (name, payload) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${name}/d1`), { ...payload, user_id: ALICE });
    });
    await assertFails(getDoc(doc(asMallory(), `${name}/d1`)));
    await assertFails(setDoc(doc(asMallory(), `${name}/d1`), { ...payload, user_id: MALLORY }));
    await assertFails(deleteDoc(doc(asMallory(), `${name}/d1`)));
  });

  it.each(OWNED)('%s: a document may not be attributed to someone else', async (name, payload) => {
    await assertFails(setDoc(doc(asAlice(), `${name}/d2`), { ...payload, user_id: MALLORY }));
  });

  it.each(OWNED)('%s: unauthenticated traffic is refused outright', async (name, payload) => {
    await assertFails(setDoc(doc(asVisitor(), `${name}/d3`), { ...payload, user_id: ALICE }));
  });
});

describe('tracker history (kick sessions, contractions, hospital bag)', () => {
  const T0 = 1_790_000_000_000;
  const kick = (uid: string, extra: Record<string, unknown> = {}) => ({
    user_id: uid,
    id: 'mf1k2-abc123',
    startedAt: T0,
    endedAt: T0 + 60_000,
    kicks: [T0 + 1000, T0 + 2000],
    ...extra,
  });
  const contraction = (uid: string, extra: Record<string, unknown> = {}) => ({
    user_id: uid,
    id: 'mf1k2-def456',
    startedAt: T0,
    endedAt: T0 + 45_000,
    ...extra,
  });
  const bag = (uid: string, extra: Record<string, unknown> = {}) => ({
    user_id: uid,
    checked: { 'mom-1': true },
    customItems: [{ id: 'custom-1', section: 'mom', label: 'Chargeur' }],
    updatedAt: T0,
    ...extra,
  });

  it('the owner can write, list and delete her kick sessions and contractions', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `kickSessions/${ALICE}_mf1k2-abc123`), kick(ALICE)));
    await assertSucceeds(setDoc(doc(asAlice(), `contractions/${ALICE}_mf1k2-def456`), contraction(ALICE)));
    // Re-sending the same record (a retried sync) is an update, and allowed.
    await assertSucceeds(setDoc(doc(asAlice(), `kickSessions/${ALICE}_mf1k2-abc123`), kick(ALICE)));
    await assertSucceeds(getDocs(query(collection(asAlice(), 'kickSessions'), where('user_id', '==', ALICE))));
    await assertSucceeds(getDocs(query(collection(asAlice(), 'contractions'), where('user_id', '==', ALICE))));
    await assertSucceeds(deleteDoc(doc(asAlice(), `contractions/${ALICE}_mf1k2-def456`)));
  });

  it('pins tracker ids to the owner, so no one can squat her namespace', async () => {
    await assertFails(setDoc(doc(asAlice(), 'kickSessions/whatever'), kick(ALICE)));
    await assertFails(setDoc(doc(asMallory(), `kickSessions/${ALICE}_x1`), kick(MALLORY)));
    await assertFails(setDoc(doc(asMallory(), `contractions/${ALICE}_x1`), contraction(MALLORY)));
  });

  it('refuses records attributed to someone else, and unauthenticated writes', async () => {
    await assertFails(setDoc(doc(asAlice(), `kickSessions/${ALICE}_x1`), kick(MALLORY)));
    await assertFails(setDoc(doc(asAlice(), `contractions/${ALICE}_x1`), contraction(MALLORY)));
    await assertFails(setDoc(doc(asVisitor(), `kickSessions/${ALICE}_x1`), kick(ALICE)));
  });

  it("refuses to disclose or delete another user's history", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `kickSessions/${ALICE}_x1`), kick(ALICE));
      await setDoc(doc(ctx.firestore(), `contractions/${ALICE}_x1`), contraction(ALICE));
      await setDoc(doc(ctx.firestore(), `hospitalBags/${ALICE}`), bag(ALICE));
    });
    await assertFails(getDoc(doc(asMallory(), `kickSessions/${ALICE}_x1`)));
    await assertFails(getDocs(query(collection(asMallory(), 'contractions'), where('user_id', '==', ALICE))));
    await assertFails(getDoc(doc(asMallory(), `hospitalBags/${ALICE}`)));
    await assertFails(deleteDoc(doc(asMallory(), `kickSessions/${ALICE}_x1`)));
    await assertFails(deleteDoc(doc(asMallory(), `hospitalBags/${ALICE}`)));
    await assertFails(setDoc(doc(asMallory(), `hospitalBags/${ALICE}`), bag(MALLORY)));
  });

  it.each([
    ['an extra field', kick(ALICE, { note: 'x' })],
    ['an end before the start', kick(ALICE, { endedAt: T0 - 1 })],
    ['a non-numeric start', kick(ALICE, { startedAt: 'today' })],
    ['kicks that are not a list', kick(ALICE, { kicks: 12 })],
    ['an unbounded kick list', kick(ALICE, { kicks: Array.from({ length: 2001 }, (_, i) => T0 + i) })],
  ])('rejects a kick session with %s', async (_label, payload) => {
    await assertFails(setDoc(doc(asAlice(), `kickSessions/${ALICE}_mf1k2-abc123`), payload));
  });

  it.each([
    ['an extra field', contraction(ALICE, { intensity: 9 })],
    ['an end before the start', contraction(ALICE, { endedAt: T0 - 1 })],
  ])('rejects a contraction with %s', async (_label, payload) => {
    await assertFails(setDoc(doc(asAlice(), `contractions/${ALICE}_mf1k2-def456`), payload));
  });

  it('the hospital bag is one document per user, id = uid, readable before it exists', async () => {
    // The app reads it on first open, when it does not exist yet.
    await assertSucceeds(getDoc(doc(asAlice(), `hospitalBags/${ALICE}`)));
    await assertSucceeds(setDoc(doc(asAlice(), `hospitalBags/${ALICE}`), bag(ALICE)));
    await assertSucceeds(getDoc(doc(asAlice(), `hospitalBags/${ALICE}`)));
    await assertSucceeds(getDocs(query(collection(asAlice(), 'hospitalBags'), where('user_id', '==', ALICE))));
    await assertFails(setDoc(doc(asAlice(), 'hospitalBags/other-id'), bag(ALICE)));
    await assertSucceeds(deleteDoc(doc(asAlice(), `hospitalBags/${ALICE}`)));
  });

  it.each([
    ['an extra field', bag(ALICE, { items: [] })],
    ['a non-map checked', bag(ALICE, { checked: ['mom-1'] })],
    ['too many custom items', bag(ALICE, { customItems: Array.from({ length: 101 }, (_, i) => ({ id: `c${i}` })) })],
    ['no version stamp', bag(ALICE, { updatedAt: 'now' })],
  ])('rejects a hospital bag with %s', async (_label, payload) => {
    await assertFails(setDoc(doc(asAlice(), `hospitalBags/${ALICE}`), payload));
  });
});

describe('collections nothing declares', () => {
  it('are default-deny — a typo in a collection name must not open a door', async () => {
    await assertFails(setDoc(doc(asAlice(), 'userEventz/d1'), { user_id: ALICE }));
    await assertFails(getDoc(doc(asAlice(), 'admin/config')));
  });
});
