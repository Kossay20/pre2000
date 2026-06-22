import { RED_FLAGS } from '../../data/chatbot_data';

/**
 * W6 — data-contract guard for the chatbot triage severity taxonomy.
 *
 * ChatbotScreen escalates (emergency alert + call-doctor action) ONLY for severities 'emergency'
 * and 'urgent_consult' (ChatbotScreen.tsx:149-150). A future data edit that introduces a severity
 * the screen doesn't handle — the legacy French DbRedFlag enum ('critique'/'élevé'…), a typo, or a
 * new tier — would make that red flag silently FAIL to escalate. That is exactly the class of
 * under-triage bug W6 fixed. This test pins the active taxonomy so it can't regress unnoticed.
 */
describe('Chatbot red-flag severity taxonomy (W6 data-contract guard)', () => {
  const SCREEN_HANDLED = new Set(['emergency', 'urgent_consult']);

  it('every active red flag uses a screen-handled emergency severity', () => {
    const offenders = RED_FLAGS
      .filter(f => !SCREEN_HANDLED.has(String(f.severity || '').toLowerCase()))
      .map(f => `${(f as any).red_flag_id}: ${JSON.stringify(f.severity)}`);
    expect(offenders).toEqual([]);
  });

  it('both emergency and urgent_consult are represented (taxonomy exercised, not collapsed)', () => {
    const sevs = new Set(RED_FLAGS.map(f => String(f.severity || '').toLowerCase()));
    expect(sevs.has('emergency')).toBe(true);
    expect(sevs.has('urgent_consult')).toBe(true);
  });
});
