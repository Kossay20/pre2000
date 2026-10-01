/**
 * Tunisian (tn) strings speak to the mother in one register, without translator notes.
 *
 * The tn locale was first written as Modern Standard Arabic with the Derja word added
 * in brackets — "بحث (لوج)", "مرحباً (عسلامة)", "آمن (لاباس)". Those brackets are a
 * translator's working note, not UI copy: a user reads two words for one idea on every
 * button and title. Several strings also addressed the reader in the masculine
 * ("قلّل منه", "تحب كي تمسح") in an app whose every user is a pregnant woman, sometimes
 * inside the same sentence as a feminine form.
 *
 * This suite guards both: the glosses the audit found must not come back, no short
 * label may be "word (word)" unless the bracket is a unit, "optional" or one the French
 * source has too, and the masculine forms the audit cited stay feminine.
 */
import fs from 'fs';
import path from 'path';
import { RED_FLAGS } from '../../data/chatbot_data';

const TN_DIR = path.join(__dirname, '..', 'locales', 'tn');
const FR_DIR = path.join(__dirname, '..', 'locales', 'fr');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

type Entry = { where: string; value: string };

const walk = (node: unknown, where: string, out: Entry[]) => {
    if (typeof node === 'string') out.push({ where, value: node });
    else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${where}[${i}]`, out));
    else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`, out);
    }
};

const localeEntries = (dir: string): Entry[] => {
    const out: Entry[] = [];
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        walk(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), file, out);
    }
    return out;
};

const tnLocaleEntries = (): Entry[] => localeEntries(TN_DIR);

// A bracket the French source carries under the same key is part of the copy — which
// length is measured ("Taille (tête-talons)"), a qualifier ("(généralement tête en bas)"),
// the name of a regulation ("(RGPD)"). A translator's note exists only in the translation.
const frByKey = new Map(localeEntries(FR_DIR).map(e => [e.where, e.value]));
const sourceHasBracket = (where: string) => /\([^()]+\)/.test(frByKey.get(where) ?? '');

const tnDataEntries = (): Entry[] => {
    const out: Entry[] = [];
    for (const file of ['forbidden_foods.json', 'supplements_db.json']) {
        const all: Entry[] = [];
        walk(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')), file, all);
        out.push(...all.filter(e => e.where.endsWith('_tn')));
    }
    RED_FLAGS.forEach((rf: any, i: number) => {
        if (rf.label_tn) out.push({ where: `RED_FLAGS[${i}].label_tn`, value: rf.label_tn });
        if (rf.standard_message_tn) out.push({ where: `RED_FLAGS[${i}].standard_message_tn`, value: rf.standard_message_tn });
    });
    return out;
};

// A bracket that is part of the copy, not a translation of the word before it.
const LEGIT_BRACKET = new Set(['اختياري', 'اختيارية', 'كغ', 'سم', 'مل', 'لتر', 'أيام']);

const CITED_GLOSSES = [
    'بحث (لوج)', 'الوزن (الميزان)', 'مرحباً (عسلامة)', 'التغذية (الماكلة)',
    'الرياضة (المشي)', 'آمن (لاباس)', 'يُراقب (رد بالك)', 'طوارئ (أورجونس)',
    'الطفل (البيبي)', 'جسمك (بدنك)', 'حسناً (باهي)', 'نعم (إيه)', 'حذف (فسخ)',
    'إرسال (ابعث)', '(السّاج فام)', '(الكونترول)', '(العوارض)', '(الرقاد)',
    'خيارة (فقوس)', 'بطيخة (دلاع)', 'تورم (إديميا)', '(العظم الني)',
];

const CITED_MASCULINE = [
    'قلّل منه', 'تحب كي تمسح', 'تنجم تنحّي', 'بلا ما تفسخ ', 'حتى تعمل حساب',
    'ما تبداش', 'وما توقفش', 'تنجم تستعمل', 'تحب تخرج', 'تحب تخلّي',
    'ما تنجمش تسجّل',
];

describe('tn register', () => {
    const entries = [...tnLocaleEntries(), ...tnDataEntries()];

    it('has none of the translator-note glosses the audit cited', () => {
        const hits = entries
            .flatMap(e => CITED_GLOSSES.filter(g => e.value.includes(g)).map(g => `${e.where}: ${g}`));
        expect(hits).toEqual([]);
    });

    it('has no short label shaped "word (gloss)"', () => {
        const shape = /^([^()]+?)\s*\(([^()،,0-9{}]+)\)\s*$/;
        const hits = tnLocaleEntries()
            .filter(e => {
                const m = e.value.match(shape);
                if (!m) return false;
                const before = m[1].trim().split(/\s+/).length;
                return before <= 2 && !LEGIT_BRACKET.has(m[2].trim()) && !sourceHasBracket(e.where);
            })
            .map(e => `${e.where}: ${e.value}`);
        expect(hits).toEqual([]);
    });

    it('addresses the mother in the feminine where the audit found masculine forms', () => {
        const hits = entries.flatMap(e =>
            CITED_MASCULINE.filter(m => e.value.includes(m)).map(m => `${e.where}: ${m}`),
        );
        expect(hits).toEqual([]);
    });

    it('spells imperatives with a hamzat wasl, not a hamza on the alif', () => {
        const hits = entries
            .filter(e => /(^|\s)(أستشيري|إتصلي|إختاري|أشربي)/.test(e.value))
            .map(e => e.where);
        expect(hits).toEqual([]);
    });

    it('keeps the feminine "minimise" label on forbidden foods', () => {
        const ff = JSON.parse(fs.readFileSync(path.join(TN_DIR, 'forbiddenFoods.json'), 'utf8'));
        expect(ff.severity.medium).toContain('قلّلي');
    });
});
