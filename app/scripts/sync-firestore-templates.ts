/**
 * Script pour mettre à jour les modèles de calendrier dans Firestore
 * 
 * EXÉCUTION:
 * 1. Dans le terminal, aller dans /app
 * 2. Exécuter: npx ts-node scripts/sync-firestore-templates.ts
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

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

if (!firebaseConfig.projectId) {
    console.error('❌ Firebase config not found.');
    process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function syncTemplates() {
    // Load templates DB
    const templatesPath = path.join(__dirname, '../../calendar_templates_db.json');
    console.log(`\n📖 Loading ${templatesPath}...`);

    if (!fs.existsSync(templatesPath)) {
        console.error('❌ DB file not found');
        return;
    }

    const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
    console.log(`   Found ${templates.length} templates\n`);

    console.log('🔄 Updating Firestore...\n');

    let updated = 0;
    let errors = 0;

    for (const t of templates) {
        // Cycle 3 F101 : aligné sur la collection lue par l'app (`calendarTemplates`,
        // camelCase, cf. `src/services/calendarService.ts:164`, `reminderService.ts:33`,
        // `firestore.rules:221`). Avant : snake_case `calendar_templates` → seeder
        // peuplait une collection orpheline jamais lue → screens vides en prod.
        const docRef = doc(db, 'calendarTemplates', t.template_id);

        try {
            await setDoc(docRef, {
                ...t,
                title_tn: t.title_tn || t.title_ar, // Ensure fallback
                description_tn: t.description_tn || t.description_ar
            }, { merge: true });

            console.log(`   ✅ ${t.template_id} | ${t.title_fr}`);
            updated++;
        } catch (error: any) {
            console.log(`   ❌ ${t.template_id}: ${error.message}`);
            errors++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ ${updated} templates updated`);
    if (errors > 0) {
        console.log(`❌ ${errors} errors`);
    }
    console.log('='.repeat(60));

    process.exit(0);
}

syncTemplates().catch((error: any) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
