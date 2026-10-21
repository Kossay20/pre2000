# Firebase App Check — Guide de déploiement

> SAFETY-CRITICAL : protège contre l'abus de quota Firestore, le scraping, et les attaques de cost-amplification.

## Vue d'ensemble

L'app utilise `@react-native-firebase/app-check` pour l'attestation **native** (App Attest iOS + Play Integrity Android). Mais Firestore et Auth passent par le SDK Firebase **JS** : `src/config/appCheck.native.ts` initialise donc App Check côté JS avec un `CustomProvider` qui demande le jeton au SDK natif — sinon aucune requête ne porterait de jeton et l'enforcement bloquerait tout le monde. Sans module natif (Expo Go, build sans les fichiers Firebase), l'app démarre sans App Check (fail-open). Le web n'initialise pas App Check.

L'entitlement iOS `com.apple.developer.devicecheck.appattest-environment: production` est déclaré dans `app.json` (`ios.entitlements`) ; EAS synchronise la capability App Attest sur l'identifiant d'app au prochain `eas build` / `eas credentials`. Sans lui, l'attestation échoue sur tous les iPhone iOS 14+.

## Étape 1 — Firebase Console : enregistrement App Check

1. Aller sur [Firebase Console > App Check](https://console.firebase.google.com/project/_/appcheck/apps)
2. Pour l'app **iOS** :
   - Provider : **App Attest**
   - Fallback : **DeviceCheck** (déjà géré par `appAttestWithDeviceCheckFallback`)
3. Pour l'app **Android** :
   - Provider : **Play Integrity**
   - Fournir le SHA-256 du keystore release EAS (`eas credentials` puis copier le SHA-256)

## Étape 2 — Fichiers natifs

Télécharger depuis Firebase Console > Project Settings > Your apps :
- `GoogleService-Info.plist` → placer dans `app/ios/<projectName>/` (créé après prebuild)
- `google-services.json` → placer dans `app/android/app/`

⚠️ Ces fichiers contiennent les vrais OAuth client IDs Firebase. **Ne JAMAIS les commiter** — déjà gérés par `.gitignore`.

Pour CI/CD EAS Build, les enregistrer dans EAS Secrets et les copier au build via un hook post-install ou dans `eas.json` `build.production.env`.

## Étape 3 — Debug Token (dev builds)

Pour développer avec `expo run:ios|android` (pas Expo Go) :
1. Au premier lancement, regarder les logs Xcode/Logcat pour récupérer le **debug token App Check**
2. Aller dans Firebase Console > App Check > Apps > **Manage debug tokens**
3. Ajouter le token avec un nom (ex: "iOS-dev-loeymot")
4. (Optionnel) Le passer aussi via `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN` pour déterministe

## Étape 4 — Enforcement progressif

1. **Soft launch** : Firebase Console > App Check > **Monitor** : observer les requêtes Firestore/Auth pendant 24-48h. **Ne pas activer Enforce tant que le ratio de requêtes vérifiées n'atteint pas au moins 95 %** (viser > 99 %). Les versions installées avant le pont JS (`appCheck.native.ts`) n'envoient aucun jeton : elles doivent avoir disparu du parc avant l'enforcement.
2. **Hard enforcement** :
   - Cloud Firestore > **Enforce**
   - Authentication > **Enforce**
   - Toute requête sans token App Check valide sera **bloquée**

⚠️ NE PAS activer Enforce avant d'avoir validé en monitor que tous les builds (iOS + Android, dev + prod) génèrent des tokens valides — sinon DoS instantané sur tous les utilisateurs.

## Étape 5 — Build & test

```bash
cd app
npx expo prebuild --clean
eas build --profile preview --platform ios   # ou android
```

Tester :
1. Installer le build sur device physique
2. Lancer l'app, vérifier dans Firebase Console que des requêtes "App Check verified" arrivent
3. Activer Enforce après 100% de coverage observé

## Étape 6 — API Key restrictions GCP (F3b)

Indépendamment d'App Check, restreindre les API keys Firebase dans Google Cloud Console > APIs & Services > Credentials :
- `AIza...` web key : restrict to HTTP referrer (web only)
- iOS API key : restrict to bundle ID `com.loeymot.mamabebe`
- Android API key : restrict to package name + SHA-1

Cela limite l'exposition même si une key est leaked.

## Rollback

Si App Check enforcement casse l'app après activation :
1. Firebase Console > App Check > Cloud Firestore > **Disable enforcement** (effet immédiat)
2. Investiguer les builds qui échouent (ratio par version)

## Status actuel

- [ ] Étape 1 : Firebase Console App Check enregistré
- [ ] Étape 2 : `GoogleService-Info.plist` + `google-services.json` placés
- [ ] Étape 3 : Debug token enregistré
- [ ] Étape 4 : Enforce activé (après monitor 24-48h)
- [ ] Étape 5 : Build EAS validé sur device
- [ ] Étape 6 : API keys restrictions GCP
