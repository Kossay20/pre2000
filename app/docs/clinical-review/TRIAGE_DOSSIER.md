# Dossier de revue — Triage de l'assistant

> **À l'attention de : sage-femme ou gynécologue-obstétricien·ne**

## Ce qui vous est demandé

L'assistant lit ce que l'utilisatrice écrit et, sur détection de certains signes, l'oriente : urgences, consultation sans délai, ou simple information. Ce dossier liste chaque signe, le message renvoyé, et surtout le niveau d'urgence attribué.

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

**Source de vérité :** `src/data/chatbot_data.ts (RED_FLAGS)`
**Généré le :** 2026-08-25 par `scripts/generate-clinical-dossier.ts`

---

> ⚠️ **13 des 15 signes n'ont aucune source citée.** Ils sont signalés
> dans les tableaux ci-dessous. Une orientation vers les urgences sans référence est le premier
> endroit à regarder.

## Comment l'assistant décide

Trois niveaux, du plus grave au moins grave. Quand plusieurs signes sont détectés
dans un même message, **le plus grave l'emporte** :

| Niveau | Priorité | Ce que l'application dit de faire |
|---|---|---|
| `emergency` | 3 | Urgences immédiates |
| `urgent_consult` | 2 | Consulter sans attendre |
| autre | 1 | Information, pas d'orientation d'urgence |

**La question qui vous est posée pour chaque ligne n'est pas seulement « le message est-il correct ? »
mais « le niveau est-il le bon ? ». Un signe classé trop bas retarde une prise en charge ;
classé trop haut, il envoie aux urgences une femme qui n'en avait pas besoin.**

---

## Niveau `emergency` — 6 signes

| # | Signe | Message envoyé à l'utilisatrice | Sources citées | OK / CORRIGER / RETIRER | Correction |
|---|---|---|---|---|---|
| 1 | **sang rouge vif**<br>`hemorragie_antepartum` | Ces signes peuvent indiquer une complication grave (placenta prævia, décollement placentaire, fausse couche tardive). Consultez immédiatement un médecin, une maternité ou les services d’urgence. Ne vous déplacez pas seule. | OMS 2024, ACOG 2023, NHS | | |
| 2 | **difficulté à respirer**<br>`essoufflement` | Ces signes peuvent indiquer une complication cardiaque ou pulmonaire grave (embolie pulmonaire). Appelez immédiatement les services d'urgence. | **⚠️ aucune** | | |
| 3 | **mal-être**<br>`pensées suicidaires` | Si vous avez des pensées de vous faire du mal ou de faire du mal à votre bébé, il s'agit d'une urgence psychiatrique. Contactez immédiatement les services d'urgence ou un professionnel de santé mentale. | **⚠️ aucune** | | |
| 4 | **Convulsions / éclampsie**<br>`perte de conscience` | Les convulsions ou une perte de conscience peuvent être un signe d'éclampsie (complication grave de la pré-éclampsie). Appelez immédiatement les services d'urgence. | **⚠️ aucune** | | |
| 5 | **syndrome HELLP**<br>`douleur foie` | Ces signes peuvent indiquer une complication grave comme le syndrome HELLP ou une pré-éclampsie sévère. Consultez immédiatement les services d'urgence. | **⚠️ aucune** | | |
| 6 | **perte de sang**<br>`hemorragie_postpartum` | Un saignement abondant après l'accouchement est une urgence vitale. Appelez immédiatement les services d'urgence. | **⚠️ aucune** | | |

---

## Niveau `urgent_consult` — 9 signes

| # | Signe | Message envoyé à l'utilisatrice | Sources citées | OK / CORRIGER / RETIRER | Correction |
|---|---|---|---|---|---|
| 1 | **douleur unilatérale**<br>`crampes sévères` | Ces signes peuvent indiquer une complication (grossesse extra-utérine, décollement placentaire, appendicite). Consultez un médecin ou rendez-vous aux urgences sans attendre. | OMS 2024, ACOG 2023, NHS | | |
| 2 | **mouvements faibles**<br>`ne sens plus le bébé` | Une diminution des mouvements fœtaux peut être un signe de souffrance fœtale. Consultez immédiatement un médecin ou une maternité pour un contrôle. Ne tentez pas de stimuler le bébé vous-même. | **⚠️ aucune** | | |
| 3 | **douleur en barre**<br>`céphalée` | Ces signes, surtout s'ils sont accompagnés de troubles de la vision ou de douleurs à l'estomac, peuvent être un signe de pré-éclampsie. Consultez un médecin ou rendez-vous aux urgences sans attendre. | **⚠️ aucune** | | |
| 4 | **taches devant les yeux**<br>`éclairs lumineux` | Ces signes peuvent être liés à une hypertension artérielle ou à une pré-éclampsie. Consultez immédiatement un médecin ou une maternité. | **⚠️ aucune** | | |
| 5 | **infection**<br>`température élevée` | Une fièvre inexpliquée peut indiquer une infection grave. Consultez un médecin sans attendre pour un diagnostic et un traitement approprié. | **⚠️ aucune** | | |
| 6 | **déshydratation**<br>`ne garde rien` | Des vomissements si sévères que vous ne parvenez pas à vous hydrater nécessitent une prise en charge médicale pour éviter la déshydratation et la malnutrition. | **⚠️ aucune** | | |
| 7 | **œdème**<br>`gonflement visage` | Un œdème soudain et important du visage, des mains ou des pieds peut être un signe de pré-éclampsie. Consultez un médecin rapidement. | **⚠️ aucune** | | |
| 8 | **écoulement vaginal**<br>`liquide chaud` | Une perte de liquide (clair, jaune ou verdâtre) peut indiquer une rupture prématurée des membranes. Consultez immédiatement une maternité. | **⚠️ aucune** | | |
| 9 | **infection urinaire**<br>`cystite` | Ces signes peuvent indiquer une infection urinaire qui, si elle n'est pas traitée, peut entraîner une infection rénale ou un accouchement prématuré. Consultez un médecin. | **⚠️ aucune** | | |

---

## Signature

En signant, vous attestez avoir relu les 15 affirmations ci-dessus et
validé celles marquées OK, dans le périmètre décrit en tête de ce document.

| | |
|---|---|
| **Nom** | |
| **Qualification / n° d'ordre** | |
| **Date** | |
| **Périmètre signé** | Dossier de revue — Triage de l'assistant |
| **Signature** | |

Cette attestation sera recopiée dans le message du commit qui active le contenu
dans l'application. Aucun contenu de ce dossier n'est publié avant.
