# Dossier de revue — Aliments à éviter

> **À l'attention de : sage-femme, gynécologue-obstétricien·ne ou diététicien·ne**

## Ce qui vous est demandé

L'écran « aliments à éviter » est l'un des plus consultés d'une application de grossesse. Chaque entrée énonce un risque sanitaire ; ce sont des affirmations médicales.

**19 affirmations** sont listées ci-dessous. Pour chacune, trois réponses possibles :

| | Signification |
|---|---|
| **OK** | L'affirmation peut être publiée telle quelle |
| **CORRIGER** | Écrivez le texte de remplacement dans la colonne « Correction » |
| **RETIRER** | L'affirmation doit disparaître de l'application |

Une case laissée vide vaut **non revue** — l'affirmation ne sera pas publiée.

Vous n'avez pas à ouvrir l'application ni à lire de code. La colonne « Source »
indique où vit chaque texte, pour que votre correction soit appliquée exactement
là où il faut, sans interprétation.

**Source de vérité :** `src/data/forbidden_foods.json`
**Généré le :** 2026-10-01 par `scripts/generate-clinical-dossier.ts`

---

| # | Aliment | Risque énoncé | OK / CORRIGER / RETIRER | Correction |
|---|---|---|---|---|
| 1 | **Poisson cru (sushi, sashimi)**<br>*Poissons et fruits de mer* | Listériose, parasites, toxoplasmose | | |
| 2 | **Fruits de mer crus (huîtres, moules)**<br>*Poissons et fruits de mer* | Listériose, hépatite A, salmonellose | | |
| 3 | **Poisson fumé (saumon fumé, truite fumée)**<br>*Poissons et fruits de mer* | Listériose | | |
| 4 | **Poissons à haute teneur en mercure (espadon, requin, marlin, thon)**<br>*Poissons et fruits de mer* | Mercure - toxique pour le développement neurologique du bébé | | |
| 5 | **Fromages au lait cru (brie, camembert, roquefort)**<br>*Produits laitiers* | Listériose | | |
| 6 | **Feta et fromage de chèvre frais (au lait cru)**<br>*Produits laitiers* | Listériose | | |
| 7 | **Œufs crus ou peu cuits**<br>*Œufs* | Salmonellose | | |
| 8 | **Mayonnaise maison, mousse au chocolat, tiramisu**<br>*Œufs* | Salmonellose (œufs crus) | | |
| 9 | **Viande crue ou saignante (tartare, carpaccio)**<br>*Viandes* | Toxoplasmose, salmonellose, E. coli | | |
| 10 | **Charcuterie (jambon cru, saucisson, pâté)**<br>*Viandes* | Toxoplasmose, listériose | | |
| 11 | **Foie gras et foie (toutes viandes)**<br>*Viandes* | Excès de vitamine A (tératogène) | | |
| 12 | **Rillettes, pâtés, terrines**<br>*Viandes* | Listériose | | |
| 13 | **Alcool (toutes formes)**<br>*Boissons* | Syndrome d'alcoolisation fœtale (SAF) | | |
| 14 | **Caféine en excès (>200mg/jour)**<br>*Boissons* | Fausse couche, petit poids de naissance | | |
| 15 | **Graines germées crues (soja, luzerne)**<br>*Légumes* | E. coli, salmonellose | | |
| 16 | **Légumes/fruits non lavés**<br>*Légumes* | Toxoplasmose | | |
| 17 | **Certaines tisanes (sauge, romarin, réglisse)**<br>*Herbes et compléments* | Effets utérotoniques ou hormonaux | | |
| 18 | **Soja en excès**<br>*Herbes et compléments* | Phytoestrogènes (perturbateurs endocriniens) | | |
| 19 | **Compléments de vitamine A (rétinol)**<br>*Herbes et compléments* | Malformations fœtales | | |

### Explications longues

**1. Poisson cru (sushi, sashimi)** — `forbidden_foods.json[0].details_fr`

> Les poissons crus peuvent contenir des bactéries et parasites dangereux pour le fœtus.

**2. Fruits de mer crus (huîtres, moules)** — `forbidden_foods.json[1].details_fr`

> Les fruits de mer crus sont très à risque de contamination bactérienne.

**3. Poisson fumé (saumon fumé, truite fumée)** — `forbidden_foods.json[2].details_fr`

> Le fumage à froid ne détruit pas toutes les bactéries. Éviter sauf si bien cuit ensuite.

**4. Poissons à haute teneur en mercure (espadon, requin, marlin, thon)** — `forbidden_foods.json[3].details_fr`

> Le mercure s'accumule dans les gros poissons prédateurs. Évitez l'espadon, le marlin, le requin et la lamproie. Pour les autres poissons prédateurs sauvages, comme le thon, limitez-vous à 150 g par semaine.

**5. Fromages au lait cru (brie, camembert, roquefort)** — `forbidden_foods.json[4].details_fr`

> Les fromages à pâte molle au lait cru sont à éviter. Vérifiez les étiquettes.

**6. Feta et fromage de chèvre frais (au lait cru)** — `forbidden_foods.json[5].details_fr`

> OK si au lait pasteurisé. Vérifiez l'étiquette.

**7. Œufs crus ou peu cuits** — `forbidden_foods.json[6].details_fr`

> Évitez les œufs avec le jaune coulant et les préparations à base d'œufs crus.

**8. Mayonnaise maison, mousse au chocolat, tiramisu** — `forbidden_foods.json[7].details_fr`

> Ces préparations contiennent des œufs crus non pasteurisés.

**9. Viande crue ou saignante (tartare, carpaccio)** — `forbidden_foods.json[8].details_fr`

> La viande doit être cuite à cœur pour éliminer tous les risques.

**10. Charcuterie (jambon cru, saucisson, pâté)** — `forbidden_foods.json[9].details_fr`

> Les charcuteries non cuites présentent des risques. Le jambon blanc cuit est OK.

**11. Foie gras et foie (toutes viandes)** — `forbidden_foods.json[10].details_fr`

> Le foie contient des quantités très élevées de vitamine A, toxique à forte dose pour le fœtus.

**12. Rillettes, pâtés, terrines** — `forbidden_foods.json[11].details_fr`

> Ces produits sont à risque même s'ils semblent cuits.

**13. Alcool (toutes formes)** — `forbidden_foods.json[12].details_fr`

> Aucune quantité d'alcool n'est sans risque pendant la grossesse. L'alcool traverse le placenta.

**14. Caféine en excès (>200mg/jour)** — `forbidden_foods.json[13].details_fr`

> Limitez à 1-2 tasses de café par jour. Attention aux sodas et thés !

**15. Graines germées crues (soja, luzerne)** — `forbidden_foods.json[14].details_fr`

> Les graines germées peuvent être contaminées. Les cuire avant consommation.

**16. Légumes/fruits non lavés** — `forbidden_foods.json[15].details_fr`

> Lavez soigneusement tous les fruits et légumes avant consommation.

**17. Certaines tisanes (sauge, romarin, réglisse)** — `forbidden_foods.json[16].details_fr`

> Certaines plantes peuvent provoquer des contractions ou interférer avec les hormones.

**18. Soja en excès** — `forbidden_foods.json[17].details_fr`

> Limitez la consommation de produits à base de soja.

**19. Compléments de vitamine A (rétinol)** — `forbidden_foods.json[18].details_fr`

> L'excès de vitamine A est tératogène. Évitez les compléments sauf avis médical.


---

## Signature

En signant, vous attestez avoir relu les 19 affirmations ci-dessus et
validé celles marquées OK, dans le périmètre décrit en tête de ce document.

| | |
|---|---|
| **Nom** | |
| **Qualification / n° d'ordre** | |
| **Date** | |
| **Périmètre signé** | Dossier de revue — Aliments à éviter |
| **Signature** | |

Cette attestation sera recopiée dans le message du commit qui active le contenu
dans l'application. Aucun contenu de ce dossier n'est publié avant.
