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
