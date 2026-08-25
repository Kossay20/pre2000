# Dossier de revue — Questions du profil médical

> **À l'attention de : sage-femme ou gynécologue-obstétricien·ne**

## Ce qui vous est demandé

Une question posée sur un diagnostic est du contenu médical, même quand elle ne fait que le recueillir. Ces six textes sont les seuls du dossier qui ont été écrits récemment ; les autres sont en place depuis l'origine de l'application.

**6 affirmations** sont listées ci-dessous. Pour chacune, trois réponses possibles :

| | Signification |
|---|---|
| **OK** | L'affirmation peut être publiée telle quelle |
| **CORRIGER** | Écrivez le texte de remplacement dans la colonne « Correction » |
| **RETIRER** | L'affirmation doit disparaître de l'application |

Une case laissée vide vaut **non revue** — l'affirmation ne sera pas publiée.

Vous n'avez pas à ouvrir l'application ni à lire de code. La colonne « Source »
indique où vit chaque texte, pour que votre correction soit appliquée exactement
là où il faut, sans interprétation.

**Source de vérité :** `src/i18n/locales/{fr,en,ar,tn}/common.json → medicalProfile`
**Généré le :** 2026-08-25 par `scripts/generate-clinical-dossier.ts`

---

L'application demande désormais à l'utilisatrice, une fois pendant l'inscription et modifiable ensuite,
si un professionnel lui a signalé un diabète gestationnel, une hypertension de grossesse ou une grossesse
gémellaire. La réponse ne sert qu'à ajuster les rappels proposés.

**Le point de vigilance :** la formulation ne doit à aucun moment demander à l'utilisatrice de
s'auto-diagnostiquer, ni laisser entendre que l'application évalue un risque. Elle doit uniquement
recueillir ce qu'un professionnel lui a déjà dit.

### 1. `title`

- **fr** — Un suivi médical particulier ?
- **en** — Anything your doctor has flagged?
- **ar** — هل نبّهك طبيبك إلى شيء معيّن؟
- **tn** — الطبيب قالّك على حاجة خاصة؟

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

### 2. `intro`

- **fr** — Si votre médecin ou votre sage-femme vous a signalé l'un de ces points, dites-le-nous : certains rappels s'y adaptent. Sinon, passez — rien n'est obligatoire ici.
- **en** — If your doctor or midwife has mentioned one of these, tell us — some reminders adapt to it. Otherwise skip; nothing here is required.
- **ar** — إذا ذكر لك طبيبك أو قابلتك إحدى هذه النقاط، فأخبرينا: بعض التذكيرات تتكيّف معها. وإلّا فتجاوزي هذه الخطوة — لا شيء هنا إجباري.
- **tn** — كان الطبيب ولا القابلة قالّك على حاجة من هاذي، قولّنا: فمّا تذكيرات تتبدّل على حسبها. وإلّا تنجّم تتخطّى — ما فمّا حتى حاجة إجبارية.

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

### 3. `gestationalDiabetes`

- **fr** — Diabète gestationnel
- **en** — Gestational diabetes
- **ar** — سكّري الحمل
- **tn** — سكّري الحمل

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

### 4. `hypertension`

- **fr** — Hypertension de la grossesse
- **en** — Pregnancy hypertension
- **ar** — ارتفاع ضغط الدم في الحمل
- **tn** — الضغط في الحمل

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

### 5. `twins`

- **fr** — Grossesse gémellaire
- **en** — Twin pregnancy
- **ar** — حمل بتوأم
- **tn** — حمل توأم

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |

---

### 6. `privacyNote`

- **fr** — Ces informations restent sur votre téléphone et dans votre compte. Elles servent uniquement à ajuster vos rappels, et ne remplacent aucun avis médical.
- **en** — This stays on your phone and in your account. It is used only to adjust your reminders, and replaces no medical advice.
- **ar** — تبقى هذه المعلومات على هاتفك وفي حسابك. تُستعمل فقط لضبط تذكيراتك، وهي لا تغني عن أيّ رأي طبّي.
- **tn** — المعلومات هاذي تبقى في تليفونك وفي حسابك. تتستعمل برك باش نعدّلو التذكيرات متاعك، وما تعوّضش رأي الطبيب.

| Verdict | |
|---|---|
| OK / CORRIGER / RETIRER | |
| Correction | |


---

## Signature

En signant, vous attestez avoir relu les 6 affirmations ci-dessus et
validé celles marquées OK, dans le périmètre décrit en tête de ce document.

| | |
|---|---|
| **Nom** | |
| **Qualification / n° d'ordre** | |
| **Date** | |
| **Périmètre signé** | Dossier de revue — Questions du profil médical |
| **Signature** | |

Cette attestation sera recopiée dans le message du commit qui active le contenu
dans l'application. Aucun contenu de ce dossier n'est publié avant.
