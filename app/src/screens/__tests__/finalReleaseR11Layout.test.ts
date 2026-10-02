/**
 * Final-release round 11, "layout" lot: regressions of the round-9/10 fix waves (Home greeting,
 * Ma Journee pill, Baby Evolution dots) and the 44pt / spacing leftovers. Source-level like
 * finalReleaseR9Home.test.ts: the screens are .tsx and the repo ships no React renderer.
 */
import * as fs from 'fs';
import * as path from 'path';
import weeks from '../../data/weeks_db.json';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const block = (src: string, style: string) => src.split(`${style}: {`)[1].split('\n    },')[0];

describe('C-057 / A-049 / A-050 / B-049 — Home greeting', () => {
  const styles = read('src/screens/HomeScreen.styles.ts');

  it('clears the avatar with the same physical padding on both sides (centred on the page axis)', () => {
    const b = block(styles, 'headerTextContainer');
    expect(b).toMatch(/paddingLeft: 76, paddingRight: 76/);
    expect(b).not.toMatch(/paddingStart|paddingEnd/);
    // avatar footprint: 50pt wide at right: 16 -> 66pt from the edge; 76 leaves a 10pt gap
    expect(block(styles, 'profileButtonContainer')).toMatch(/right: 16/);
    expect(block(styles, 'profileButton')).toMatch(/width: 50/);
  });

  it('wraps or shrinks a long name instead of shifting the block', () => {
    expect(read('src/screens/HomeScreen.tsx')).toMatch(/styles\.greeting\} numberOfLines=\{2\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}/);
  });
});

describe('B-045 — Ma Journee pill content stays inside the pill', () => {
  const src = read('src/components/home/DailyRoutinesTracker.tsx');

  it('lets the row shrink and fill the pill so the 13pt text wraps', () => {
    expect(block(src, 'contentRow')).toMatch(/flexShrink: 1/);
    expect(block(src, 'contentRow')).toMatch(/minWidth: 0/);
    expect(block(src, 'soloContentRow')).toMatch(/flex: 1/);
    expect(src).toMatch(/isSharedContext \? styles\.sharedContentRow : styles\.soloContentRow/);
    expect(block(src, 'leftContent')).toMatch(/flexShrink: 1/);
  });
});

describe('B-046 / C-058 / C-063 — Baby Evolution', () => {
  const src = read('src/screens/BabyEvolutionScreen.tsx');

  it('keeps the nine dots on one row (no wrap) with 44pt-high targets', () => {
    expect(block(src, 'progressContainer')).not.toMatch(/flexWrap:\s*'wrap'/);
    const dot = block(src, 'progressDotTouch');
    expect(dot).toMatch(/flex: 1/);
    expect(dot).toMatch(/maxWidth: 44/);
    expect(dot).toMatch(/height: 44/);
    expect(src).toMatch(/hitSlop=\{\{ left: 2, right: 2 \}\}/);
  });

  it('prints a short dedicated title, not the Home button label', () => {
    expect(src).toMatch(/t\('home\.babyEvolutionTitle'\)/);
    expect(src).not.toMatch(/<Text style=\{styles\.title\}[^>]*>\{t\('home\.babyEvolution'\)\}/);
    for (const l of ['fr', 'en', 'ar', 'tn']) {
      const home = JSON.parse(read(`src/i18n/locales/${l}/home.json`));
      expect(typeof home.babyEvolutionTitle).toBe('string');
      expect(home.babyEvolutionTitle.length).toBeLessThanOrEqual(20);
    }
    expect(JSON.parse(read('src/i18n/locales/fr/home.json')).babyEvolutionTitle).toBe('Évolution du bébé');
  });
});

describe('B-050 / E-059 — Ma Journee top padding under the sticky bar', () => {
  it('the section container has top padding', () => {
    expect(block(read('src/components/tasks/MyDaySection.tsx'), 'container')).toMatch(/paddingTop: 16/);
  });
});

describe('C-060 — size comparison emoji do not name another fruit', () => {
  const rows = weeks as unknown as { week_number: number; emoji: string }[];
  const emoji = (w: number) => rows.find(r => r.week_number === w)!.emoji;

  it('raspberry, papaya and kohlrabi no longer show strawberry, mango and leafy greens', () => {
    expect(emoji(8)).not.toBe('🍓');
    expect(emoji(22)).not.toBe('🥭');
    expect(emoji(27)).not.toBe('🥬');
  });
});

describe('E-060 / E-054 — Calendar', () => {
  const styles = read('src/screens/CalendarScreen.styles.ts');

  it('the empty state starts high enough to keep its subtitle above the tab bar at 375x667', () => {
    const b = block(styles, 'emptyState');
    expect(b).toMatch(/marginTop: 16/);
    expect(b).toMatch(/paddingVertical: 12/);
  });

  it('the month list stops above the add button: the button covers no day cell (E-008 over E-054)', () => {
    expect(block(styles, 'monthListWithFab')).toMatch(/paddingBottom: MONTH_FAB_CLEARANCE/);
    expect(read('src/screens/CalendarScreen.tsx')).toMatch(/calendarView === 'month' && styles\.monthListWithFab/);
  });
});

describe('E-006 / D-055 — 44pt targets in the style, not hitSlop only', () => {
  it('Articles/Resources filter chips are 44pt tall', () => {
    expect(block(read('src/screens/ArticlesListScreen.tsx'), 'chip')).toMatch(/minHeight: 44/);
  });

  it('the Health "Ajouter" pills are 44pt tall', () => {
    expect(block(read('src/screens/HealthDashboardScreen.styles.ts'), 'addButton')).toMatch(/minHeight: 44/);
  });

  it('emergency contact call / delete buttons are 44x44 with a gap between them', () => {
    const src = read('src/components/profile/EmergencyContactsSection.tsx');
    expect(block(src, 'actionButton')).toMatch(/width: 44,\s*height: 44/);
    expect(block(src, 'actions')).toMatch(/gap: 16/);
  });
});

describe('E-061 / C-064 — chat scroll anchor', () => {
  it('leaves 8pt above the anchored question and anchors red-flag replies too', () => {
    const src = read('src/screens/ChatbotScreen.tsx');
    expect(src.match(/viewPosition: 0, viewOffset: 8/g)).toHaveLength(2);
    expect(read('src/utils/chatEmergency.ts')).not.toMatch(/type === 'red_flag'\) return 'end'/);
  });
});
