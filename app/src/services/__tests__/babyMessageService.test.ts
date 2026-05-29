/**
 * N4 — babyMessageService had NO test file. The signature daily "message de bébé" notification
 * (scheduleTodaysBabyMessage) gates on enabled + saved hour and must select locale-correct
 * content (FR/EN/AR/TN with tn→ar→fr fallback). A regression = users get no daily message,
 * or the wrong-language message.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { language: 'fr' } }));
jest.mock('../../config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn(),
}));
jest.mock('../notificationService', () => ({ scheduleBabyMessage: jest.fn(), cancelBabyMessage: jest.fn() }));
jest.mock('../reminderPersistence', () => ({ loadBabyMessageEnabled: jest.fn(), loadBabyMessageHour: jest.fn() }));

import { scheduleTodaysBabyMessage } from '../babyMessageService';
import { scheduleBabyMessage } from '../notificationService';
import { loadBabyMessageEnabled, loadBabyMessageHour } from '../reminderPersistence';
import { getDocs } from 'firebase/firestore';

// Pin the message to today's day-of-week so getTodaysBabyMessage selects it deterministically
// (avoids the random-fallback branch).
const todayDow = new Date().getDay();
const dayNumber = todayDow === 0 ? 7 : todayDow;
const baseMsg = {
  message_id: 'm1', day: dayNumber, emoji: '👶',
  message_fr: 'FR', message_en: 'EN', message_ar: 'AR', message_tn: 'TN',
};
const snapshotOf = (m: any) => ({ docs: [{ data: () => m }] });

describe('scheduleTodaysBabyMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadBabyMessageEnabled as jest.Mock).mockResolvedValue(true);
    (loadBabyMessageHour as jest.Mock).mockResolvedValue(9);
    (getDocs as jest.Mock).mockResolvedValue(snapshotOf(baseMsg));
  });

  it('schedules the baby message at the saved hour when enabled', async () => {
    await scheduleTodaysBabyMessage(20, 'fr');
    expect(scheduleBabyMessage).toHaveBeenCalledWith('FR', '👶', 9, 0);
  });

  it('selects locale-specific content for en and ar', async () => {
    await scheduleTodaysBabyMessage(20, 'en');
    expect(scheduleBabyMessage).toHaveBeenCalledWith('EN', '👶', 9, 0);
    (scheduleBabyMessage as jest.Mock).mockClear();
    await scheduleTodaysBabyMessage(20, 'ar');
    expect(scheduleBabyMessage).toHaveBeenCalledWith('AR', '👶', 9, 0);
  });

  it('falls back tn → ar when Tunisian content is missing', async () => {
    (getDocs as jest.Mock).mockResolvedValue(snapshotOf({ ...baseMsg, message_tn: undefined }));
    await scheduleTodaysBabyMessage(20, 'tn');
    expect(scheduleBabyMessage).toHaveBeenCalledWith('AR', '👶', 9, 0);
  });

  it('does nothing when baby messages are disabled', async () => {
    (loadBabyMessageEnabled as jest.Mock).mockResolvedValue(false);
    await scheduleTodaysBabyMessage(20, 'fr');
    expect(scheduleBabyMessage).not.toHaveBeenCalled();
  });

  it('does nothing when no message exists for the week', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });
    await scheduleTodaysBabyMessage(20, 'fr');
    expect(scheduleBabyMessage).not.toHaveBeenCalled();
  });
});
