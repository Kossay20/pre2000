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

La sage-femme ou le·la gynécologue relit aussi les trois sources de la section
« Pas encore en dossier » ci-dessous : elles ne sont pas comptées dans ce tableau.

## Dans quel ordre

1. **`TRIAGE_DOSSIER.md` en premier.** C'est le seul contenu qui peut retarder une prise
   en charge. Un signe classé trop bas est le pire défaut possible de cette application.
2. **`SUPPLEMENTS_DOSSIER.md` ensuite.** Ce sont des doses qu'une utilisatrice peut suivre.
3. **`FORBIDDEN_FOODS_DOSSIER.md`** et **`MEDICAL_PROFILE_DOSSIER.md`** — plus courts.
4. **Les articles, les semaines et la table de croissance** (section suivante). Ils sont
   visibles dès la première publication, comme tout ce qui précède.
5. **`RAMADAN_DOSSIER.md`** et **`HALAL_DOSSIER.md`** en dernier : les écrans concernés sont
   déjà **éteints dans l'application** et le resteront jusqu'à signature. Ils ne bloquent
   donc pas une première publication.

## Pas encore en dossier

Trois sources de contenu médical n'ont pas encore de dossier extrait. Elles sont à relire
dans le fichier lui-même ; chaque ligne y porte un identifiant qui sert de référence
pour une correction.

| Source | Ce qui est à relire |
|---|---|
| `src/data/articles_db.json` | **80 articles** : titre, résumé et corps en français (`content_markdown_fr`), les traductions anglaise, arabe et tunisienne, le niveau de risque attribué à chacun (`risk_level`) et ses sources s'il en cite. Repère : `article_id`. L'article `art_003` (jeûne du Ramadan) est masqué dans l'application avec l'écran Ramadan ; il relève aussi du référent religieux et ne revient qu'avec la signature de `RAMADAN`. |
| `src/data/weeks_db.json` | **40 semaines** : développement du bébé (`baby_dev_text_*`), changements pour la mère (`mom_body_text_*`), signes d'alerte (`warnings_text_*`), et les articles et compléments recommandés pour la semaine. Repère : `week_number`. |
| `src/utils/fetalGrowth.ts` | La table de taille et de poids du fœtus que tous les écrans affichent (colonnes `baby_size_cm` et `baby_weight_g` de `weeks_db.json`) : la courbe de référence citée dans le fichier, la convention de mesure (vertex-coccyx jusqu'à la semaine 20, vertex-talon ensuite) et la numérotation des semaines (semaines d'aménorrhée). |

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

*Généré le 2026-10-01 par `scripts/generate-clinical-dossier.ts`.
Régénérer après toute modification des données sources.*
