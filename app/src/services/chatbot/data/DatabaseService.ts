import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { createLogger } from '../../../utils/logger';
import { ARTICLES, RED_FLAGS, SUGGESTIONS } from '../../../data/chatbot_data';

const log = createLogger('DatabaseService');

const DB_NAME = 'chatbot.db';
// Bumped to 4: ARTICLES now comes from articles_db.json instead of an inlined copy
// in chatbot_data.ts. Existing installs must re-seed so the SQLite rows match the
// single source of truth (v3 added TN dialect keywords/messages + suggestions label_tn).
const DB_VERSION = 4;
const DB_VERSION_KEY = 'chatbot_db_version';

export class DatabaseService {
    private db: SQLite.SQLiteDatabase | null = null;

    async init() {
        // SQLite is mobile-only. On web the wa-sqlite.wasm import is stubbed
        // (metro.config.js PHASE 1.1), so opening a DB throws a CompileError /
        // 'Incorrect MIME type' wasm error. The web chatbot uses the in-memory
        // LocalChatbotRepository instead, so skip DB init entirely on web —
        // getDatabase() then stays null and SqliteChatbotRepository null-guards.
        if (Platform.OS === 'web') {
            return;
        }
        try {
            this.db = await SQLite.openDatabaseAsync(DB_NAME);
            await this.createTables();
            await this.migrateToV2();
            await this.migrateToV3();
            await this.populateInitialData();
            log.success('Database initialized successfully');
        } catch (error) {
            log.error('Failed to initialize database', error);
            throw error;
        }
    }

    private async createTables() {
        if (!this.db) throw new Error('Database not initialized');

        await this.db.execAsync(`
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS articles (
                id TEXT PRIMARY KEY,
                title_fr TEXT NOT NULL,
                title_ar TEXT,
                title_en TEXT,
                title_tn TEXT,
                summary_fr TEXT,
                summary_ar TEXT,
                summary_en TEXT,
                summary_tn TEXT,
                content_fr TEXT,
                content_ar TEXT,
                content_en TEXT,
                content_tn TEXT,
                category TEXT,
                risk_level INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS red_flags (
                id TEXT PRIMARY KEY,
                label_fr TEXT NOT NULL,
                label_ar TEXT,
                label_en TEXT,
                label_tn TEXT,
                severity TEXT NOT NULL,
                message_fr TEXT NOT NULL,
                message_ar TEXT,
                message_en TEXT,
                message_tn TEXT,
                keywords_fr TEXT,
                keywords_ar TEXT,
                keywords_en TEXT,
                keywords_tn TEXT
            );

            CREATE TABLE IF NOT EXISTS suggestions (
                id TEXT PRIMARY KEY,
                label_fr TEXT NOT NULL,
                label_ar TEXT,
                label_en TEXT,
                label_tn TEXT,
                topic TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL UNIQUE,
                normalized TEXT NOT NULL
            );

            -- Junction Tables
            CREATE TABLE IF NOT EXISTS article_keywords (
                article_id TEXT,
                keyword_id INTEGER,
                weight INTEGER,
                FOREIGN KEY(article_id) REFERENCES articles(id),
                FOREIGN KEY(keyword_id) REFERENCES keywords(id)
            );

            CREATE TABLE IF NOT EXISTS red_flag_keywords (
                red_flag_id TEXT,
                keyword_id INTEGER,
                FOREIGN KEY(red_flag_id) REFERENCES red_flags(id),
                FOREIGN KEY(keyword_id) REFERENCES keywords(id)
            );

            CREATE TABLE IF NOT EXISTS suggestion_keywords (
                suggestion_id TEXT,
                keyword_id INTEGER,
                FOREIGN KEY(suggestion_id) REFERENCES suggestions(id),
                FOREIGN KEY(keyword_id) REFERENCES keywords(id)
            );

            CREATE TABLE IF NOT EXISTS red_flag_articles (
                red_flag_id TEXT,
                article_id TEXT,
                FOREIGN KEY(red_flag_id) REFERENCES red_flags(id),
                FOREIGN KEY(article_id) REFERENCES articles(id)
            );

            CREATE TABLE IF NOT EXISTS suggestion_articles (
                suggestion_id TEXT,
                article_id TEXT,
                FOREIGN KEY(suggestion_id) REFERENCES suggestions(id),
                FOREIGN KEY(article_id) REFERENCES articles(id)
            );

            CREATE TABLE IF NOT EXISTS suggestion_red_flags (
                suggestion_id TEXT,
                red_flag_id TEXT,
                FOREIGN KEY(suggestion_id) REFERENCES suggestions(id),
                FOREIGN KEY(red_flag_id) REFERENCES red_flags(id)
            );

            CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);
    }

    /**
     * Safe migration for existing installs — adds multilang columns.
     * Uses try/catch per ALTER to handle "column already exists" gracefully.
     */
    private async migrateToV2() {
        if (!this.db) return;

        const addCol = async (table: string, col: string, type = 'TEXT') => {
            try {
                await this.db!.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
            } catch (_) {
                // Column already exists — expected for new installs
            }
        };

        // Articles multilang
        await addCol('articles', 'title_ar');
        await addCol('articles', 'title_en');
        await addCol('articles', 'title_tn');   // BUG-01 FIX
        await addCol('articles', 'summary_ar');
        await addCol('articles', 'summary_en');
        await addCol('articles', 'summary_tn'); // BUG-01 FIX
        await addCol('articles', 'content_ar');
        await addCol('articles', 'content_en');
        await addCol('articles', 'content_tn');

        // Red flags multilang
        await addCol('red_flags', 'label_ar');
        await addCol('red_flags', 'label_en');
        await addCol('red_flags', 'message_ar');
        await addCol('red_flags', 'message_en');
        await addCol('red_flags', 'keywords_fr');
        await addCol('red_flags', 'keywords_ar');
        await addCol('red_flags', 'keywords_en');

        // Suggestions multilang
        await addCol('suggestions', 'label_ar');
        await addCol('suggestions', 'label_en');

        log.info('V2 multilang migration complete');
    }

    /**
     * V3 migration: adds TN dialect columns for red_flags and suggestions.
     * Safe to run on existing DB — ALTER TABLE ignores existing columns.
     */
    private async migrateToV3() {
        if (!this.db) return;

        const addCol = async (table: string, col: string, type = 'TEXT') => {
            try {
                await this.db!.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
            } catch (_) { /* already exists */ }
        };

        // Red flags: TN dialect
        await addCol('red_flags', 'label_tn');
        await addCol('red_flags', 'message_tn');
        await addCol('red_flags', 'keywords_tn');

        // Suggestions: TN label
        await addCol('suggestions', 'label_tn');

        // App metadata table (safe, may fail if already created by schema)
        try {
            await this.db.execAsync(`
                CREATE TABLE IF NOT EXISTS app_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
            `);
        } catch (_) { /* already exists */ }

        log.info('V3 TN dialect migration complete');
    }

    private async populateInitialData() {
        if (!this.db) throw new Error('Database not initialized');

        // Check DB version — re-import if version bumped
        const versionRow = await this.db.getFirstAsync<{ value: string }>(
            `SELECT value FROM app_metadata WHERE key = '${DB_VERSION_KEY}'`
        ).catch(() => null);
        const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;
        if (currentVersion >= DB_VERSION) {
            log.info(`Database already at version ${currentVersion}, skipping import.`);
            return;
        }

        log.info(`Populating initial data (v${DB_VERSION})...`);

        // Import Articles — now with all languages
        for (const article of ARTICLES) {
            await this.db.runAsync(
                `INSERT OR REPLACE INTO articles
                 (id, title_fr, title_ar, title_en, title_tn, summary_fr, summary_ar, summary_en, summary_tn, content_fr, content_ar, content_en, content_tn, category, risk_level)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                article.article_id,
                article.title_fr,
                (article as any).title_ar || '',
                (article as any).title_en || '',
                (article as any).title_tn || '',
                article.summary_fr || '',
                (article as any).summary_ar || '',
                (article as any).summary_en || '',
                (article as any).summary_tn || '',
                article.content_markdown_fr || '',
                (article as any).content_markdown_ar || '',
                (article as any).content_markdown_en || '',
                (article as any).content_markdown_tn || '',
                article.category || '',
                0
            );
        }

        // Import Red Flags — with AR/EN/TN dialect keywords and messages
        for (const flag of RED_FLAGS) {
            await this.db.runAsync(
                `INSERT OR REPLACE INTO red_flags
                 (id, label_fr, label_ar, label_en, label_tn, severity, message_fr, message_ar, message_en, message_tn, keywords_fr, keywords_ar, keywords_en, keywords_tn)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                flag.red_flag_id,
                flag.label_fr,
                (flag as any).label_ar || '',
                (flag as any).label_en || '',
                (flag as any).label_tn || '',
                flag.severity,
                flag.standard_message_fr,
                (flag as any).standard_message_ar || '',
                (flag as any).standard_message_en || '',
                (flag as any).standard_message_tn || '',
                flag.keywords_fr || '',
                (flag as any).keywords_ar || '',
                (flag as any).keywords_en || '',
                (flag as any).keywords_tn || ''
            );
        }

        // Import Suggestions — with TN dialect label
        for (const suggestion of SUGGESTIONS) {
            await this.db.runAsync(
                `INSERT OR REPLACE INTO suggestions (id, label_fr, label_ar, label_en, label_tn, topic)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                suggestion.suggestion_id,
                suggestion.label_fr,
                (suggestion as any).label_ar || '',
                (suggestion as any).label_en || '',
                (suggestion as any).label_tn || '',
                suggestion.topic
            );
        }

        // Mark DB version
        await this.db.runAsync(
            `INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)`,
            DB_VERSION_KEY, String(DB_VERSION)
        );

        await this.populateRelationships();
    }

    private async populateRelationships() {
        if (!this.db) return;
        log.info('Populating relationships and keywords...');

        // Helper to insert keyword
        const insertKeyword = async (word: string): Promise<number> => {
            const normalized = word.toLowerCase().trim();
            try {
                const result = await this.db!.runAsync(
                    'INSERT OR IGNORE INTO keywords (word, normalized) VALUES (?, ?)',
                    word, normalized
                );
                if (result.changes > 0) {
                    return result.lastInsertRowId;
                }
                // If ignored, fetch existing id
                const row = await this.db!.getFirstAsync<{ id: number }>('SELECT id FROM keywords WHERE word = ?', word);
                return row ? row.id : -1;
            } catch (e) {
                return -1;
            }
        };

        // 1. Red Flag Keywords & Linked Articles
        for (const flag of RED_FLAGS) {
            // Keywords
            if (flag.keywords_fr) {
                const keywords = flag.keywords_fr.split(',').map(k => k.trim());
                for (const k of keywords) {
                    const kid = await insertKeyword(k);
                    if (kid !== -1) {
                        await this.db.runAsync('INSERT INTO red_flag_keywords (red_flag_id, keyword_id) VALUES (?, ?)', flag.red_flag_id, kid);
                    }
                }
            }
            // Linked Articles
            if (flag.linked_articles_ids && flag.linked_articles_ids.length > 0) {
                for (const artId of flag.linked_articles_ids) {
                    await this.db.runAsync('INSERT INTO red_flag_articles (red_flag_id, article_id) VALUES (?, ?)', flag.red_flag_id, artId);
                }
            }
        }

        // 2. Suggestion Keywords & Links
        for (const suggestion of SUGGESTIONS) {
            // Keywords from Label (Simple heuristic)
            const keywords = suggestion.label_fr.split(' ').map(k => k.trim()).filter(k => k.length > 2);
            for (const k of keywords) {
                const kid = await insertKeyword(k);
                if (kid !== -1) {
                    await this.db.runAsync('INSERT INTO suggestion_keywords (suggestion_id, keyword_id) VALUES (?, ?)', suggestion.suggestion_id, kid);
                }
            }

            // Linked Articles
            if (suggestion.linked_article_ids) {
                const artIds = suggestion.linked_article_ids.split(',').map(id => id.trim());
                for (const artId of artIds) {
                    if (artId) await this.db.runAsync('INSERT INTO suggestion_articles (suggestion_id, article_id) VALUES (?, ?)', suggestion.suggestion_id, artId);
                }
            }

            // Linked Red Flags
            if (suggestion.linked_red_flag_ids) {
                const rfIds = suggestion.linked_red_flag_ids.split(',').map(id => id.trim());
                for (const rfId of rfIds) {
                    if (rfId) await this.db.runAsync('INSERT INTO suggestion_red_flags (suggestion_id, red_flag_id) VALUES (?, ?)', suggestion.suggestion_id, rfId);
                }
            }
        }

        log.success('Relationships populated successfully');
    }

    getDatabase() {
        return this.db;
    }
}

export const databaseService = new DatabaseService();
