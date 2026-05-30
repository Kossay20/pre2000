/**
 * notificationBuilder — pure payload builder for reminder notifications.
 *
 * This service has NO firestore / AsyncStorage / expo dependency: it only imports the
 * logger, i18n (for grouped titles + encouragements), and getLocalizedTrilang (pure helper,
 * kept REAL because it just reads {fr,ar,en,tn} fields with a tn→ar→fr fallback chain).
 *
 * We mock ONLY the logger (silence) and ../../i18n (so i18n.t is a controllable jest.fn()).
 * Coverage targets every branch of buildNotificationMessage / buildGroupedNotification /
 * getRandomEncouragement, including locale buckets (fr/en/ar/tn), the {name} placeholder
 * defaults, the fallback-title paths, and each catch handler.
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));

jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { language: 'fr', t: jest.fn(), changeLanguage: jest.fn() },
}));

import {
  buildNotificationMessage,
  buildGroupedNotification,
  getRandomEncouragement,
  NotificationContent,
} from '../notificationBuilder';
import { ReminderDefinition, Trilang } from '../../types/remindersV2';
import i18n from '../../i18n';

const tMock = i18n.t as unknown as jest.Mock;

// Determinism helper: single-element variant arrays make Math.floor(random * 1) === 0 always,
// so the "random" pick is fully deterministic without spying on Math.random.
const trilang = (over: Partial<Trilang> = {}): Trilang => ({
  fr: 'titre fr',
  ar: 'عنوان ar',
  en: 'title en',
  tn: 'titre tn',
  ...over,
});

const makeReminder = (over: Partial<ReminderDefinition> = {}): ReminderDefinition =>
  ({
    id: 'r1',
    category_id: 'cat1',
    title: trilang(),
    description: trilang({ fr: 'desc fr', ar: 'وصف ar', en: 'desc en', tn: 'desc tn' }),
    default_enabled: true,
    frequency_type: 'per_day',
    intensity_options: [1],
    preset_times: {},
    source_ui: 'reminders_only',
    ui: { icon: '💊' },
    ...over,
  }) as ReminderDefinition;

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// buildNotificationMessage
// ============================================================================
describe('buildNotificationMessage — personalized message branch', () => {
  test('uses notification_messages variant for the requested language', () => {
    const reminder = makeReminder({
      notification_messages: { fr: ['Bonjour, pense à ton rappel'] },
    });
    const res = buildNotificationMessage(reminder, undefined, 'fr');
    expect(res.title).toBe('Bonjour, pense à ton rappel');
  });

  test('replaces {name} with userName when provided', () => {
    const reminder = makeReminder({
      notification_messages: { fr: ['Coucou {name}, hydrate-toi'] },
    });
    const res = buildNotificationMessage(reminder, 'Sarah', 'fr');
    expect(res.title).toBe('Coucou Sarah, hydrate-toi');
  });

  test('defaults {name} to "Maman" when no userName (fr)', () => {
    const reminder = makeReminder({
      notification_messages: { fr: ['Coucou {name} !'] },
    });
    const res = buildNotificationMessage(reminder, undefined, 'fr');
    expect(res.title).toBe('Coucou Maman !');
  });

  test('defaults {name} to "Maman" when userName is empty string (falsy → default branch)', () => {
    const reminder = makeReminder({
      notification_messages: { fr: ['Salut {name}'] },
    });
    const res = buildNotificationMessage(reminder, '', 'fr');
    expect(res.title).toBe('Salut Maman');
  });

  test('defaults {name} to "ماما" for arabic when no userName', () => {
    const reminder = makeReminder({
      notification_messages: { ar: ['مرحبا {name}'] },
    });
    const res = buildNotificationMessage(reminder, undefined, 'ar');
    expect(res.title).toBe('مرحبا ماما');
  });

  test('tn locale defaults {name} to "Maman" (only ar gets ماما — line 59 checks === "ar")', () => {
    const reminder = makeReminder({
      notification_messages: { tn: ['أهلا {name}'] },
    });
    const res = buildNotificationMessage(reminder, undefined, 'tn');
    expect(res.title).toBe('أهلا Maman');
  });

  test('en locale defaults {name} to "Maman" when no userName', () => {
    const reminder = makeReminder({
      notification_messages: { en: ['Hi {name}'] },
    });
    const res = buildNotificationMessage(reminder, undefined, 'en');
    expect(res.title).toBe('Hi Maman');
  });

  test('variant without {name} placeholder is left unchanged even with userName', () => {
    const reminder = makeReminder({
      notification_messages: { fr: ['Rappel quotidien'] },
    });
    const res = buildNotificationMessage(reminder, 'Sarah', 'fr');
    expect(res.title).toBe('Rappel quotidien');
  });

  test('picks the per-language variant (ar variant for ar request)', () => {
    const reminder = makeReminder({
      notification_messages: { fr: ['FR var'], ar: ['AR var'] },
    });
    expect(buildNotificationMessage(reminder, undefined, 'ar').title).toBe('AR var');
    expect(buildNotificationMessage(reminder, undefined, 'fr').title).toBe('FR var');
  });
});

describe('buildNotificationMessage — fallback title branch', () => {
  test('falls back to localized reminder.title when notification_messages absent', () => {
    const reminder = makeReminder(); // no notification_messages
    const res = buildNotificationMessage(reminder, undefined, 'fr');
    expect(res.title).toBe('titre fr');
  });

  test('falls back when requested language is missing from notification_messages', () => {
    const reminder = makeReminder({
      notification_messages: { en: ['only english'] },
    });
    const res = buildNotificationMessage(reminder, undefined, 'fr');
    expect(res.title).toBe('titre fr'); // uses getLocalizedTrilang(title, 'fr')
  });

  test('falls back when the language variant array is empty (length > 0 guard)', () => {
    const reminder = makeReminder({
      notification_messages: { fr: [] },
    });
    const res = buildNotificationMessage(reminder, undefined, 'fr');
    expect(res.title).toBe('titre fr');
  });

  test('fallback title is localized per language (ar / tn / en)', () => {
    const reminder = makeReminder();
    expect(buildNotificationMessage(reminder, undefined, 'ar').title).toBe('عنوان ar');
    expect(buildNotificationMessage(reminder, undefined, 'tn').title).toBe('titre tn');
    expect(buildNotificationMessage(reminder, undefined, 'en').title).toBe('title en');
  });

  test('default language is fr when language arg omitted', () => {
    const reminder = makeReminder();
    const res = buildNotificationMessage(reminder);
    expect(res.title).toBe('titre fr');
  });
});

describe('buildNotificationMessage — body & icon', () => {
  test('body is always the localized description', () => {
    const reminder = makeReminder({
      notification_messages: { fr: ['Some title'] },
    });
    expect(buildNotificationMessage(reminder, undefined, 'fr').body).toBe('desc fr');
    expect(buildNotificationMessage(reminder, undefined, 'ar').body).toBe('وصف ar');
    expect(buildNotificationMessage(reminder, undefined, 'tn').body).toBe('desc tn');
    expect(buildNotificationMessage(reminder, undefined, 'en').body).toBe('desc en');
  });

  test('icon comes from reminder.ui.icon', () => {
    const reminder = makeReminder({ ui: { icon: '🍎' } });
    expect(buildNotificationMessage(reminder, undefined, 'fr').icon).toBe('🍎');
  });

  test('icon is undefined when reminder.ui is absent', () => {
    const reminder = makeReminder({ ui: undefined });
    expect(buildNotificationMessage(reminder, undefined, 'fr').icon).toBeUndefined();
  });

  test('returns the NotificationContent shape (title, body, icon keys)', () => {
    const reminder = makeReminder();
    const res: NotificationContent = buildNotificationMessage(reminder, undefined, 'fr');
    expect(Object.keys(res).sort()).toEqual(['body', 'icon', 'title']);
  });
});

describe('buildNotificationMessage — catch / error branch', () => {
  test('null reminder triggers catch → fr fallback (Rappel 🔔, empty body, bell icon)', () => {
    const res = buildNotificationMessage(null as any, undefined, 'fr');
    expect(res).toEqual({ title: 'Rappel 🔔', body: '', icon: '🔔' });
  });

  test('catch branch returns arabic fallback title', () => {
    const res = buildNotificationMessage(null as any, undefined, 'ar');
    expect(res.title).toBe('تذكير 🔔');
    expect(res.body).toBe('');
    expect(res.icon).toBe('🔔');
  });

  test('catch branch returns tunisian fallback title (same as arabic)', () => {
    const res = buildNotificationMessage(null as any, undefined, 'tn');
    expect(res.title).toBe('تذكير 🔔');
  });

  test('catch branch returns french fallback title for en (en is not ar/tn → Rappel)', () => {
    const res = buildNotificationMessage(null as any, undefined, 'en');
    expect(res.title).toBe('Rappel 🔔');
  });
});

// ============================================================================
// buildGroupedNotification
// ============================================================================
describe('buildGroupedNotification — title key (single vs multiple)', () => {
  test('uses "single" key when exactly one reminder', () => {
    tMock.mockReturnValue('Un rappel pour Maman');
    const res = buildGroupedNotification([makeReminder()], undefined, 'fr');
    expect(tMock).toHaveBeenCalledWith('notifications:grouped.single', {
      name: 'Maman',
      count: 1,
      lng: 'fr',
    });
    expect(res.title).toBe('Un rappel pour Maman');
  });

  test('uses "multiple" key when more than one reminder', () => {
    tMock.mockReturnValue('3 rappels');
    const res = buildGroupedNotification(
      [makeReminder({ id: 'a' }), makeReminder({ id: 'b' }), makeReminder({ id: 'c' })],
      'Lina',
      'fr',
    );
    expect(tMock).toHaveBeenCalledWith('notifications:grouped.multiple', {
      name: 'Lina',
      count: 3,
      lng: 'fr',
    });
    expect(res.title).toBe('3 rappels');
  });

  test('empty array uses "multiple" key with count 0 and empty body (no catch)', () => {
    tMock.mockReturnValue('0 rappels');
    const res = buildGroupedNotification([], undefined, 'fr');
    expect(tMock).toHaveBeenCalledWith('notifications:grouped.multiple', {
      name: 'Maman',
      count: 0,
      lng: 'fr',
    });
    expect(res.body).toBe('');
    expect(res.icon).toBe('🔔');
  });
});

describe('buildGroupedNotification — default name', () => {
  test('defaults name to "Maman" for non-arabic when no userName', () => {
    tMock.mockReturnValue('t');
    buildGroupedNotification([makeReminder()], undefined, 'fr');
    expect(tMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: 'Maman' }));
  });

  test('defaults name to "ماما" for arabic when no userName', () => {
    tMock.mockReturnValue('t');
    buildGroupedNotification([makeReminder()], undefined, 'ar');
    expect(tMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: 'ماما' }));
  });

  test('tn locale defaults name to "Maman" (only ar gets ماما)', () => {
    tMock.mockReturnValue('t');
    buildGroupedNotification([makeReminder()], undefined, 'tn');
    expect(tMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: 'Maman' }));
  });

  test('uses provided userName over the default', () => {
    tMock.mockReturnValue('t');
    buildGroupedNotification([makeReminder()], 'Yasmine', 'ar');
    expect(tMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: 'Yasmine' }));
  });
});

describe('buildGroupedNotification — body composition', () => {
  test('body joins each reminder icon + localized title with newlines', () => {
    tMock.mockReturnValue('grouped title');
    const res = buildGroupedNotification(
      [
        makeReminder({ id: 'a', ui: { icon: '💊' }, title: trilang({ fr: 'Vitamines' }) }),
        makeReminder({ id: 'b', ui: { icon: '💧' }, title: trilang({ fr: 'Eau' }) }),
      ],
      undefined,
      'fr',
    );
    expect(res.body).toBe('💊 Vitamines\n💧 Eau');
  });

  test('body uses default 📌 icon when reminder.ui.icon missing', () => {
    tMock.mockReturnValue('grouped title');
    const res = buildGroupedNotification(
      [makeReminder({ id: 'a', ui: undefined, title: trilang({ fr: 'Marche' }) })],
      undefined,
      'fr',
    );
    expect(res.body).toBe('📌 Marche');
  });

  test('body localizes titles per requested language', () => {
    tMock.mockReturnValue('t');
    const res = buildGroupedNotification(
      [makeReminder({ ui: { icon: '💊' }, title: trilang({ ar: 'فيتامينات' }) })],
      undefined,
      'ar',
    );
    expect(res.body).toBe('💊 فيتامينات');
  });

  test('grouped result always carries the bell icon', () => {
    tMock.mockReturnValue('t');
    const res = buildGroupedNotification([makeReminder()], undefined, 'fr');
    expect(res.icon).toBe('🔔');
  });
});

describe('buildGroupedNotification — catch / error branch', () => {
  test('i18n.t throwing falls back to count-based title (fr) and icon-only body', () => {
    tMock.mockImplementation(() => {
      throw new Error('i18n boom');
    });
    const res = buildGroupedNotification(
      [makeReminder({ id: 'a', ui: { icon: '💊' } }), makeReminder({ id: 'b', ui: { icon: '💧' } })],
      undefined,
      'fr',
    );
    expect(res.title).toBe('2 rappels 🔔');
    expect(res.body).toBe('💊 💧');
    expect(res.icon).toBe('🔔');
  });

  test('catch branch returns arabic fallback title', () => {
    tMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const res = buildGroupedNotification([makeReminder()], undefined, 'ar');
    expect(res.title).toBe('1 تذكيرات 🔔');
  });

  test('catch branch uses 📌 default icon in body when ui missing', () => {
    tMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const res = buildGroupedNotification([makeReminder({ ui: undefined })], undefined, 'fr');
    expect(res.body).toBe('📌');
  });
});

// ============================================================================
// getRandomEncouragement
// ============================================================================
describe('getRandomEncouragement', () => {
  test('returns an element from the i18n encouragements array', () => {
    tMock.mockReturnValue(['Tu gères 💪']);
    expect(getRandomEncouragement('fr')).toBe('Tu gères 💪');
    expect(tMock).toHaveBeenCalledWith('notifications:encouragements', {
      returnObjects: true,
      lng: 'fr',
    });
  });

  test('passes the requested language to i18n.t', () => {
    tMock.mockReturnValue(['شجاعة']);
    getRandomEncouragement('ar');
    expect(tMock).toHaveBeenCalledWith('notifications:encouragements', {
      returnObjects: true,
      lng: 'ar',
    });
  });

  test('defaults language to fr when omitted', () => {
    tMock.mockReturnValue(['x']);
    getRandomEncouragement();
    expect(tMock).toHaveBeenCalledWith('notifications:encouragements', {
      returnObjects: true,
      lng: 'fr',
    });
  });

  test('falls back to 💪 when i18n returns a non-array (e.g. raw key)', () => {
    tMock.mockReturnValue('notifications:encouragements');
    expect(getRandomEncouragement('fr')).toBe('💪');
  });

  test('falls back to 💪 when i18n returns an empty array', () => {
    tMock.mockReturnValue([]);
    expect(getRandomEncouragement('fr')).toBe('💪');
  });

  test('falls back to 💪 when i18n.t throws (catch branch)', () => {
    tMock.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(getRandomEncouragement('fr')).toBe('💪');
  });

  test('returns the single element deterministically from a one-item array', () => {
    tMock.mockReturnValue(['only one']);
    expect(getRandomEncouragement('en')).toBe('only one');
  });
});
