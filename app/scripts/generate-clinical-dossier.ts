/**
 * Build the dossiers a clinician signs.
 *
 * GT-4 in the store plan is one table row — "clinical review" — and it carries the
 * longest human lead time in the project. A reviewer cannot sign a JSON file, and
 * asking one to read the app is how a week becomes a month. So this extracts every
 * claim the app makes at a user, verbatim, one row each, with the exact path back
 * to the source so a correction can be applied without hunting.
 *
 * It extracts. It never edits, paraphrases, or summarises a clinical statement:
 * a dossier that improves the wording on its way out is a dossier that gets the
 * wrong text signed.
 *
 * Run: npx tsx scripts/generate-clinical-dossier.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'clinical-review');

const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const esc = (s: unknown) =>
    String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** Every dossier carries the same instructions and the same signature block. */
function frame(opts: {
    title: string;
    reviewer: string;
    source: string;
    intro: string;
    body: string;
    count: number;
}): string {
    return `# ${opts.title}

> **À l'attention de : ${opts.reviewer}**

## Ce qui vous est demandé

${opts.intro}

**${opts.count} affirmations** sont listées ci-dessous. Pour chacune, trois réponses possibles :

| | Signification |
|---|---|
| **OK** | L'affirmation peut être publiée telle quelle |
| **CORRIGER** | Écrivez le texte de remplacement dans la colonne « Correction » |
| **RETIRER** | L'affirmation doit disparaître de l'application |

Une case laissée vide vaut **non revue** — l'affirmation ne sera pas publiée.

Vous n'avez pas à ouvrir l'application ni à lire de code. La colonne « Source »
indique où vit chaque texte, pour que votre correction soit appliquée exactement
là où il faut, sans interprétation.

**Source de vérité :** \`${opts.source}\`
**Généré le :** ${new Date().toISOString().slice(0, 10)} par \`scripts/generate-clinical-dossier.ts\`

---

${opts.body}

---

## Signature

En signant, vous attestez avoir relu les ${opts.count} affirmations ci-dessus et
validé celles marquées OK, dans le périmètre décrit en tête de ce document.

| | |
|---|---|
| **Nom** | |
| **Qualification / n° d'ordre** | |
| **Date** | |
| **Périmètre signé** | ${opts.title} |
| **Signature** | |

Cette attestation sera recopiée dans le message du commit qui active le contenu
dans l'application. Aucun contenu de ce dossier n'est publié avant.
`;
}

// ─────────────────────────────────────────────────────────── compléments

function supplements() {
    const rows = read('src/data/supplements_db.json') as any[];
    const body =
        `| # | Complément | Innocuité déclarée | Dose indiquée à l'utilisatrice | OK / CORRIGER / RETIRER | Correction |\n` +
        `|---|---|---|---|---|---|\n` +
        rows
            .map(
                (s, i) =>
                    `| ${i + 1} | **${esc(s.name_fr)}** | \`${esc(s.pregnancy_safety)}\` | ${esc(
                        s.typical_dose_text_fr,
                    )} | | |`,
            )
            .join('\n') +
        `\n\n### Notes longues affichées avec chaque complément\n\n` +
        rows
            .map(
                (s, i) =>
                    `**${i + 1}. ${esc(s.name_fr)}** — \`supplements_db.json[${i}].pregnancy_notes_fr\`\n\n> ${String(
                        s.pregnancy_notes_fr ?? '(aucune)',
                    ).trim()}\n`,
            )
            .join('\n');

    return frame({
        title: 'Dossier de revue — Compléments alimentaires',
        reviewer: 'sage-femme ou gynécologue-obstétricien·ne',
        source: 'src/data/supplements_db.json',
        intro:
            "L'application affiche, pour chaque complément, une mention d'innocuité pendant la grossesse et une posologie. " +
            "Ce sont les affirmations les plus directement actionnables de toute l'application : une utilisatrice peut " +
            'lire une dose et la suivre. Elles n\'ont jamais été relues par un professionnel.',
        body,
        count: rows.length,
    });
}

// ─────────────────────────────────────────────────────────── triage

function triage() {
    // Imported, not text-sliced: the array literal sits behind a `RedFlag[]`
    // annotation, so the first bracket after the declaration is the type's, and a
    // dossier built from a mis-sliced source is worse than no dossier at all.
    const { RED_FLAGS } = require('../src/data/chatbot_data') as { RED_FLAGS: any[] };
    const flags = RED_FLAGS;

    const bySeverity = (s: string) => flags.filter(f => f.severity === s);

    const table = (list: any[]) =>
        `| # | Signe | Message envoyé à l'utilisatrice | Sources citées | OK / CORRIGER / RETIRER | Correction |\n` +
        `|---|---|---|---|---|---|\n` +
        list
            .map(
                (f, i) =>
                    `| ${i + 1} | **${esc(f.label_fr)}**<br>\`${esc(f.red_flag_id)}\` | ${esc(
                        f.standard_message_fr,
                    )} | ${f.sources ? esc(f.sources) : '**⚠️ aucune**'} | | |`,
            )
            .join('\n');

    const unsourced = flags.filter(f => !f.sources).length;

    const body =
        (unsourced
            ? `> ⚠️ **${unsourced} des ${flags.length} signes n'ont aucune source citée.** Ils sont signalés\n` +
              `> dans les tableaux ci-dessous. Une orientation vers les urgences sans référence est le premier\n` +
              `> endroit à regarder.\n\n`
            : '') +
        `## Comment l'assistant décide\n\n` +
        `Trois niveaux, du plus grave au moins grave. Quand plusieurs signes sont détectés\n` +
        `dans un même message, **le plus grave l'emporte** :\n\n` +
        `| Niveau | Priorité | Ce que l'application dit de faire |\n|---|---|---|\n` +
        `| \`emergency\` | 3 | Urgences immédiates |\n| \`urgent_consult\` | 2 | Consulter sans attendre |\n` +
        `| autre | 1 | Information, pas d'orientation d'urgence |\n\n` +
        `**La question qui vous est posée pour chaque ligne n'est pas seulement « le message est-il correct ? »\n` +
        `mais « le niveau est-il le bon ? ». Un signe classé trop bas retarde une prise en charge ;\n` +
        `classé trop haut, il envoie aux urgences une femme qui n'en avait pas besoin.**\n\n` +
        `---\n\n## Niveau \`emergency\` — ${bySeverity('emergency').length} signes\n\n` +
        table(bySeverity('emergency')) +
        `\n\n---\n\n## Niveau \`urgent_consult\` — ${bySeverity('urgent_consult').length} signes\n\n` +
        table(bySeverity('urgent_consult')) +
        (bySeverity('emergency').length + bySeverity('urgent_consult').length < flags.length
            ? `\n\n---\n\n## Autres niveaux\n\n` +
              table(flags.filter(f => !['emergency', 'urgent_consult'].includes(f.severity)))
            : '');

    return frame({
        title: "Dossier de revue — Triage de l'assistant",
        reviewer: 'sage-femme ou gynécologue-obstétricien·ne',
        source: 'src/data/chatbot_data.ts (RED_FLAGS)',
        intro:
            "L'assistant lit ce que l'utilisatrice écrit et, sur détection de certains signes, l'oriente : " +
            'urgences, consultation sans délai, ou simple information. Ce dossier liste chaque signe, le message ' +
            "renvoyé, et surtout le niveau d'urgence attribué.",
        body,
        count: flags.length,
    });
}

// ─────────────────────────────────────────────────────────── ramadan

function ramadan() {
    const j = read('src/data/ramadan_pregnancy_guidance.json');
    const tri = j.trimesters as any[];

    const list = (arr: unknown, label: string) =>
        Array.isArray(arr) && arr.length
            ? `\n**${label}**\n\n` + arr.map((x: any) => `- ${esc(typeof x === 'string' ? x : x.fr ?? JSON.stringify(x))}`).join('\n') + '\n'
            : '';

    const body =
        `> ⚠️ Ce contenu porte, dans le fichier source, le marqueur \`"review_status": "${esc(
            j._meta?.review_status ?? j.review_status,
        )}"\`.\n` +
        `> L'écran correspondant est **désactivé dans l'application** et le restera jusqu'à la signature de ce dossier.\n\n` +
        `## Recommandation par trimestre\n\n` +
        tri
            .map(
                (t, i) =>
                    `### ${i + 1}. ${esc(t.label_fr)} (semaines ${esc(t.weeks)})\n\n` +
                    `**Risques énoncés :** ${esc(
                        Array.isArray(t.key_risks) ? t.key_risks.join(' · ') : t.key_risks,
                    )}\n\n` +
                    `**Recommandation affichée (FR) :**\n\n> ${String(t.recommendation_fr).trim()}\n\n` +
                    `**Traduction arabe affichée :**\n\n> ${String(t.recommendation_ar).trim()}\n\n` +
                    `**Traduction tunisienne affichée :**\n\n> ${String(t.recommendation_tn).trim()}\n\n` +
                    `| Verdict | |\n|---|---|\n| OK / CORRIGER / RETIRER | |\n| Correction | |\n`,
            )
            .join('\n---\n\n') +
        list(j.break_fast_warning_signs, 'Signes devant faire rompre le jeûne') +
        list(j.suhoor_tips, 'Conseils suhoor') +
        list(j.iftar_tips, 'Conseils iftar');

    return frame({
        title: 'Dossier de revue — Ramadan et grossesse',
        reviewer:
            'sage-femme ou gynécologue-obstétricien·ne, **et** un référent religieux qualifié',
        source: 'src/data/ramadan_pregnancy_guidance.json',
        intro:
            "Jeûner enceinte n'est pas un sujet sur lequel une application peut se prononcer seule. " +
            "L'écran est écrit, traduit en quatre langues et fonctionnel, mais il est **éteint** : il affiche " +
            'lui-même un bandeau disant que son contenu attend une revue. Deux avis sont nécessaires et ils ne ' +
            "portent pas sur la même chose — le risque médical d'une part, la position religieuse d'autre part.",
        body,
        count: tri.length,
    });
}

// ─────────────────────────────────────────────────────────── halal

function halal() {
    const locales = ['fr', 'en', 'ar', 'tn'] as const;
    const packs = Object.fromEntries(
        locales.map(l => [l, read(`src/i18n/locales/${l}/cycle8.json`).forbiddenFoodsHalal]),
    ) as Record<string, any>;
    const keys = Object.keys(packs.fr.items);

    const body =
        `> ⚠️ Cette section est **désactivée dans l'application**. Elle n'était affichée qu'en arabe et en\n` +
        `> tunisien, c'est-à-dire précisément au public le plus susceptible d'agir dessus, et portait la mention\n` +
        `> « ${esc(packs.fr.draftNote)} »\n\n` +
        `**Introduction affichée :** ${esc(packs.fr.intro)}\n\n` +
        keys
            .map(
                (k, i) =>
                    `### ${i + 1}. ${esc(packs.fr.items[k].label)}\n\n` +
                    locales
                        .map(l => `- **${l}** — ${esc(packs[l].items[k].label)} : ${esc(packs[l].items[k].note)}`)
                        .join('\n') +
                    `\n\n| Verdict | |\n|---|---|\n| OK / CORRIGER / RETIRER | |\n| Correction | |\n` +
                    `\n*Source : \`src/i18n/locales/<langue>/cycle8.json\` → \`forbiddenFoodsHalal.items.${k}\`*\n`,
            )
            .join('\n---\n\n');

    return frame({
        title: 'Dossier de revue — Aliments à éviter, perspective halal',
        reviewer: 'un imam **et** un·e diététicien·ne',
        source: 'src/i18n/locales/{fr,en,ar,tn}/cycle8.json → forbiddenFoodsHalal',
        intro:
            'Deux avis distincts sont demandés sur le même contenu, et ils ne se recouvrent pas : la licéité ' +
            "relève du premier relecteur, l'exactitude nutritionnelle et les substituts du second. C'est pourquoi " +
            'ce dossier est séparé de celui du Ramadan — les personnes ne sont pas les mêmes et les deux accords ' +
            "n'arriveront pas ensemble.",
        body,
        count: keys.length,
    });
}

// ─────────────────────────────────────────────────────────── aliments

function forbiddenFoods() {
    const rows = read('src/data/forbidden_foods.json') as any[];
    const body =
        `| # | Aliment | Risque énoncé | OK / CORRIGER / RETIRER | Correction |\n|---|---|---|---|---|\n` +
        rows
            .map(
                (f, i) =>
                    `| ${i + 1} | **${esc(f.name_fr)}**<br>*${esc(f.category_name_fr)}* | ${esc(
                        f.risk_fr ?? f.risk,
                    )} | | |`,
            )
            .join('\n') +
        `\n\n### Explications longues\n\n` +
        rows
            .map(
                (f, i) =>
                    `**${i + 1}. ${esc(f.name_fr)}** — \`forbidden_foods.json[${i}].details_fr\`\n\n> ${String(
                        f.details_fr ?? '(aucune)',
                    ).trim()}\n`,
            )
            .join('\n');

    return frame({
        title: 'Dossier de revue — Aliments à éviter',
        reviewer: 'sage-femme, gynécologue-obstétricien·ne ou diététicien·ne',
        source: 'src/data/forbidden_foods.json',
        intro:
            "L'écran « aliments à éviter » est l'un des plus consultés d'une application de grossesse. " +
            'Chaque entrée énonce un risque sanitaire ; ce sont des affirmations médicales.',
        body,
        count: rows.length,
    });
}

// ─────────────────────────────────────────────────────────── profil médical

function medicalProfile() {
    const locales = ['fr', 'en', 'ar', 'tn'] as const;
    const packs = Object.fromEntries(
        locales.map(l => [l, read(`src/i18n/locales/${l}/common.json`).medicalProfile]),
    ) as Record<string, any>;
    const keys = ['title', 'intro', 'gestationalDiabetes', 'hypertension', 'twins', 'privacyNote'];

    const body =
        `L'application demande désormais à l'utilisatrice, une fois pendant l'inscription et modifiable ensuite,\n` +
        `si un professionnel lui a signalé un diabète gestationnel, une hypertension de grossesse ou une grossesse\n` +
        `gémellaire. La réponse ne sert qu'à ajuster les rappels proposés.\n\n` +
        `**Le point de vigilance :** la formulation ne doit à aucun moment demander à l'utilisatrice de\n` +
        `s'auto-diagnostiquer, ni laisser entendre que l'application évalue un risque. Elle doit uniquement\n` +
        `recueillir ce qu'un professionnel lui a déjà dit.\n\n` +
        keys
            .map(
                (k, i) =>
                    `### ${i + 1}. \`${k}\`\n\n` +
                    locales.map(l => `- **${l}** — ${esc(packs[l][k])}`).join('\n') +
                    `\n\n| Verdict | |\n|---|---|\n| OK / CORRIGER / RETIRER | |\n| Correction | |\n`,
            )
            .join('\n---\n\n');

    return frame({
        title: 'Dossier de revue — Questions du profil médical',
        reviewer: 'sage-femme ou gynécologue-obstétricien·ne',
        source: 'src/i18n/locales/{fr,en,ar,tn}/common.json → medicalProfile',
        intro:
            'Une question posée sur un diagnostic est du contenu médical, même quand elle ne fait que le recueillir. ' +
            'Ces six textes sont les seuls du dossier qui ont été écrits récemment ; les autres sont en place depuis ' +
            "l'origine de l'application.",
        body,
        count: keys.length,
    });
}

// ─────────────────────────────────────────────────────────── README

function readme(counts: Record<string, number>) {
    // The six dossiers above were the whole packet, and a reviewer who signed all of
    // them would never have seen the articles, the weeks or the growth figures — the
    // bulk of what the app says. Those three sources are named here, with what to read
    // in each, until they get extracted dossiers of their own.
    return `# Revue clinique — Mama & Bébé v1.0

Ce dossier existe pour une raison simple : **aucun contenu médical de cette application
n'a jamais été relu par un professionnel de santé.** Tout le reste est prêt.

Apple (guideline 1.4.1) et Google Play (« Health apps ») exigent l'exactitude médicale.
Au-delà de la conformité, c'est une application de grossesse : elle énonce des doses,
oriente vers les urgences et se prononce sur l'alimentation.

## Qui signe quoi

Trois relecteurs, indépendants. Ils ne se relisent pas entre eux et leurs accords
n'arriveront pas ensemble.

| Relecteur | Dossiers | Affirmations |
|---|---|---|
| **Sage-femme ou gynécologue-obstétricien·ne** | \`SUPPLEMENTS\`, \`TRIAGE\`, \`FORBIDDEN_FOODS\`, \`MEDICAL_PROFILE\`, et la moitié médicale de \`RAMADAN\` | ${
        counts.supplements + counts.triage + counts.foods + counts.profile
    } + ${counts.ramadan} |
| **Référent religieux qualifié** | la moitié religieuse de \`RAMADAN\` | ${counts.ramadan} |
| **Imam et diététicien·ne** | \`HALAL\` | ${counts.halal} |

La sage-femme ou le·la gynécologue relit aussi les trois sources de la section
« Pas encore en dossier » ci-dessous : elles ne sont pas comptées dans ce tableau.

## Dans quel ordre

1. **\`TRIAGE_DOSSIER.md\` en premier.** C'est le seul contenu qui peut retarder une prise
   en charge. Un signe classé trop bas est le pire défaut possible de cette application.
2. **\`SUPPLEMENTS_DOSSIER.md\` ensuite.** Ce sont des doses qu'une utilisatrice peut suivre.
3. **\`FORBIDDEN_FOODS_DOSSIER.md\`** et **\`MEDICAL_PROFILE_DOSSIER.md\`** — plus courts.
4. **Les articles, les semaines et la table de croissance** (section suivante). Ils sont
   visibles dès la première publication, comme tout ce qui précède.
5. **\`RAMADAN_DOSSIER.md\`** et **\`HALAL_DOSSIER.md\`** en dernier : les écrans concernés sont
   déjà **éteints dans l'application** et le resteront jusqu'à signature. Ils ne bloquent
   donc pas une première publication.

## Pas encore en dossier

Trois sources de contenu médical n'ont pas encore de dossier extrait. Elles sont à relire
dans le fichier lui-même ; chaque ligne y porte un identifiant qui sert de référence
pour une correction.

| Source | Ce qui est à relire |
|---|---|
| \`src/data/articles_db.json\` | **${counts.articles} articles** : titre, résumé et corps en français (\`content_markdown_fr\`), les traductions anglaise, arabe et tunisienne, le niveau de risque attribué à chacun (\`risk_level\`) et ses sources s'il en cite. Repère : \`article_id\`. L'article \`art_003\` (jeûne du Ramadan) est masqué dans l'application avec l'écran Ramadan ; il relève aussi du référent religieux et ne revient qu'avec la signature de \`RAMADAN\`. |
| \`src/data/weeks_db.json\` | **${counts.weeks} semaines** : développement du bébé (\`baby_dev_text_*\`), changements pour la mère (\`mom_body_text_*\`), signes d'alerte (\`warnings_text_*\`), et les articles et compléments recommandés pour la semaine. Repère : \`week_number\`. |
| \`src/utils/fetalGrowth.ts\` | La table de taille et de poids du fœtus que tous les écrans affichent (colonnes \`baby_size_cm\` et \`baby_weight_g\` de \`weeks_db.json\`) : la courbe de référence citée dans le fichier, la convention de mesure (vertex-coccyx jusqu'à la semaine 20, vertex-talon ensuite) et la numérotation des semaines (semaines d'aménorrhée). |

Tant que ces trois sources ne sont pas signées, aucun texte public (site, fiches des
stores) ne dit que le contenu est validé ou relu par un professionnel.

## Ce qui se passe après une signature

L'attestation est recopiée dans le message du commit qui active le contenu. Pour les
deux écrans éteints, le même commit lève le drapeau **et** retire le bandeau
« contenu en cours de revue ».

**La règle qui ne se négocie pas :** personne ne retire un bandeau d'avertissement pour
débloquer un écran. Le bandeau part avec la signature, ou il reste.

## Comment corriger

Chaque affirmation porte le chemin exact de sa source. Une correction écrite dans la
colonne prévue est appliquée à cet endroit précis, sans réinterprétation. Vous n'avez
ni à ouvrir l'application, ni à lire de code.

---

*Généré le ${new Date().toISOString().slice(0, 10)} par \`scripts/generate-clinical-dossier.ts\`.
Régénérer après toute modification des données sources.*
`;
}

// ─────────────────────────────────────────────────────────── main

fs.mkdirSync(OUT, { recursive: true });

const supplementsCount = (read('src/data/supplements_db.json') as any[]).length;
const foodsCount = (read('src/data/forbidden_foods.json') as any[]).length;
const ramadanCount = (read('src/data/ramadan_pregnancy_guidance.json').trimesters as any[]).length;
const halalCount = Object.keys(
    read('src/i18n/locales/fr/cycle8.json').forbiddenFoodsHalal.items,
).length;
const triageDoc = triage();
const triageCount = Number(/\*\*(\d+) affirmations\*\*/.exec(triageDoc)?.[1] ?? 0);

const files: Array<[string, string]> = [
    ['SUPPLEMENTS_DOSSIER.md', supplements()],
    ['TRIAGE_DOSSIER.md', triageDoc],
    ['FORBIDDEN_FOODS_DOSSIER.md', forbiddenFoods()],
    ['MEDICAL_PROFILE_DOSSIER.md', medicalProfile()],
    ['RAMADAN_DOSSIER.md', ramadan()],
    ['HALAL_DOSSIER.md', halal()],
    [
        'README.md',
        readme({
            supplements: supplementsCount,
            triage: triageCount,
            foods: foodsCount,
            profile: 6,
            ramadan: ramadanCount,
            halal: halalCount,
            articles: (read('src/data/articles_db.json') as any[]).length,
            weeks: (read('src/data/weeks_db.json') as any[]).length,
        }),
    ],
];

for (const [name, content] of files) {
    fs.writeFileSync(path.join(OUT, name), content, 'utf8');
    console.log(`  ${name}  ${(content.length / 1024).toFixed(1)} Ko`);
}
console.log(`\n${files.length} fichiers écrits dans docs/clinical-review/`);
