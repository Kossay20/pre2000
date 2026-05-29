/**
 * I2 — RTL setup guard. Regression net for the infinite-reload-loop fix: on web, setupRTL
 * must NOT touch I18nManager or reload (web RTL is applied via document.dir in index.ts);
 * on native it flips + (would) reload only when the direction actually changed.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('expo-updates', () => ({ reloadAsync: jest.fn() }));

const mockI18nManager = { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() };
jest.mock('react-native', () => ({
  I18nManager: mockI18nManager,
  Platform: { OS: 'web' },
}));

import { I18nManager, Platform } from 'react-native';
import { setupRTL, registerRTLListener } from '../rtl';

// Inject a fake i18n instance whose `language` we mutate per test.
const fakeI18n: any = { language: 'fr', isInitialized: true, on: jest.fn() };
registerRTLListener(fakeI18n);

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as any).OS = 'web';
  (mockI18nManager as any).isRTL = false;
  fakeI18n.language = 'fr';
});

describe('setupRTL', () => {
  it('WEB + Arabic: never touches I18nManager (no forceRTL → no reload loop)', async () => {
    (Platform as any).OS = 'web';
    fakeI18n.language = 'ar';
    await setupRTL();
    expect(I18nManager.forceRTL).not.toHaveBeenCalled();
    expect(I18nManager.allowRTL).not.toHaveBeenCalled();
  });

  it('NATIVE: flips to RTL when language is Arabic and direction differs', async () => {
    (Platform as any).OS = 'ios';
    (mockI18nManager as any).isRTL = false;
    fakeI18n.language = 'ar';
    await setupRTL();
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  });

  it('NATIVE: no-op when direction already matches (anti-loop guard)', async () => {
    (Platform as any).OS = 'ios';
    (mockI18nManager as any).isRTL = true; // already RTL
    fakeI18n.language = 'tn';
    await setupRTL();
    expect(I18nManager.forceRTL).not.toHaveBeenCalled();
  });

  it('NATIVE: flips back to LTR for a French user on an RTL device', async () => {
    (Platform as any).OS = 'android';
    (mockI18nManager as any).isRTL = true;
    fakeI18n.language = 'fr';
    await setupRTL();
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  });
});
