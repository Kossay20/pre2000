/**
 * Script pour mettre à jour Firestore avec les données corrigées de weeks_db.json
 * 
 * EXÉCUTION:
 * 1. Dans le terminal, aller dans /app
 * 2. Exécuter: npx ts-node scripts/sync-firestore-weeks.ts
 * 
 * Ce script utilise la config Firebase du projet pour se connecter et mettre à jour.
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, setDoc } = require('firebase/firestore');
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
console.log(`   Project: ${firebaseConfig.projectId}`);

if (!firebaseConfig.projectId) {
    console.error('❌ Firebase config not found. Make sure .env file exists with EXPO_PUBLIC_FIREBASE_* variables.');
    process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function syncWeeksToFirestore() {
    // Load the bundled weeks_db.json — the same file the app falls back to offline and
    // the fetal-growth figures are read from. The repo-root copy is a stale export
    // (kilograms in baby_weight_g from week 28, week 16 at 16 cm) and must not be pushed.
    const weeksPath = path.join(__dirname, '../src/data/weeks_db.json');
    console.log(`\n📖 Loading ${weeksPath}...`);

    const weeksData = JSON.parse(fs.readFileSync(weeksPath, 'utf-8'));
    console.log(`   Found ${weeksData.length} weeks\n`);

    console.log('🔄 Updating Firestore...\n');

    let updated = 0;
    let errors = 0;

    for (const week of weeksData) {
        const weekNum = week.week_number;
        const docRef = doc(db, 'weeks', String(weekNum));

        try {
            // Update all content fields including translations
            await updateDoc(docRef, {
                emoji: week.emoji,

                // Titles
                title_fr: week.title_fr,
                title_en: week.title_en,
                title_ar: week.title_ar,
                title_tn: week.title_tn || null, // Add TN title

                // Baby Size
                baby_size_label_fr: week.baby_size_label_fr,
                baby_size_label_en: week.baby_size_label_en,
                baby_size_label_ar: week.baby_size_label_ar,
                baby_size_label_tn: week.baby_size_label_tn || null, // Add TN label
                baby_size_cm: week.baby_size_cm,
                baby_weight_g: week.baby_weight_g,

                // Baby Development
                baby_dev_text_fr: week.baby_dev_text_fr,
                baby_dev_text_en: week.baby_dev_text_en,
                baby_dev_text_ar: week.baby_dev_text_ar,
                baby_dev_text_tn: week.baby_dev_text_tn || null, // Add TN text

                // Mom Body
                mom_body_text_fr: week.mom_body_text_fr,
                mom_body_text_en: week.mom_body_text_en,
                mom_body_text_ar: week.mom_body_text_ar,
                mom_body_text_tn: week.mom_body_text_tn || null, // Add TN text

                // Recommended items (handle string or array)
                recommended_articles_ids: typeof week.recommended_articles_ids === 'string'
                    ? week.recommended_articles_ids.split(',')
                    : (week.recommended_articles_ids || (week['Articles recommandés (IDs)'] ? week['Articles recommandés (IDs)'].split(',') : [])),

                recommended_supplements_ids: typeof week.recommended_supplements_ids === 'string'
                    ? week.recommended_supplements_ids.split(',')
                    : (week.recommended_supplements_ids || (week['Compléments recommandés (IDs)'] ? week['Compléments recommandés (IDs)'].split(',') : [])),

                calendar_template_ids: typeof week.calendar_template_ids === 'string'
                    ? week.calendar_template_ids.split(',')
                    : (week.calendar_template_ids || (week['Modèles de calendrier (IDs)'] ? week['Modèles de calendrier (IDs)'].split(',') : [])),

                // Warnings
                warnings_text_fr: week.warnings_text_fr,
                warnings_text_en: week.warnings_text_en,
                warnings_text_ar: week.warnings_text_ar,
                warnings_text_tn: week.warnings_text_tn || null, // Add TN text

                // Images
                baby_image_static_url: week.baby_image_static_url
            });

            console.log(`   ✅ Sem ${String(weekNum).padStart(2, '0')} | ${week.emoji} | ${week.baby_size_label_fr}`);
            updated++;
        } catch (error: any) {
            // If document doesn't exist, create it
            if (error.code === 'not-found') {
                try {
                    await setDoc(docRef, {
                        ...week,
                        title_tn: week.title_tn || null,
                        baby_size_label_tn: week.baby_size_label_tn || null,
                        baby_dev_text_tn: week.baby_dev_text_tn || null,
                        mom_body_text_tn: week.mom_body_text_tn || null,
                        warnings_text_tn: week.warnings_text_tn || null
                    });
                    console.log(`   ✅ Sem ${String(weekNum).padStart(2, '0')} (créé) | ${week.emoji} | ${week.baby_size_label_fr}`);
                    updated++;
                } catch (createError: any) {
                    console.log(`   ❌ Sem ${weekNum}: ${createError.message}`);
                    errors++;
                }
            } else {
                console.log(`   ❌ Sem ${weekNum}: ${error.message}`);
                errors++;
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ ${updated} semaines mises à jour`);
    if (errors > 0) {
        console.log(`❌ ${errors} erreurs`);
    }
    console.log('='.repeat(60));

    process.exit(0);
}

syncWeeksToFirestore().catch((error: any) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
