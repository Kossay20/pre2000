/**
 * Final-release round 6: a11y roll-up and layout (E-008, E-019, B-021/B-032, E56).
 * Source-level wiring like finalReleaseR5Content.test.ts: the screens are .tsx and the repo
 * ships no React renderer.
 */
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('B-021/B-032 — the Reminders tab view cannot be scrolled sideways', () => {
  it('clips instead of hiding overflow on web', () => {
    const src = read('src/screens/RemindersScreen.tsx');
    expect(src).toMatch(/overflow: 'clip'/);
    expect(src).toMatch(/Platform\.OS === 'web'/);
  });
});

describe('E56 — statistics range chips and locked badges', () => {
  const src = read('src/screens/reminders/StatisticsScreen.tsx');

  it('names the 7/30-day chips and exposes their selected state', () => {
    expect(src).toMatch(/accessibilityRole="tablist"/);
    expect(src.match(/accessibilityRole="tab"/g)?.length).toBe(2);
    expect(src).toMatch(/accessibilityState=\{\{ selected: timeRange === 'week' \}\}/);
    expect(src).toMatch(/accessibilityState=\{\{ selected: timeRange === 'month' \}\}/);
  });

  it('does not fade a locked badge as a whole (text contrast)', () => {
    expect(src).toMatch(/badgeLocked: \{\},/);
    expect(src).toMatch(/badgeIconLocked: \{\s*opacity: 0\.5/);
  });
});

describe('E-008 / E-019 — 280 pt layouts', () => {
  it('Home greeting starts below the avatar on a narrow screen', () => {
    const src = read('src/screens/HomeScreen.styles.ts');
    expect(src).toMatch(/headerTextContainer: \{[^}]*width < 340 \? \{ marginTop: 54 \}/s);
  });

  it('the appointment date field is wider than the time field', () => {
    const src = read('src/screens/AddAppointmentScreen.tsx');
    expect(src).toMatch(/\{ flex: 3 \}[\s\S]*dateLabel/);
    expect(src).toMatch(/\{ flex: 2 \}[\s\S]*timeLabel/);
  });
});

describe('C-041 — one inline call button across the conversation', () => {
  it('only the newest alert bubble draws the call button', () => {
    const src = read('src/screens/ChatbotScreen.tsx');
    expect(src).toMatch(/const latestAlertId = /);
    expect(src).toMatch(/emergencyNumber && !pinCall && item\.id === latestAlertId/);
  });
});
