/**
 * CLINICAL-SAFETY: NO chatbot-facing emergency string may hardcode a per-country emergency number.
 *
 * An abuse-e2e visual audit (2026-05-30) found the AR/TN disclaimer banner listing Maghreb numbers
 * (190 / 16 / 141) while the live emergency-call button correctly showed the guest's country
 * number (15 / France) — two contradictory numbers on the same heavy-bleeding triage screen,
 * one of which doesn't reach emergency services. A SECOND-cycle visual pass then caught the same
 * class in a different key: FR `chatResponse.redFlagCritical` hardcoded "le 15" (France SAMU)
 * while EN/AR/TN were generic — so a French-speaking guest in Belgium/Canada/Maghreb would see
 * "15" in the response body contradicting the country-derived button.
 *
 * Fix: every chatbot emergency string is GENERIC ("call your local emergency number / emergency
 * services"); the emergency-call button (resolveEmergencyNumber, derived from the user's country)
 * is the SINGLE source of the actual number. This guards the WHOLE surface — the disclaimer AND
 * every chatResponse value AND the call-action label — against any locale reintroducing a number.
 */
import frC from '../locales/fr/common.json';
import enC from '../locales/en/common.json';
import arC from '../locales/ar/common.json';
import tnC from '../locales/tn/common.json';
import { RED_FLAGS } from '../../data/chatbot_data';

const LOCALES: Record<string, any> = { fr: frC, en: enC, ar: arC, tn: tnC };
// Emergency numbers across the mapped countries (FR 15/112, Maghreb 190/141/16/197/198, etc.) + SAMU.
const HARDCODED = /\b(15|112|190|141|16|144|911|18|17|197|198)\b|SAMU/;

// Every chatbot-facing string a user can read on a triage/emergency screen. The country-derived
// call button is the ONLY place an actual number may appear.
function chatbotStrings(c: any): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  if (typeof c.chatDisclaimer === 'string') out.push({ key: 'chatDisclaimer', text: c.chatDisclaimer });
  if (typeof c.chatEmergencyAction === 'string') out.push({ key: 'chatEmergencyAction', text: c.chatEmergencyAction });
  const cr = c.chatResponse || {};
  for (const [k, v] of Object.entries(cr)) {
    if (typeof v === 'string') out.push({ key: `chatResponse.${k}`, text: v });
  }
  return out;
}

describe('chatbot emergency strings are generic — no hardcoded country emergency numbers', () => {
  for (const [lng, c] of Object.entries(LOCALES)) {
    const strings = chatbotStrings(c);
    it(`${lng}: scans ${strings.length}+ chatbot strings (sanity)`, () => {
      expect(strings.length).toBeGreaterThan(5);
    });
    for (const { key, text } of strings) {
      it(`${lng}.${key}: no hardcoded emergency number`, () => {
        expect({ lng, key, hardcoded: HARDCODED.test(text) }).toEqual({ lng, key, hardcoded: false });
      });
    }
  }
});

// The RED_FLAGS data layer renders the FIRST paragraph of every emergency triage screen
// (`standard_message_*`) sitting directly above the chatResponse hint. A wrong-country number
// there during a real hemorrhage is the exact clinical-safety class this guard exists for, so the
// lock must cover the DATA layer too — not just the i18n catalog — else a future flag edit could
// reintroduce a number with nothing to catch it. (Verified clean 2026-05-30 cycle-2 close.)
describe('RED_FLAGS message bodies are generic — no hardcoded country emergency numbers', () => {
  const FIELDS = ['standard_message_fr', 'standard_message_en', 'standard_message_ar', 'standard_message_tn',
                  'label_fr', 'label_en', 'label_ar', 'label_tn'] as const;
  it('scans every RED_FLAGS body/label field (sanity)', () => {
    expect(RED_FLAGS.length).toBeGreaterThan(5);
  });
  for (const flag of RED_FLAGS) {
    for (const f of FIELDS) {
      const text = (flag as any)[f];
      if (typeof text !== 'string') continue;
      it(`${flag.red_flag_id}.${f}: no hardcoded emergency number`, () => {
        expect({ id: flag.red_flag_id, field: f, hardcoded: HARDCODED.test(text) })
          .toEqual({ id: flag.red_flag_id, field: f, hardcoded: false });
      });
    }
  }
});
