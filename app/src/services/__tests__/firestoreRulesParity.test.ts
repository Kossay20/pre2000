/**
 * Non-regression test: firestore.rules ↔ source code parity.
 *
 * Pour chaque collection `collection(db, 'X')` ou `doc(db, 'X', ...)`
 * effectivement utilisée par le code applicatif, vérifie qu'elle est bien
 * déclarée dans `firestore.rules` (pattern `match /X/{...}`).
 *
 * Bloque la régression P1.1 (collections oubliées dans rules → écritures
 * silencieusement refusées en prod) et toute future divergence.
 *
 * Statique: aucune dépendance Firebase / RN — lecture FS uniquement.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const RULES_FILE = path.join(APP_ROOT, 'firestore.rules');
const SRC_DIR = path.join(APP_ROOT, 'src');

/** Collections that the code references through an indirect constant
 *  (the regex below cannot see them directly) and that we know are used. */
const KNOWN_INDIRECT_COLLECTIONS = [
    'weight_entries',   // WEIGHT_COLLECTION const in weightService.ts
    'deletionRequests', // DELETION_REQUESTS_COLLECTION const in accountDeletion.ts
];

/** Recursively gather all .ts / .tsx source files (excluding tests). */
const readAllTsFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            out.push(...readAllTsFiles(full));
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
};

/** Extract `match /collectionName/{...}` from rules content. */
const extractRulesCollections = (rulesContent: string): Set<string> => {
    const re = /match\s+\/([a-zA-Z_][a-zA-Z0-9_]*)\/\{[^}]+\}/g;
    return new Set([...rulesContent.matchAll(re)].map(m => m[1]));
};

/** Extract collections referenced as `collection(db, 'X', …)` or `doc(db, 'X', …)`. */
const extractCodeCollections = (sourceFiles: string[]): Set<string> => {
    const collectionRe = /\bcollection\(\s*db\s*,\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
    const docRe = /\bdoc\(\s*db\s*,\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
    const set = new Set<string>();
    for (const f of sourceFiles) {
        const content = fs.readFileSync(f, 'utf8');
        for (const m of content.matchAll(collectionRe)) set.add(m[1]);
        for (const m of content.matchAll(docRe)) set.add(m[1]);
    }
    for (const known of KNOWN_INDIRECT_COLLECTIONS) set.add(known);
    return set;
};

describe('firestore.rules ↔ code parity (P1.1 / P1.2 guard)', () => {
    let rulesContent: string;
    let rulesCollections: Set<string>;
    let codeCollections: Set<string>;

    beforeAll(() => {
        rulesContent = fs.readFileSync(RULES_FILE, 'utf8');
        rulesCollections = extractRulesCollections(rulesContent);
        const sourceFiles = readAllTsFiles(SRC_DIR);
        codeCollections = extractCodeCollections(sourceFiles);
    });

    it('finds the firestore.rules file', () => {
        expect(rulesContent.length).toBeGreaterThan(0);
    });

    it('extracts at least a few collections from rules', () => {
        expect(rulesCollections.size).toBeGreaterThanOrEqual(10);
    });

    it('extracts at least a few collections from code', () => {
        expect(codeCollections.size).toBeGreaterThanOrEqual(5);
    });

    it('every collection used by code is declared in firestore.rules', () => {
        const missing: string[] = [];
        for (const col of codeCollections) {
            if (!rulesCollections.has(col)) missing.push(col);
        }
        if (missing.length > 0) {
            throw new Error(
                `Collections used in code but missing from firestore.rules:\n  - ${missing.join('\n  - ')}\n` +
                `Add a "match /<name>/{docId} { ... }" block in firestore.rules.`
            );
        }
        expect(missing).toEqual([]);
    });

    it.each([
        'glucoseMetrics',  // P1.1 / P1.2 — was missing pre-fix
        'symptomsLog',     // P1.1 / P1.2 — was missing pre-fix
        'healthMetrics',
        'weight_entries',
        'reminder_settings_v2',
        'userTaskStatuses',
        'userReminderSettings',
        'userEvents',
        'userTasks',
        'deletionRequests', // without it a deletion falls back to the device-only marker
    ])('rules declare critical collection "%s"', (col) => {
        expect(rulesCollections.has(col)).toBe(true);
    });
});
