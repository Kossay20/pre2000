# Protocole de levée — ce qu'on fait quand une signature arrive

Deux écrans sont **éteints** dans l'application. Ils sont écrits, traduits en quatre
langues, testés et fonctionnels. Ils ne s'allument pas parce que leur contenu porte,
en toutes lettres et dans les quatre langues, la mention qu'il n'a pas été relu.

| Drapeau | Écran | Attend |
|---|---|---|
| `RAMADAN_GUIDANCE_CLINICALLY_REVIEWED` | Ramadan et grossesse | sage-femme/gynécologue **et** référent religieux |
| `HALAL_GUIDANCE_REVIEWED` | Volet halal des aliments à éviter | imam **et** diététicien·ne |

Les deux drapeaux sont séparés exprès. Les relecteurs ne sont pas les mêmes personnes,
les deux accords n'arriveront pas ensemble, et lier les deux reviendrait à retenir un
écran signé en attendant l'autre.

---

## La règle qui ne se négocie pas

**Personne ne retire un bandeau d'avertissement pour débloquer un écran.**

C'est le pire scénario de ce dossier, et il est facile à commettre de bonne foi : le
bandeau gêne, l'écran est prêt, on retire le bandeau et on allume. Le résultat est un
contenu médical non relu, publié, sans plus rien qui le signale.

Le bandeau part **avec** la signature, dans le même commit. Ou il reste.

`__tests__/unreviewedContent.test.ts` fait respecter cela mécaniquement : tant qu'un
drapeau vaut `false`, le test exige que le bandeau existe dans les quatre langues. Il
n'est pas satisfaisable en supprimant le texte.

---

## Le geste, quand la signature arrive

Un seul commit. Trois choses dedans, jamais séparées :

**1. Le drapeau passe à `true`** — `src/config/featureFlags.ts`.

**2. Le bandeau disparaît des quatre langues.**

| Écran | Clé à retirer | Fichiers |
|---|---|---|
| Ramadan | `cycle8.ramadan.draftBanner` | `src/i18n/locales/{fr,en,ar,tn}/cycle8.json` |
| Halal | `cycle8.forbiddenFoodsHalal.draftNote` | `src/i18n/locales/{fr,en,ar,tn}/cycle8.json` |

Retirer aussi le rendu du bandeau dans l'écran correspondant, sinon la clé manquante
s'affiche brute à l'utilisatrice — c'est précisément ce que la suite de parité i18n
et les tests de fuite de clés attrapent.

**3. Pour le Ramadan uniquement** — aligner le marqueur de données :
`src/data/ramadan_pregnancy_guidance.json` → `_meta.review_status`, qui vaut
aujourd'hui `TODO_clinician_review`. Il doit refléter la signature. Le fichier et le
drapeau ne doivent jamais diverger : l'un dit que le contenu est validé, l'autre qu'il
ne l'est pas, et le prochain lecteur croira celui qui l'arrange.

**4. Le message de commit porte l'attestation** — c'est là qu'elle vit, pas dans un
fichier annexe qu'on oublie de mettre à jour :

```
feat(ramadan): activate the screen — content signed off

Reviewed and signed by:
  <Nom>, <qualification / n° d'ordre>, <date>
  <Nom>, <qualification>, <date>          # second relecteur si applicable
Scope: <titre exact du dossier signé>

Draft banner removed in fr/en/ar/tn in this same commit; the flag and the
banner move together by design.
```

---

## Ce qu'il faut relancer avant de pousser

```bash
npm run verify      # dont unreviewedContent.test.ts, qui bascule de position
npm run e2e:web     # l'écran devient atteignable : les 4 langues doivent rendre
```

Pour le Ramadan, vérifier les **trois** portes d'entrée, pas seulement le menu :
l'écran avait un point d'entrée sur l'accueil, un enregistrement de route, **et** un
lien profond `/ramadan`. Les trois sont derrière le drapeau. C'est la leçon de
`DiagnosticScreen`, qui était masqué du menu mais restait joignable par URL en
production.

---

## Si une signature n'arrive jamais

Ce n'est pas un blocage de publication. Les deux écrans sont éteints, l'application
part sans eux, et rien dans les fiches store ne les mentionne. Ils s'allumeront dans
une mise à jour, ou pas.

Ce qui serait un blocage, c'est de les allumer sans signature.
