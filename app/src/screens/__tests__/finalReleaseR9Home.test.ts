/**
 * Final-release round 9, "home" lot: Home header and Ma Journee entry, calendar empty state,
 * card excerpts, hide/category glyphs. Source-level like finalReleaseR6Fixes.test.ts (the
 * screens are .tsx and the repo ships no React renderer); the excerpt helper is run for real.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getCardExcerpt } from '../../utils/cardExcerpt';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('getCardExcerpt (B-030 / C-046)', () => {
  const article = {
    title_fr: "Différentes méthodes d'accouchement",
    summary_fr: "# Les différentes méthodes d'accouchement  L'accouchement est une expérience unique.",
    summary_en: '# Different childbirth methods  Childbirth is a unique experience.',
    summary_ar: '# طرق الولادة المختلفة  الولادة تجربة فريدة.  على الرغم من ذلك',
  };

  it('drops the leading heading that restates the title', () => {
    expect(getCardExcerpt(article, 'summary', 'fr')).toBe("L'accouchement est une expérience unique.");
    expect(getCardExcerpt(article, 'summary', 'en')).toBe('Childbirth is a unique experience.');
  });

  it('collapses double spaces (Arabic)', () => {
    expect(getCardExcerpt(article, 'summary', 'ar')).toBe('الولادة تجربة فريدة. على الرغم من ذلك');
  });

  it('keeps a plain summary and a heading-only summary', () => {
    expect(getCardExcerpt({ summary_en: 'Contractions, water breaking...' }, 'summary', 'en')).toBe('Contractions, water breaking...');
    expect(getCardExcerpt({ summary_en: '# Only a title' }, 'summary', 'en')).toBe('Only a title');
  });

  it('is what the week recommendations card prints', () => {
    expect(read('src/screens/WeekRecommendationsScreen.tsx')).toMatch(/getCardExcerpt\(article, 'summary', i18n\.language\)/);
  });
});

describe('D-045 / E-030 — the Ma Journee entry', () => {
  const src = read('src/components/home/DailyRoutinesTracker.tsx');
  const home = read('src/screens/HomeScreen.tsx');

  it('spans the header instead of shrinking to its text', () => {
    expect(home).toMatch(/<View style=\{\{ marginTop: 12, alignSelf: 'stretch' \}\}>\s*<DailyRoutinesTracker/);
  });

  it('has a compact height, a readable label and a track with a width', () => {
    expect(src).toMatch(/paddingVertical: 8,\s*paddingHorizontal: 12,\s*minHeight: 44,/);
    expect(src).toMatch(/title: \{\s*fontSize: 13,/);
    expect(src).toMatch(/progressBarBackground: \{[^}]*width: '100%'/s);
  });

  it('draws vector icons, not the calendar / sparkles emoji (E-028)', () => {
    expect(src).not.toMatch(/📅|📆|🔔|✨/);
    expect(read('src/components/home/BabyGrowthCard.tsx')).not.toContain('📅');
  });
});

describe('Home header (A-047, B-044, C-049)', () => {
  const styles = read('src/screens/HomeScreen.styles.ts');
  const home = read('src/screens/HomeScreen.tsx');

  it('keeps the avatar clearance symmetric and physical (C-057 / A-049 / A-050 / B-049)', () => {
    // The avatar sits at a physical right: 16, so the clearance must not be logical start/end
    // (those flip under dir=rtl and ran the Arabic greeting under it) and must not be one-sided
    // (that moved the greeting off the page axis the week row is centred on).
    expect(styles).toMatch(/\{ paddingLeft: 76, paddingRight: 76 \}/);
    const header = styles.slice(styles.indexOf('headerTextContainer: {'), styles.indexOf('weekInfo: {'));
    expect(header).not.toMatch(/paddingStart|paddingEnd/);
    expect(styles).toMatch(/profileButtonContainer: \{[^}]*right: 16/s);
    expect(home).toMatch(/styles\.greeting\}\s+numberOfLines=\{2\}\s+adjustsFontSizeToFit/);
  });

  it('shows up to three lines of a recommendation title on a taller card', () => {
    expect(home).toMatch(/styles\.recTitle\} numberOfLines=\{3\}/);
    expect(styles).toMatch(/recommendationCard: \{[^}]*height: 164/s);
  });

  it('does not print the fruit emoji after the week topic', () => {
    expect(home).not.toMatch(/\.trim\(\)\} \{growth\.emoji\}/);
  });
});

describe('E-038 / E-054 / B-039 — Calendar', () => {
  const styles = read('src/screens/CalendarScreen.styles.ts');

  it('centres the lines of a wrapped empty-state title', () => {
    expect(styles).toMatch(/emptyStateText: \{[^}]*textAlign: 'center'/s);
    expect(styles).toMatch(/emptyStateSubtext: \{[^}]*textAlign: 'center'/s);
  });

  it('collapses the month stats card to a line on a short screen', () => {
    const screen = read('src/screens/CalendarScreen.tsx');
    expect(screen).toMatch(/compactMonthStats = useWindowDimensions\(\)\.height <= 700/);
    expect(screen).toMatch(/compact=\{compactMonthStats\}/);
  });

  it('the Today chip is a chip with a 14pt label, not a bar', () => {
    expect(styles).toMatch(/todayButton: \{[^}]*alignSelf: 'center'/s);
    expect(styles).toMatch(/todayButtonText: \{[^}]*fontSize: 14/s);
  });
});

describe('B-027 — glyphs say what they do', () => {
  it('Ma Journee hides a reminder with an eye-off icon, deletes a custom task with the bin', () => {
    const src = read('src/components/tasks/MyDaySection.tsx');
    expect(src).toMatch(/item\.type === 'custom'\s*\? <Text style=\{\{ fontSize: 16 \}\}>🗑️<\/Text>\s*: <Ionicons name="eye-off-outline"/);
  });

  it('a medical appointment card shows a stethoscope, not the memo glyph', () => {
    const src = read('src/components/calendar/EventCard.tsx');
    expect(src).toMatch(/event\.category === 'medical'\s*\? <MaterialCommunityIcons name="stethoscope"/);
    expect(src).not.toContain('📝');
  });
});

describe('E-006 — statistics', () => {
  const src = read('src/screens/reminders/StatisticsScreen.tsx');

  it('the 7/30 day chips are 44pt tall', () => {
    expect(src).toMatch(/rangeButton: \{\s*minHeight: 44,/);
  });

  it('the header takes the safe-area inset instead of 60pt of blank white', () => {
    expect(src).toMatch(/paddingTop: insets\.top \+ 16/);
  });
});

describe('C-026 — warning wording', () => {
  it('no week asks to "consult immediately your healthcare professional"', () => {
    expect(read('src/data/weeks_db.json')).not.toMatch(/Consult immediately\*\* your healthcare professional/);
  });
});
