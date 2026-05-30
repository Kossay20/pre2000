/**
 * CLINICAL-SAFETY consistency: the chatbot disclaimer banner must list the SAME per-country
 * emergency numbers the app actually dials (clinicalChecks.getEmergencyNumber). A live E2E
 * visual review (2026-05-30) caught the AR disclaimer showing Algeria=14 / Morocco=150 while
 * the web-verified resolver dials Algeria=16 (SAMU) / Morocco=141 (SAMU) — a dangerous mismatch
 * for a user in distress. This test locks the two sources together.
 */
import arCommon from '../locales/ar/common.json';
import { getEmergencyNumber } from '../../utils/clinicalChecks';

describe('chatDisclaimer emergency numbers ↔ resolver (clinical-safety)', () => {
  const disclaimer: string = (arCommon as any).chatDisclaimer;

  it('AR disclaimer lists the resolver SAMU numbers for TN / DZ / MA', () => {
    expect(disclaimer).toContain(`${getEmergencyNumber('TN')} (تونس)`);   // 190
    expect(disclaimer).toContain(`${getEmergencyNumber('DZ')} (الجزائر)`); // 16
    expect(disclaimer).toContain(`${getEmergencyNumber('MA')} (المغرب)`);  // 141
  });

  it('AR disclaimer no longer shows the wrong non-SAMU numbers (14 / 150)', () => {
    expect(disclaimer).not.toContain('14 (الجزائر)');
    expect(disclaimer).not.toContain('150 (المغرب)');
  });
});
