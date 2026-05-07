# 🤰 Pregnancy App

Application mobile de suivi de grossesse développée avec React Native / Expo.

## 📋 Prérequis

- **Node.js** 20.19.4+ (RN 0.81 / Expo SDK 54). Version pinnée dans [`.nvmrc`](./.nvmrc) → `nvm use` avant tout `npm`.
- **npm** 9+ ou **yarn** 1.22+
- **Expo CLI**: `npm install -g expo-cli`
- **iOS**: Xcode 15+ (pour simulateur iOS)
- **Android**: Android Studio avec émulateur configuré

## 🚀 Installation

```bash
# 1. Cloner le repository
git clone <repository-url>
cd pregnancy-app/app

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos clés Firebase

# 4. Lancer l'application
npx expo start
```

## ⚙️ Configuration

### Variables d'Environnement (.env)

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Firebase Setup

1. Créer un projet sur [Firebase Console](https://console.firebase.google.com)
2. Activer Authentication (Email/Password)
3. Créer une base Firestore
4. Copier les credentials dans `.env`

## 📁 Structure du Projet

```
app/
├── App.tsx                 # Point d'entrée
├── src/
│   ├── components/         # Composants réutilisables
│   │   ├── calendar/       # Composants calendrier
│   │   ├── common/         # Boutons, Cards, etc.
│   │   ├── home/           # Composants HomeScreen
│   │   └── tasks/          # Composants tâches
│   │
│   ├── config/             # Configuration (Firebase)
│   ├── context/            # Contextes React
│   │   ├── AuthContext.tsx # Authentification
│   │   └── ToastContext.tsx# Notifications UI
│   │
│   ├── hooks/              # Hooks personnalisés
│   ├── i18n/               # Internationalisation
│   │   └── locales/        # Traductions (fr/ar/en)
│   │
│   ├── screens/            # Écrans de l'application
│   │   ├── HomeScreen.tsx
│   │   ├── CalendarScreen.tsx
│   │   ├── ChatbotScreen.tsx
│   │   └── ...
│   │
│   ├── services/           # Logique métier
│   │   ├── calendarService.ts    # Gestion RDV
│   │   ├── healthService.ts      # Suivi santé
│   │   ├── notificationService.ts# Push notifications
│   │   └── ...
│   │
│   ├── theme/              # Thème et styles
│   ├── types/              # Types TypeScript
│   └── utils/              # Utilitaires
│
├── assets/                 # Images, fonts
├── firestore.rules         # Règles sécurité Firestore
└── package.json
```

## 🛠️ Scripts Disponibles

| Script | Description |
|--------|-------------|
| `npm start` | Lance Expo en mode développement |
| `npm run android` | Lance sur émulateur Android |
| `npm run ios` | Lance sur simulateur iOS |
| `npm run web` | Lance en mode web |
| `npm test` | Exécute les tests |
| `npm run import-data` | Importe les données depuis CSV |

## 📱 Fonctionnalités Principales

### 🏠 Accueil
- Suivi semaine par semaine
- Message quotidien du bébé
- Checklist journalière
- Statistiques santé

### 📅 Calendrier
- RDV médicaux personnalisés
- Suggestions d'événements par semaine
- Vue semaine / mois
- Notifications de rappel

### 💬 Chatbot
- Assistant virtuel
- Réponses basées sur la semaine de grossesse
- Suggestions de questions fréquentes

### 📊 Suivi Santé
- Courbe de poids
- Tension artérielle
- Historique des consultations

### 🔔 Rappels
- Hydratation
- Médicaments
- Vitamines
- Exercices

## 🌍 Langues Supportées

- 🇫🇷 Français (complet)
- 🇸🇦 Arabe (en cours)
- 🇬🇧 Anglais (en cours)

## 📦 Données (DATA PACK)

Les données médicales sont dans le dossier parent:

| Dataset | Description |
|---------|-------------|
| `weeks_db_final.json` | Info par semaine (1-40) |
| `articles_db.json` | Articles éducatifs |
| `supplements_pregnancy.json` | Suppléments recommandés |
| `red_flags_db.json` | Signes d'alerte |
| `calendar_templates.json` | Templates d'événements |

## 🧪 Tests

```bash
# Lancer tous les tests
npm test

# Mode watch
npm test -- --watch
```

### E2E web (Playwright)

Les scénarios vivent dans `e2e/` ; la config est `playwright.config.ts`. Depuis T1 (V1_AUTONOMOUS_RUN), Playwright **démarre Expo automatiquement** via `webServer:` (`npx expo start --web --port 8081 --clear`) — pas besoin de terminal séparé.

```bash
# Prérequis : Node 20+ (pinned dans `.nvmrc`)
nvm use            # → 20.20.2

# Lance Playwright qui démarre Expo automatiquement (cold ~30-60s, warm ~5s)
npm run e2e:web

# Variantes (réutilisent le webServer si déjà actif)
npm run e2e:web:ui      # Playwright UI mode interactif
npm run e2e:web:headed  # Voir le navigateur

# Pipeline complet (lint + tsc + jest + e2e)
npm run verify:e2e:web
```

- **`E2E_BASE_URL`** : surcharger l'URL pour cibler un preview déployé (skip webServer).
- En CI (`CI=true`), `reuseExistingServer:false` force toujours un démarrage frais.
- Artefacts en cas d'échec : `playwright-report/` + `test-results/` (traces, videos, screenshots).
- Feuille de route détaillée : [`docs/PLAN_E2E_WEB_SUITE.md`](./docs/PLAN_E2E_WEB_SUITE.md).

## 📝 Conventions de Code

- **TypeScript** obligatoire
- **ESLint** + **Prettier** pour le formatage
- Composants fonctionnels avec Hooks
- Nommage: PascalCase (composants), camelCase (fonctions)

## 🚢 Déploiement

```bash
# Build pour production
npx expo build:android
npx expo build:ios

# Ou avec EAS Build
npx eas build --platform all
```

## 📄 Documentation

- [Architecture](./ARCHITECTURE.md)
- [Documentation Datasets](../documentation_complete.md)
- [Mapping Données](../mapping_global.md)

## 👥 Équipe

- Développement initial: Manus AI + Antigravity
- Maintenance: [Votre équipe]

## 📜 Licence

Propriétaire - Tous droits réservés

---

*Dernière mise à jour: Décembre 2025*
