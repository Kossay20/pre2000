/**
 * CLINICAL-SAFETY: the chatbot disclaimer banner must NOT hardcode per-country emergency numbers.
 *
 * An abuse-e2e visual audit (2026-05-30) found the AR/TN banner listing Maghreb numbers
 * (190 / 16 / 141) while the live emergency-call button correctly showed the guest's country
 * number (15 / France) — two contradictory numbers on the same heavy-bleeding triage screen,
 * one of which doesn't reach emergency services. Fix: disclaimers are GENERIC ("call your local
 * emergency number / nearest ER"); the emergency-call button (resolveEmergencyNumber, derived from
 * the user's country) is the SINGLE source of the actual number. This guards against any locale
 * reintroducing a hardcoded number that could contradict the button.
 */
import frC from '../locales/fr/common.json';
import enC from '../locales/en/common.json';
import arC from '../locales/ar/common.json';
import tnC from '../locales/tn/common.json';

describe('chatDisclaimer is generic — no hardcoded country emergency numbers', () => {
  const disclaimers: Record<string, string> = {
    fr: (frC as any).chatDisclaimer,
    en: (enC as any).chatDisclaimer,
    ar: (arC as any).chatDisclaimer,
    tn: (tnC as any).chatDisclaimer,
  };
  // Tokens that previously contradicted the country-derived button.
  const HARDCODED = /\b(15|112|190|141|16)\b|SAMU/;

  for (const [lng, text] of Object.entries(disclaimers)) {
    it(`${lng}: disclaimer contains no hardcoded emergency number`, () => {
      expect({ lng, hardcoded: HARDCODED.test(text) }).toEqual({ lng, hardcoded: false });
    });
  }
});
