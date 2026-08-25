# Revue clinique — Mama & Bébé v1.0

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
| **Sage-femme ou gynécologue-obstétricien·ne** | `SUPPLEMENTS`, `TRIAGE`, `FORBIDDEN_FOODS`, `MEDICAL_PROFILE`, et la moitié médicale de `RAMADAN` | 55 + 3 |
| **Référent religieux qualifié** | la moitié religieuse de `RAMADAN` | 3 |
| **Imam et diététicien·ne** | `HALAL` | 5 |

## Dans quel ordre

1. **`TRIAGE_DOSSIER.md` en premier.** C'est le seul contenu qui peut retarder une prise
   en charge. Un signe classé trop bas est le pire défaut possible de cette application.
2. **`SUPPLEMENTS_DOSSIER.md` ensuite.** Ce sont des doses qu'une utilisatrice peut suivre.
3. **`FORBIDDEN_FOODS_DOSSIER.md`** et **`MEDICAL_PROFILE_DOSSIER.md`** — plus courts.
4. **`RAMADAN_DOSSIER.md`** et **`HALAL_DOSSIER.md`** en dernier : les écrans concernés sont
   déjà **éteints dans l'application** et le resteront jusqu'à signature. Ils ne bloquent
   donc pas une première publication.

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

*Généré le 2026-08-25 par `scripts/generate-clinical-dossier.ts`.
Régénérer après toute modification des données sources.*
