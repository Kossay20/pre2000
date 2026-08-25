# Dossier de revue — Compléments alimentaires

> **À l'attention de : sage-femme ou gynécologue-obstétricien·ne**

## Ce qui vous est demandé

L'application affiche, pour chaque complément, une mention d'innocuité pendant la grossesse et une posologie. Ce sont les affirmations les plus directement actionnables de toute l'application : une utilisatrice peut lire une dose et la suivre. Elles n'ont jamais été relues par un professionnel.

**15 affirmations** sont listées ci-dessous. Pour chacune, trois réponses possibles :

| | Signification |
|---|---|
| **OK** | L'affirmation peut être publiée telle quelle |
| **CORRIGER** | Écrivez le texte de remplacement dans la colonne « Correction » |
| **RETIRER** | L'affirmation doit disparaître de l'application |

Une case laissée vide vaut **non revue** — l'affirmation ne sera pas publiée.

Vous n'avez pas à ouvrir l'application ni à lire de code. La colonne « Source »
indique où vit chaque texte, pour que votre correction soit appliquée exactement
là où il faut, sans interprétation.

**Source de vérité :** `src/data/supplements_db.json`
**Généré le :** 2026-08-25 par `scripts/generate-clinical-dossier.ts`

---

| # | Complément | Innocuité déclarée | Dose indiquée à l'utilisatrice | OK / CORRIGER / RETIRER | Correction |
|---|---|---|---|---|---|
| 1 | **Acide folique (Vitamine B9)** | `ok` | L'OMS et la HAS recommandent généralement 400 à 800 μg par jour, à débuter idéalement 4 semaines avant la conception. Certaines situations (antécédents, diabète) peuvent nécessiter des doses plus élevées sur avis médical. | | |
| 2 | **Fer** | `ok` | L'OMS recommande une supplémentation préventive de 30 à 60 mg de fer élémentaire par jour. En cas d'anémie avérée, la dose peut être augmentée à 100-200 mg par jour. La dose exacte doit être déterminée par un professionnel de santé après un bilan sanguin. | | |
| 3 | **Vitamine D** | `ok` | Le NHS (UK) recommande 10 µg (400 UI) par jour pour toutes les femmes enceintes. L'ACOG (USA) recommande 600 UI par jour. En France, une dose unique de 100 000 UI est souvent prescrite au 6ème ou 7ème mois. La dose doit être individualisée par un professionnel de santé. | | |
| 4 | **Iode** | `ok` | L'OMS et l'ACOG recommandent un apport de 220-250 µg par jour. La plupart des vitamines prénatales contiennent 150 µg d'iode. L'utilisation de sel de cuisine iodé est une stratégie de santé publique efficace. | | |
| 5 | **DHA (Oméga-3)** | `ok` | Les recommandations sont d'au moins 200 mg de DHA par jour. Cela peut être atteint en consommant 1 à 2 portions de poisson gras par semaine. Si l'apport alimentaire est insuffisant, une supplémentation est recommandée. | | |
| 6 | **Calcium** | `ok` | L'apport recommandé est de 1000 à 1300 mg par jour. La supplémentation n'est généralement nécessaire que si l'apport alimentaire (produits laitiers, légumes verts) est insuffisant. | | |
| 7 | **Magnésium** | `ok` | L'apport recommandé est de 350-360 mg par jour. La supplémentation (généralement 300 mg/jour) peut être envisagée en cas de crampes ou de risque d'hypertension, sur avis médical. | | |
| 8 | **Vitamine B12** | `ok` | L'apport recommandé est de 2,6 µg par jour. La plupart des vitamines prénatales contiennent cette dose. En cas de carence avérée, des doses plus élevées sont nécessaires sur prescription médicale. | | |
| 9 | **Zinc** | `a_surveiller` | L'apport recommandé est de 11-12 mg par jour. La supplémentation n'est généralement pas nécessaire avec une alimentation équilibrée. La limite supérieure est de 40 mg/jour. | | |
| 10 | **Vitamine C** | `a_surveiller` | L'apport recommandé est de 85-120 mg par jour, facilement atteint par une alimentation riche en fruits et légumes. La supplémentation n'est généralement pas nécessaire. | | |
| 11 | **Vitamine A** | `a_surveiller` | L'apport recommandé est de 770 µg ER par jour. La limite supérieure de sécurité est de 3000 µg ER (10 000 UI) par jour. Il est crucial de ne pas dépasser cette limite. | | |
| 12 | **Probiotiques** | `ok` | Il n'y a pas de dosage standard. La posologie dépend des souches spécifiques (Lactobacillus, Bifidobacterium). Il est recommandé de suivre les instructions du produit et de consulter un professionnel de santé. | | |
| 13 | **Choline** | `ok` | L'apport recommandé est de 450 mg par jour. La supplémentation peut être nécessaire pour atteindre cet objectif, sur avis médical. | | |
| 14 | **Vitamine K** | `ok` | L'apport recommandé est de 90 µg par jour, facilement atteint par l'alimentation. Aucune supplémentation de routine n'est recommandée. | | |
| 15 | **Sélénium** | `a_surveiller` | L'apport recommandé est de 60 µg par jour. La limite supérieure est de 400 µg/jour. La supplémentation doit être évitée sauf en cas de carence avérée et sur avis médical. | | |

### Notes longues affichées avec chaque complément

**1. Acide folique (Vitamine B9)** — `supplements_db.json[0].pregnancy_notes_fr`

> L'acide folique est crucial pendant les premières semaines de grossesse pour prévenir les anomalies du tube neural (spina bifida). La supplémentation doit idéalement commencer avant la conception et se poursuivre jusqu'à la 12e semaine. Les besoins augmentent de 50% pendant la grossesse.

**2. Fer** — `supplements_db.json[1].pregnancy_notes_fr`

> Les besoins en fer augmentent considérablement pendant la grossesse pour soutenir la croissance du fœtus et du placenta, ainsi que l'augmentation du volume sanguin maternel. La carence en fer est la cause la plus fréquente d'anémie pendant la grossesse, associée à un risque accru de faible poids de naissance et de naissance prématurée.

**3. Vitamine D** — `supplements_db.json[2].pregnancy_notes_fr`

> La carence en vitamine D est fréquente pendant la grossesse et est associée à un risque accru de pré-éclampsie, de diabète gestationnel et de faible poids de naissance. La supplémentation est particulièrement recommandée pour les femmes ayant une faible exposition au soleil ou une peau foncée.

**4. Iode** — `supplements_db.json[3].pregnancy_notes_fr`

> Les besoins en iode augmentent de près de 50% pendant la grossesse. Une carence peut entraîner des troubles du développement neurologique irréversibles chez l'enfant (crétinisme). La supplémentation est recommandée dans les zones où le sel n'est pas systématiquement iodé.

**5. DHA (Oméga-3)** — `supplements_db.json[4].pregnancy_notes_fr`

> Un apport suffisant en DHA est associé à une meilleure acuité visuelle et à un meilleur développement cognitif chez l'enfant. Il pourrait également réduire le risque d'accouchement prématuré.

**6. Calcium** — `supplements_db.json[5].pregnancy_notes_fr`

> Si l'apport maternel est insuffisant, le fœtus puise dans les réserves de la mère, ce qui peut augmenter son risque d'ostéoporose plus tard. Les besoins sont particulièrement élevés au troisième trimestre.

**7. Magnésium** — `supplements_db.json[6].pregnancy_notes_fr`

> Le magnésium peut aider à prévenir les crampes musculaires fréquentes pendant la grossesse. Il est également étudié pour son rôle potentiel dans la prévention de la pré-éclampsie et de la restriction de croissance fœtale.

**8. Vitamine B12** — `supplements_db.json[7].pregnancy_notes_fr`

> Une carence en B12 peut entraîner une anémie et des troubles neurologiques chez la mère et le fœtus. La supplémentation est essentielle pour les femmes végétariennes et végétaliennes.

**9. Zinc** — `supplements_db.json[8].pregnancy_notes_fr`

> Une carence en zinc peut être associée à un faible poids de naissance et à un accouchement prématuré. Cependant, l'OMS ne recommande pas la supplémentation systématique, sauf en cas de carence avérée.

**10. Vitamine C** — `supplements_db.json[9].pregnancy_notes_fr`

> La vitamine C est essentielle, mais l'OMS ne recommande pas la supplémentation systématique car les preuves de bénéfices sont insuffisantes et certaines études suggèrent un risque accru de rupture prématurée des membranes à haute dose.

**11. Vitamine A** — `supplements_db.json[10].pregnancy_notes_fr`

> Un excès de vitamine A sous forme de rétinol est tératogène et peut causer de graves malformations congénitales. La supplémentation n'est recommandée qu'en cas de carence avérée et sous stricte surveillance médicale.

**12. Probiotiques** — `supplements_db.json[11].pregnancy_notes_fr`

> Les probiotiques sont considérés comme sûrs pendant la grossesse. Ils peuvent aider à réduire le risque de diabète gestationnel, de pré-éclampsie, et d'allergies (eczéma) chez le bébé.

**13. Choline** — `supplements_db.json[12].pregnancy_notes_fr`

> La plupart des femmes enceintes n'atteignent pas l'apport recommandé en choline par l'alimentation seule. La choline joue un rôle clé dans la prévention des anomalies du tube neural et le développement cognitif de l'enfant.

**14. Vitamine K** — `supplements_db.json[13].pregnancy_notes_fr`

> La supplémentation prénatale n'est généralement pas nécessaire, car la carence est rare. L'enjeu principal est la prévention de la maladie hémorragique du nouveau-né par une injection à la naissance.

**15. Sélénium** — `supplements_db.json[14].pregnancy_notes_fr`

> Une carence peut être liée à un risque de pré-éclampsie et de troubles thyroïdiens. Cependant, la supplémentation systématique n'est pas recommandée car un excès est toxique.


---

## Signature

En signant, vous attestez avoir relu les 15 affirmations ci-dessus et
validé celles marquées OK, dans le périmètre décrit en tête de ce document.

| | |
|---|---|
| **Nom** | |
| **Qualification / n° d'ordre** | |
| **Date** | |
| **Périmètre signé** | Dossier de revue — Compléments alimentaires |
| **Signature** | |

Cette attestation sera recopiée dans le message du commit qui active le contenu
dans l'application. Aucun contenu de ce dossier n'est publié avant.
