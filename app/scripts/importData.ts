import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

console.log('📦 Initializing Firebase...');
console.log(`   Project: ${firebaseConfig.projectId}`);

if (!firebaseConfig.projectId) {
    console.error('❌ Firebase config not found. Make sure .env file exists with EXPO_PUBLIC_FIREBASE_* variables.');
    process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function importData() {
    try {
        await importCollection('articles_db.json', 'articles', 'article_id');
        await importCollection('red_flags_db.json', 'redFlags', 'red_flag_id');
        await importCollection('chatbot_suggestions.json', 'chatbotSuggestionsAG', 'suggestion_id');
        await importCollection('app/DATA_PACK_MVP_V3_FINAL/baby_messages_db_v1_2_FULL.json', 'babyMessages', 'message_id');
        // R2-FIX: supplements were never seeded — SupplementsListScreen / ArticleDetail read
        // collection('supplements') and DiagnosticScreen expects 15, so the tab was empty in prod.
        await importCollection('supplements_pregnancy.json', 'supplements', 'supplement_id');

        console.log('\n🎉 All imports completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fatal error during import:', error);
        process.exit(1);
    }
}

async function importCollection(filename: string, collectionName: string, idField: string) {
    const filePath = path.join(__dirname, '../../', filename);
    console.log(`\n📖 Loading ${filename}...`);

    if (!fs.existsSync(filePath)) {
        console.error(`   ❌ File not found: ${filePath}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`   Found ${data.length} items. Importing to '${collectionName}'...`);

    let batch = writeBatch(db);
    let count = 0;
    let totalImported = 0;
    const BATCH_SIZE = 400; // Firestore batch limit is 500

    for (const item of data) {
        const docId = item[idField];
        if (!docId) {
            console.warn(`   ⚠️ Skipping item without ID field '${idField}'`);
            continue;
        }

        const docRef = doc(db, collectionName, String(docId));
        batch.set(docRef, item);
        count++;

        if (count >= BATCH_SIZE) {
            await batch.commit();
            totalImported += count;
            console.log(`   ✅ Committed batch of ${count} items...`);
            batch = writeBatch(db);
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
        totalImported += count;
        console.log(`   ✅ Committed final batch of ${count} items.`);
    }

    console.log(`   ✨ Finished importing ${totalImported} documents to ${collectionName}.`);
}

importData();
