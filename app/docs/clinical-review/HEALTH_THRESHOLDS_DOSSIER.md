# Dossier de revue — Seuils de l'écran « Ma Santé » (glycémie, tension, poids)

> **À l'attention de : sage-femme ou gynécologue-obstétricien·ne**

## Ce qui vous est demandé

L'écran « Ma Santé » laisse l'utilisatrice saisir sa glycémie à jeun, sa tension et son
poids. Quand une valeur franchit un seuil, l'application affiche un message **avant
l'enregistrement** (elle peut toujours enregistrer quand même), puis marque la ligne
dans l'historique. Ces seuils et ces messages sont du contenu médical : **aucun n'a été
relu par un professionnel de santé.**

Deux seuils ont été modifiés le 2026-10-01 (audit de sortie, constat B-010). Ils sont
marqués **MODIFIÉ** ci-dessous. Les sources citées sont celles que le développement a
retenues ; **la vérification de ces références fait partie de ce qui vous est demandé.**

Pour chaque ligne, trois réponses possibles :

| | Signification |
|---|---|
| **OK** | Le seuil et le message peuvent être publiés tels quels |
| **CORRIGER** | Écrivez la valeur ou le texte de remplacement |
| **RETIRER** | L'alerte doit disparaître de l'application |

Une case laissée vide vaut **non revue**.

**Source de vérité des seuils :** `src/utils/clinicalChecks.ts` (`checkGlucose`,
`checkBloodPressure`, `checkWeightChange`, `summarizeGlucoseMonth`)
**Source de vérité des messages :** `src/i18n/locales/{fr,en,ar,tn}/dashboard.json → alerts`
**Tests qui verrouillent ces valeurs :** `src/utils/__tests__/clinicalChecks.test.ts`
**Rédigé à la main le :** 2026-10-01 (ce dossier n'est pas produit par
`scripts/generate-clinical-dossier.ts`).

**Unité :** l'application ne saisit et n'affiche la glycémie qu'en **mmol/L**. Toutes les
mesures sont enregistrées comme « à jeun » : l'écran ne propose pas de mesure
post-prandiale.

---

## A. Glycémie à jeun (mmol/L)

| # | Valeur saisie | Niveau | Ce que l'application fait | Statut |
|---|---|---|---|---|
| A1 | < 3,5 | critique | Message « Glycémie basse » + bouton d'appel des urgences | inchangé |
| A2 | 3,5 à < 5,1 | — | Aucune alerte ; compte comme « dans l'objectif » | **MODIFIÉ** (était 3,5 à 5,5) |
| A3 | 5,1 à 6,9 | à surveiller | Message « Glycémie à surveiller » (texte ci-dessous) | **MODIFIÉ** (commençait à 5,6) |
| A4 | 7,0 à 10,0 | élevé | Message « Glycémie élevée » | inchangé |
| A5 | > 10,0 | critique | Message « Glycémie très élevée » + bouton d'appel des urgences | inchangé |

**Référence retenue pour A2/A3 :** glycémie à jeun ≥ 5,1 mmol/L (0,92 g/L, 92 mg/dL) =
critère de diabète gestationnel IADPSG 2010, repris par l'OMS (2013) et, en France, par
les recommandations CNGOF/SFD 2010. **Référence retenue pour A4 :** ≥ 7,0 mmol/L =
« diabète pendant la grossesse » selon l'OMS 2013.

### Questions pour le relecteur

1. **A2/A3 — le seuil de 5,1 mmol/L** est-il le bon pour une mesure à jeun faite à
   domicile par l'utilisatrice (lecteur capillaire), et pas seulement pour le dépistage
   au laboratoire ?
2. **A1 — le seuil bas de 3,5 mmol/L** et son niveau « critique » (bouton d'appel des
   urgences) sont-ils adaptés ? Cette valeur n'a pas été modifiée et n'a pas de source
   citée dans le code.
3. **A3 — le délai indiqué** (« dans les prochains jours, sans attendre la prochaine
   consultation ») est-il le bon ?
4. **Le texte d'objectif affiché sur la carte** (ci-dessous) est-il acceptable ?
5. La carte affiche pour le mois en cours l'une de ces trois mentions, calculée à partir
   des mesures : « Aucune mesure ce mois-ci » / « Mesures du mois dans l'objectif » /
   « Mesure hors objectif ce mois-ci » (dès qu'une seule mesure du mois déclenche A1, A3,
   A4 ou A5). Est-ce acceptable ?

### Textes — `glucoseTarget` (objectif affiché sur la carte) — MODIFIÉ

- **fr** — Objectif à jeun : de 3,5 à moins de 5,1 mmol/L
- **en** — Fasting target: 3.5 to below 5.1 mmol/L
- **ar** — الهدف على الريق: من 3.5 إلى أقل من 5.1 mmol/L
- **tn** — الهدف على الريق: من 3,5 لأقل من 5,1 mmol/L

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

### Textes — `alerts.glucoseSurveillance.message` (A3) — MODIFIÉ

- **fr** — À jeun, une glycémie de 5,1 mmol/L (0,92 g/L) ou plus dépasse le seuil retenu pendant la grossesse. Si cette mesure a bien été prise à jeun, parlez-en à votre sage-femme ou à votre médecin dans les prochains jours, sans attendre la prochaine consultation.
- **en** — In pregnancy, a fasting reading of 5.1 mmol/L (92 mg/dL) or more is above the threshold used. If this really was a fasting reading, tell your midwife or doctor in the next few days — don't wait for your next visit.
- **ar** — أثناء الحمل، قياس السكر على الريق 5.1 mmol/L (0.92 غ/ل) أو أكثر يتجاوز الحدّ المعتمد. إذا كان القياس فعلاً على الريق، أخبري القابلة أو الطبيب خلال الأيام القادمة دون انتظار الزيارة القادمة.
- **tn** — في الحمل، السكر على الريق 5,1 mmol/L (0,92 غ/ل) ولا أكثر يفوت الحدّ المعتمد. إذا القياس كان بالحق على الريق، قولي للقابلة ولا للطبيب في الأيام الجاية، وما تستنّايش الزيارة الجاية.

Ancien texte (fr) : « Cette valeur est légèrement au-dessus de la normale. Notez-la et
mentionnez-la lors de votre prochain rendez-vous. »

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

### Textes inchangés (A1, A4, A5) — à relire aussi

- **A1 `glucoseLow`** (fr) — Glycémie basse détectée. Si vous vous sentez mal, prenez du sucre rapide (jus, miel) et contactez votre professionnel de santé.
- **A4 `glucoseHigh`** (fr) — Glycémie élevée. Mentionnez-le à votre professionnel de santé sans tarder.
- **A5 `glucoseVeryHigh`** (fr) — Glycémie très élevée. Contactez votre professionnel de santé rapidement.

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

## B. Tension artérielle (mmHg)

Les seuils sont appliqués **quel que soit le terme** : l'application ne distingue pas
avant et après 20 SA.

| # | Valeur saisie | Niveau | Ce que l'application fait | Statut |
|---|---|---|---|---|
| B1 | systolique ≥ 160 **ou** diastolique ≥ 110 | critique | Message « Tension très élevée » + bouton d'appel des urgences | inchangé |
| B2 | systolique 140–159 **ou** diastolique 90–109 | élevé | Message « Tension élevée » : contacter sage-femme/médecin **dans les 24 heures** | seuil inchangé, **message MODIFIÉ** (disait « lors de votre prochain rendez-vous ») |
| B3 | systolique < 90 **ou** diastolique < 60 | à surveiller | Message « Tension basse » | inchangé |
| B4 | systolique 130–139 **ou** diastolique 80–89 | à surveiller | Message « Tension à surveiller » : en parler au prochain rendez-vous | inchangé |

**Référence retenue pour B2 :** une tension ≥ 140/90 pendant la grossesse (après 20 SA :
hypertension gravidique, pré-éclampsie possible) appelle une évaluation médicale rapide,
et non au prochain rendez-vous de suivi — NICE NG133, ACOG Practice Bulletin 222.

### Questions pour le relecteur

1. **B2 — le délai « dans les 24 heures »** est-il le bon pour une mesure isolée à
   domicile ≥ 140/90 ? Faut-il demander une seconde mesure après repos avant de contacter ?
2. **B2 — les signes associés** cités dans le message (forts maux de tête, troubles de la
   vue, douleur en haut du ventre → appeler les urgences) sont-ils les bons, et la liste
   est-elle suffisante ?
3. **B2 avant 20 SA :** le même message convient-il ?
4. **B4 — le palier 130/80** (« à surveiller ») est-il pertinent pendant la grossesse ?
5. **B3 — le palier bas 90/60** est-il pertinent ?

### Textes — `alerts.bpHigh.message` (B2) — MODIFIÉ

- **fr** — Tension de 140/90 ou plus. Contactez votre sage-femme ou votre médecin dans les 24 heures pour la faire contrôler, sans attendre la prochaine consultation. Si vous avez aussi de forts maux de tête, des troubles de la vue ou une douleur en haut du ventre, appelez les urgences.
- **en** — Blood pressure of 140/90 or higher. Contact your midwife or doctor within 24 hours to have it checked — don't wait for your next visit. If you also have a severe headache, vision problems or pain in the upper belly, call emergency services.
- **ar** — ضغط الدم 140/90 أو أكثر. اتصلي بالقابلة أو الطبيب خلال 24 ساعة لفحصه، ولا تنتظري الزيارة القادمة. إذا كان لديكِ أيضاً صداع شديد أو اضطراب في الرؤية أو ألم في أعلى البطن، اتصلي بالطوارئ.
- **tn** — الضغط 140/90 ولا أكثر. كلّمي القابلة ولا الطبيب في ظرف 24 ساعة باش يثبّتو فيه، وما تستنّايش الزيارة الجاية. إذا عندك زادة وجيعة راس قوية، ولا تشوفي مضبّب، ولا وجيعة في فوق الكرش، كلّمي الإسعاف.

Ancien texte (fr) : « Tension élevée. Mentionnez-le à votre professionnel de santé lors de
votre prochain rendez-vous. »

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

### Textes inchangés (B1, B3, B4) — à relire aussi

- **B1 `bpSevere`** (fr) — Tension très élevée. Contactez votre professionnel de santé sans attendre — risque de pré-éclampsie.
- **B3 `bpLow`** (fr) — Tension basse. Reposez-vous, hydratez-vous, et mentionnez-le à votre médecin si cela persiste.
- **B4 `bpPreHyp`** (fr) — Votre tension est légèrement au-dessus de la normale. Notez-la et mentionnez-la lors de votre prochain rendez-vous.

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

## C. Variation de poids entre deux pesées (kg) — inchangé

| # | Écart avec la pesée précédente | Niveau | Message |
|---|---|---|---|
| C1 | perte > 3 kg | élevé | « Perte de poids importante » : contacter le médecin |
| C2 | écart > 2 kg (dans un sens ou l'autre) | à surveiller | « Variation de poids importante » : vérifier la saisie |

L'écart n'est pas rapporté au temps écoulé entre les deux pesées.

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

## D. Objectif d'hydratation — valeur à fixer

Deux chiffres différents étaient affichés à la même utilisatrice le même jour (constat
B-013) :

- **Rappels → Hydratation :** objectif par défaut de **3 L** par jour
  (`src/services/hydrationService.ts`, `dailyGoal: 3000` ; `src/components/reminders/HydrationCard.tsx`),
  modifiable par l'utilisatrice.
- **Mon Poids → conseil du 3ᵉ trimestre :** « Hydratation importante (**2L/jour**) ».

Le chiffre a été **retiré du conseil** (il dit maintenant « Hydratez-vous régulièrement
pour limiter la rétention d'eau », `weight.json → suggestions.t3Hydration`) pour que
l'application ne se contredise plus. **L'objectif par défaut de 3 L n'a pas été changé et
n'a pas de source citée : sa valeur est à fixer par le relecteur.**

| Question | Réponse |
|---|---|
| Objectif d'hydratation par défaut à proposer pendant la grossesse (L/jour) | |
| Le lien « hydratation → limiter la rétention d'eau » peut-il rester affirmé ? | |
