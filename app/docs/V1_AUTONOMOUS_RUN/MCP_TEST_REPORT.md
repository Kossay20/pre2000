# MCP-like Deep Interactive E2E Test Report

**Date** : 2026-05-08
**Méthode** : Playwright file-based (équivalent MCP, pré-scripté)
**Spec** : `app/e2e/deep-interactive.spec.ts` (10 tests interactifs avec capture profonde)

> **Note** : Playwright MCP server installé et connecté (`claude mcp list` → ✓). Tools `mcp__playwright__*` non exposés sans restart Claude. Plan B exécuté : spec dédié reproduit l'expérience MCP en file-based.

---

## Résultat global

✅ **10/10 tests passed (29.4s)**
- Capture : 10 PNG `audit-screenshots/mcp-XX-*.png`
- Console errors : `mcp-console-errors.json`
- Régression : 0
- Verdict : structure visuelle saine sur 10 écrans clés

---

## Tests exécutés + verdicts

### 01 — Language picker FR par défaut ✅
**Capture** : `mcp-01-language-fr-default.png`
**Visuel** : header gradient rose "Choisir la langue" + 4 cards (Français sélectionné rose, العربية, Arabe + Darija, English).
**Verdict** : OK design system cohérent.

### 02 — Language switch EN 🟡
**Capture** : `mcp-02-language-after-en-click.png`
**Visuel** : header switched "Choose Language" + trilingual subtitle + Arabic card affichée. English card highlighted en bas (rose).
**Findings** :
- 🟡 **F1000 P1** : Toast vert "Langue mise à jour" overlap card "Arabe + Darija (Beta)" — couvre le 3e card du picker.
- 🟡 **F1001 P2** : Toast text reste en français après switch EN (devrait être "Language updated").

### 03 — Language switch AR (RTL) 🟡
**Capture** : `mcp-03-language-after-ar-click.png`
**Visuel** : header passé en arabe "اختر اللغة" + Arabic card sélectionnée rose. Trilingual subtitle.
**Findings** :
- 🟡 **F1002 P1** : Toast PAS RTL-flipped en arabe (text+icône restent à gauche, devraient être à droite).
- 🟡 **F1003 P2** : Toast text reste FR après switch AR (devrait être "تم تحديث اللغة").

### 04 — AuthChoice screen FR ✅
**Capture** : `mcp-04-authchoice-fr.png`
**Visuel** : Hero 🤰 + "Commençons" (F700 fix Cycle 5 — emoji séparé) + 3 boutons (Créer un compte / Se connecter / Continuer en invité). No toast overlap (test fix v3 Cycle 5).
**Verdict** : ✅ Excellent, design clean.

### 05 — Register screen ✅
**Capture** : `mcp-05-register-form.png`
**Visuel** : header "Créer un compte" + back arrow + sub "Vos données seront sauvegardées de manière sécurisée" + 3 inputs (Email + Mot de passe + Confirmer) + CTA rose "Créer mon compte" + footer terms.
**Findings** :
- 🟡 **F1004 P2** : Placeholder "Mot de passe (8 car. min + 1 chiffre)" obsolète — Cycle 1 C9 a renforcé à 10+UPPER+digit. **FIX APPLIQUÉ** ce report : `passwordMin` mis à jour 4 locales.
**Verdict après fix** : ✅

### 06 — Login screen ✅
**Capture** : `mcp-06-login-form.png`
**Visuel** : header "Se connecter" + sub "Retrouvez vos données sauvegardées" + Email + Mot de passe (validate permissif Cycle 1 C14) + CTA rose "Se connecter" + lien "Mot de passe oublié ?" + footer "Pas encore de compte ? S'inscrire".
**Verdict** : ✅ design cohérent avec Register, no placeholder password (legacy permissif justifié).

### 07 — Onboarding step 1 mode select ✅
**Capture** : `mcp-07-onboarding-step1.png`
**Visuel** : header "Bienvenue" (F49 Cycle 1 fix) + stepper "Étape 1 sur 4" (F901 Cycle 5) + emoji 🌸 centré (F900 Cycle 5) + 3 cards (Je suis enceinte, J'essaie de concevoir, Je suis curieuse).
**Verdict** : ✅ Cycle 5 améliorations confirmées visuellement.

### 08 — Onboarding step 2 Pregnant ✅
**Capture** : `mcp-08-onboarding-step2-pregnant.png`
**Visuel** : Stepper "Étape 2 sur 4" + progress bar ~35% + emoji 📅 + "Pour calculer votre semaine" + toggle Dernières règles/Conception + date input + card "Vous seriez à la Semaine 1 / Soit 0 SA + 1 jours" calculée live + Continuer rose + Retour.
**Findings** :
- 🟡 F55 (rappel Cycle 2) : date input format ISO `05/08/2026` non localisé (différé post-v1).
**Verdict** : ✅ flow fonctionnel + UX riche (preview de la semaine en live).

### 09 — Onboarding TTC step 2 ✅
**Capture** : `mcp-09-onboarding-ttc-step2.png`
**Visuel** : Stepper "Étape 2 sur 3" + emoji 💕 + "Suivons votre cycle ensemble" + sub "Ces informations nous aideront à vous accompagner" + date + cycleLength stepper -/28 jours/+ + Continuer.
**Verdict** : ✅ flow TTC fonctionnel et bien designé.

### 10 — Onboarding Curious step 2 ✅
**Capture** : `mcp-10-onboarding-curious-step2.png`
**Visuel** : Stepper "Étape 2 sur 3" + emoji 👀 + "Explorez une semaine" + sub "Découvrez ce qui se passe semaine par semaine" + display "**Semaine 20 — 🍌 Taille d'un(e) banane**" (size comparison comme BabyCenter !) + slider T1/T2/T3 + CTA "Découvrir 👀".
**Verdict** : ✅ UX excellente — pattern size comparison aligné concurrents.

---

## Findings nouveaux (range F1000-F1099)

| ID | Sévérité | File:Line | Description | Status |
|----|----------|-----------|-------------|--------|
| F1000 | P1 | `ToastContext.tsx:125-126` | Toast position bottom 80px overlap content sur écrans courts (Language picker, AuthChoice). | ⏸ post-v1 (UX subtile) |
| F1001 | P2 | `ToastContext.tsx` + `LanguageSelectScreen.tsx:65` | Toast text pas re-translated après switch langue (cached avec ancienne locale). | ⏸ post-v1 |
| F1002 | P1 | `ToastContext.tsx:124+` | Toast pas RTL-aware (text+icône à gauche en AR/TN). | ⏸ post-v1 (RTL polish) |
| F1003 | P2 | F1001 sub-issue | Toast i18n cache. | ⏸ post-v1 |
| F1004 | P2 | `auth.json:passwordMin` 4 locales | Placeholder "8 car. min + 1 chiffre" obsolète vs C9 policy (10+UPPER+digit). | ✅ **FIXED** ce report |

---

## Console errors per screen

Voir `audit-screenshots/mcp-console-errors.json` pour le détail. Aucune erreur critique JavaScript runtime détectée sur les 10 écrans testés.

---

## Couverture

| Domaine | Couvert |
|---------|---------|
| Language picker default + switch EN + switch AR | ✅ 3/3 |
| AuthChoice + Register + Login | ✅ 3/3 |
| Onboarding step 1 mode select | ✅ |
| Onboarding step 2 — pregnant + TTC + curious | ✅ 3/3 |
| **TOTAL flows audités** | **10/10 ✅** |

---

## Comparaison avec tests file-based existants (Cycle 1-5)

| Source | Specs | Coverage | Profondeur |
|--------|-------|----------|------------|
| `web-smoke.spec.ts` | 7 | Tabs nav + URL | Surface |
| `audit-screens.spec.ts` | 16 | Capture systématique | Visual surface |
| `feature-tests.spec.ts` | 10 | first-conn / multi-lang / guest / TTC / Curious | Comportement |
| `deep-interactive.spec.ts` (Cycle 6) | 10 | Onboarding 3 modes complets + Auth flows complets | **Profondeur audit** |
| **Total** | **43 specs** | | |

---

## Verdict Cycle 6

🟢 **10 écrans clés testés profondément, 0 régression.**
🟢 **Design Cycle 5 confirmé visuellement** sur toutes les améliorations (F49 header Welcome, F900 emoji centré, F901 stepper, F700 emoji séparé AuthChoice).
🟢 **F1004 fixé immédiatement** (placeholder password obsolète, 4 locales i18n).
🟡 **3 findings toast (F1000-F1003)** différés post-v1 — UX subtle, pas blocant prod.

**Recommandation** : pour ultra-deep MCP interactif, **redémarrer Claude Code** ; tools `mcp__playwright__*` exposés alors permettent click→snapshot→click en mode exploratoire pas pré-scripté.

---

*Rapport généré 2026-05-08 par l'orchestrateur Claude.*
*Spec source : `app/e2e/deep-interactive.spec.ts` — 10 tests, 29.4s.*
*Captures : `app/audit-screenshots/mcp-XX-*.png`.*
