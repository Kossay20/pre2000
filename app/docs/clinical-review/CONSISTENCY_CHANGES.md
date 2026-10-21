# Modifications de cohérence interne — à signer

> **À l'attention de : sage-femme ou gynécologue-obstétricien·ne**

## Pourquoi ce document

L'audit de sortie (2026-09-30, vague C, constats C-017 à C-022) a relevé des endroits où
l'application **se contredisait elle-même** : un badge disait « Limiter » au-dessus d'un
texte qui disait « Éviter », ou deux écrans classaient le même produit différemment.

Ces contradictions ont été levées **sans avis médical**, selon une seule règle :
**en cas de désaccord entre deux affirmations de l'application, c'est la plus prudente qui
est retenue.** Aucune classification n'a été assouplie.

Ce ne sont donc pas des décisions cliniques : ce sont des alignements. Chaque ligne
ci-dessous attend votre accord ou votre correction, comme dans les autres dossiers.
Les dossiers `FORBIDDEN_FOODS`, `SUPPLEMENTS` et `TRIAGE` ont été régénérés et montrent
déjà les valeurs « après ».

| | Signification |
|---|---|
| **OK** | L'alignement peut rester tel quel |
| **CORRIGER** | Écrivez la classification ou le texte voulu dans la colonne « Correction » |

**Test de non-régression :** `src/data/__tests__/clinicalRatingConsistency.test.ts`
(vérifie l'accord entre les affirmations de l'application, pas leur exactitude) et
`src/services/__tests__/chatbotAnswers.test.ts`.

---

## 1. Aliments à éviter — `src/data/forbidden_foods.json`

Les badges : `critical` = « Interdit », `high` = « À éviter », `medium` = « Limiter ».

| # | Entrée | Avant | Après | Ce qui se contredisait | OK / CORRIGER | Correction |
|---|---|---|---|---|---|---|
| 1 | `smoked_fish` — Poisson fumé | `medium` (Limiter) | `high` (À éviter) | Son propre texte dit : « Éviter sauf si bien cuit ensuite. » Le texte n'a pas été modifié. | | |
| 2 | `high_mercury_fish` — Poissons à haute teneur en mercure | `medium` (Limiter) | `high` (À éviter) | Le nom citait espadon et requin ; le texte disait seulement « Limiter à 150g/semaine max ». L'avis de l'ANSES, que l'écran cite comme source, dit d'**éviter** espadon, marlin, siki, requin et lamproie et de **limiter** les autres poissons prédateurs sauvages (dont le thon). Voir le texte réécrit ci-dessous. | | |
| 3 | `feta_goat` — Feta et chèvre frais (au lait cru) | `medium` (Limiter) | `high` (À éviter) | Même aliment (fromage au lait cru) que `raw_milk_cheese`, déjà classé `high`. Texte inchangé (« OK si au lait pasteurisé »). | | |
| 4 | `rillettes` — Rillettes, pâtés, terrines | `medium` (Limiter) | `high` (À éviter) | Sa propre rubrique « Alternative » dit : « Éviter pendant la grossesse. » Le pâté figure aussi dans `charcuterie`, classé `high`. Texte inchangé. | | |

### Texte réécrit — `high_mercury_fish`

Seul texte médical modifié dans ce fichier. Il a été rapproché de l'avis de l'ANSES
(« Manger du poisson : pourquoi ? comment ? », anses.fr, consulté le 2026-10-01).
Le seuil de 150 g par semaine figurait déjà dans l'ancien texte et n'a pas été revérifié.

- **Nom, avant :** Poissons à haute teneur en mercure (thon, espadon, requin)
- **Nom, après :** Poissons à haute teneur en mercure (espadon, requin, marlin, thon)
- **Détails, avant :** Le mercure s'accumule dans les gros poissons prédateurs. Limiter à 150g/semaine max.
- **Détails, après :** Le mercure s'accumule dans les gros poissons prédateurs. Évitez l'espadon, le marlin, le requin et la lamproie. Pour les autres poissons prédateurs sauvages, comme le thon, limitez-vous à 150 g par semaine.

Les versions anglaise, arabe et tunisienne ont été réécrites à l'identique.

**Limite connue :** l'entrée regroupe sous un seul badge « À éviter » des poissons à éviter
(espadon, requin, marlin) et un poisson à limiter (thon). Le texte fait la distinction, le
badge non. Si vous préférez deux entrées distinctes, indiquez-le ici.

| OK / CORRIGER | Correction |
|---|---|
| | |

---

## 2. Compléments — `src/data/supplements_db.json`

Les classifications : `ok` = « Sans danger », `a_surveiller` = « Avec modération »,
`deconseille` = « À éviter ».

| # | Complément | Avant | Après | Ce qui se contredisait | OK / CORRIGER | Correction |
|---|---|---|---|---|---|---|
| 5 | `s11_vitamine_a` — Vitamine A | `a_surveiller` | `deconseille` | L'écran « Aliments à éviter » classe les compléments de vitamine A (rétinol) `high` (« Évitez les compléments sauf avis médical »). L'écran Compléments la classait au même niveau que la vitamine C. | | |
| 6 | `s15_selenium` — Sélénium | `a_surveiller` | `deconseille` | Son propre texte dit : « La supplémentation doit être évitée sauf en cas de carence avérée et sur avis médical. » Texte inchangé. | | |

### Texte précisé — `s11_vitamine_a`, dose

Pour qu'une fiche « À éviter » n'affiche pas une dose qui se lise comme une posologie de
complément, la phrase précise que l'apport inclut l'alimentation. Les chiffres sont inchangés.

- **Avant :** L'apport recommandé est de 770 µg ER par jour. […]
- **Après :** L'apport recommandé, alimentation comprise, est de 770 µg ER par jour. […]

En arabe et en tunisien, l'abréviation latine « (ER) » accolée à « مكافئ ريتينول » a été retirée
(le terme arabe est conservé).

| OK / CORRIGER | Correction |
|---|---|
| | |

---

## 3. Assistant (chatbot) — `src/data/chatbot_data.ts`, `src/services/chatbotService.ts`

| # | Élément | Avant | Après | Raison | OK / CORRIGER | Correction |
|---|---|---|---|---|---|---|
| 7 | Signe d'alerte `hemorragie_antepartum`, message | « Ces signes peuvent indiquer une complication grave (placenta prævia, décollement placentaire, fausse couche tardive). Consultez immédiatement… » | « Un saignement pendant la grossesse peut être le signe d'une complication grave. Consultez immédiatement un médecin, une maternité ou les services d'urgence. Ne vous déplacez pas seule. » | L'assistant ne connaît pas le terme : « fausse couche tardive » était affiché à 32 semaines. La consigne (consulter immédiatement) est inchangée ; seule la liste de diagnostics est retirée. | | |
| 8 | Réponses de niveau **urgence**, phrase de fin | « N'hésitez pas à contacter votre médecin ou les services d'urgence si besoin. » ajoutée après le message | phrase supprimée | Elle adoucissait la consigne « consultez immédiatement » qui la précède. Le bouton d'appel reste affiché. | | |
| 9 | Signes `hemorragie_antepartum` et douleur abdominale, article lié | « Grossesses multiples » | lien retiré (reste « Examens médicaux ») | Article sans rapport avec le signe. | | |
| 10 | Suggestion `cs19`, liée au signe « gonflement du visage » (pré-éclampsie) | « Je me sens gonflée » / “I feel bloated” / « أشعر بالانتفاخ » | « J'ai le visage, les mains ou les pieds gonflés » / “My face, hands or feet are swollen” / « لدي تورّم في الوجه أو اليدين أو القدمين » | L'anglais et l'arabe parlaient de ballonnement digestif. **Conséquence à valider :** la suggestion décrit maintenant le signe lui-même, donc la toucher déclenche le bloc d'alerte de ce signe (auparavant, aucune alerte). | | |
| 11 | Question « Quels aliments éviter ? » | réponse vide (« Voici ce que je sais : ») | liste des entrées `critical` et `high` de `forbidden_foods.json` + lien vers l'écran | La liste est lue dans les données de l'écran : elle ne peut pas en diverger. | | |

---

## Attestation

Nom, qualité, date et signature du relecteur :

&nbsp;

Après signature, l'attestation est recopiée dans le message du commit correspondant
(voir `README.md`, « Ce qui se passe après une signature »).
