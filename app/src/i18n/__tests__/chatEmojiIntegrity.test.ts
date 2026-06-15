/**
 * CB-NEW-04 — chatbot strings must not ship STRIPPED/corrupted emojis.
 *
 * A past `clean_emojis.js` pass removed the leading icons from the chatbot list strings but left
 * behind the scaffolding: orphan U+200D ZERO-WIDTH JOINERs (the tail of a stripped 🏃‍♀️ sequence,
 * which render as a tofu box) and bullet markers with a 2-space gap where the icon used to be
 * ("•  Nutrition" instead of "• 🍎 Nutrition"). Both leak visibly into FR/EN/AR/TN chat UI.
 *
 * This guard locks the three affected keys (chatWelcome, chatResponse.fallbackMessage,
 * chatResponse.topicSport) across ALL four locales against either class reappearing:
 *   (a) a LONE U+200D — a ZWJ not immediately preceded by an emoji/variation-selector (i.e. an
 *       orphan joiner rather than part of a real "runner + ZWJ + ♀ + VS16" grapheme), and
 *   (b) a "•  " bullet followed by two spaces (an icon-less bullet).
 */
import frC from '../locales/fr/common.json';
import enC from '../locales/en/common.json';
import arC from '../locales/ar/common.json';
import tnC from '../locales/tn/common.json';

const ZWJ = 0x200d;

const LOCALES: Record<string, any> = { fr: frC, en: enC, ar: arC, tn: tnC };

function chatStrings(c: any): { key: string; text: string }[] {
  return [
    { key: 'chatWelcome', text: c.chatWelcome },
    { key: 'chatResponse.fallbackMessage', text: c.chatResponse?.fallbackMessage },
    { key: 'chatResponse.topicSport', text: c.chatResponse?.topicSport },
  ];
}

/** A U+200D is "lone" if its preceding code point is not an emoji / variation selector. */
function lonelyZwjCount(text: string): number {
  const chars = [...text];
  let count = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i].codePointAt(0) !== ZWJ) continue;
    const prevCp = i > 0 ? (chars[i - 1].codePointAt(0) ?? 0) : 0;
    const prevIsEmoji =
      prevCp >= 0x1f000 || // pictographs / emoji planes
      (prevCp >= 0x2190 && prevCp <= 0x2bff) || // arrows, misc symbols, dingbats
      prevCp === 0xfe0f || // variation selector-16
      prevCp === 0x2640 || // ♀ female sign
      prevCp === 0x2642; // ♂ male sign
    if (!prevIsEmoji) count++;
  }
  return count;
}

describe('chatbot strings — no stripped/corrupted emojis (no orphan ZWJ, no icon-less bullets)', () => {
  for (const [lng, c] of Object.entries(LOCALES)) {
    const strings = chatStrings(c);

    it(`${lng}: all three chat keys are present strings (sanity)`, () => {
      expect(strings.every((s) => typeof s.text === 'string' && s.text.length > 0)).toBe(true);
    });

    for (const { key, text } of strings) {
      it(`${lng}.${key}: no lone U+200D (orphan ZWJ)`, () => {
        expect({ lng, key, loneZwj: lonelyZwjCount(text) }).toEqual({ lng, key, loneZwj: 0 });
      });

      it(`${lng}.${key}: no "•  " bullet followed by two spaces`, () => {
        expect({ lng, key, iconlessBullet: text.includes('•  ') }).toEqual({
          lng,
          key,
          iconlessBullet: false,
        });
      });
    }
  }
});
