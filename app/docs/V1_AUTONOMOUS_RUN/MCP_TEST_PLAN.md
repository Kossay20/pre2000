# Plan de test interactif via Playwright MCP (Cycle 6)

**Date** : 2026-05-08
**Prérequis** : Playwright MCP installé (`npx @playwright/mcp@latest`).
**Restart Claude requis** pour exposer les tools `mcp__playwright__*`.

---

## État infrastructure

- ✅ Playwright MCP server : `claude mcp add playwright -- npx -y @playwright/mcp@latest` → connected
- ✅ Expo web démarré : `http://localhost:8081/` → HTTP 200 (background nohup)
- ✅ Logs Expo : `/tmp/expo-mcp.log`

---

## Tools attendus après restart

Après restart Claude, les tools suivants seront disponibles (préfixe `mcp__playwright__`) :

- `browser_navigate` — goto URL
- `browser_snapshot` — accessibility tree (préféré aux screenshots pour analyse)
- `browser_take_screenshot` — capture PNG
- `browser_click` — click element
- `browser_type` — type text
- `browser_select_option` — select dropdown
- `browser_evaluate` — exec JS
- `browser_console_messages` — read console.log
- `browser_network_requests` — inspect HTTP traffic
- `browser_resize` — change viewport
- `browser_close` — fermer browser
- (autres : drag, hover, file upload, dialog handling, etc.)

---

## Plan de test interactif (post-restart)

### Test 1 — First-connection complet (guest pregnant)
1. `browser_navigate('http://localhost:8081/Language')`
2. `browser_snapshot` → confirmer 4 cards langues + bouton Continue
3. `browser_take_screenshot('mcp-01-language.png')`
4. `browser_click('Français')` (default déjà fr, optionnel)
5. `browser_click('Continuer')` → AuthChoice
6. `browser_take_screenshot('mcp-02-authchoice.png')`
7. `browser_click('Continuer en invité')` → Onboarding
8. `browser_take_screenshot('mcp-03-onboarding-step1.png')`
9. `browser_click('Je suis enceinte')` → step 2
10. `browser_take_screenshot('mcp-04-onboarding-step2.png')`
11. ...continuer jusqu'à MainTabs
12. Capture `mcp-XX-mainhome.png`

### Test 2 — Multi-language live switch
1. `browser_navigate('/Language')`
2. `browser_click('English')`
3. `browser_snapshot` → vérifier toast + bouton Continue devient "Continue"
4. `browser_take_screenshot('mcp-lang-en.png')`
5. `browser_click('العربية')`
6. `browser_snapshot` → vérifier RTL flip
7. `browser_take_screenshot('mcp-lang-ar-rtl.png')`

### Test 3 — Tabs navigation tour complet
- Pour chaque tab : Home / Calendar / Reminders / Resources / Chatbot
- `browser_click(tab name)`
- `browser_snapshot` (accessibility tree)
- `browser_take_screenshot(tab.png)`
- `browser_console_messages` → pas d'erreur runtime ?

### Test 4 — Chatbot interaction réelle
1. Tab Chatbot
2. `browser_take_screenshot('mcp-chatbot-empty.png')`
3. `browser_type` dans input "I have morning sickness"
4. `browser_click(send button)`
5. `browser_snapshot` → vérifier la réponse du bot
6. `browser_take_screenshot('mcp-chatbot-response.png')`

### Test 5 — Calendar Add Appointment flow
1. Tab Calendar
2. `browser_click('Add Appointment')`
3. `browser_type` Title "Echo 12 SA"
4. `browser_select_option(Type='Medical')`
5. Date picker interaction
6. `browser_click(Save)`
7. `browser_snapshot` → confirmer event créé OU Alert guest mode

### Test 6 — Profile screen
1. Tab Home → click profile button (top right)
2. `browser_take_screenshot('mcp-profile.png')`
3. `browser_snapshot` → audit champs visibles, vérifier no PII leak

### Test 7 — TTC mode flow complet
1. /Language → Continue → Continue as guest → Onboarding
2. Click "I am trying to conceive"
3. Capture chaque step TTC + verify pas de pregnancy content
4. `browser_take_screenshot('mcp-ttc-home.png')`

### Test 8 — Curious mode flow complet
1. Idem mais click "I am curious"
2. Verify banner "Discovery mode" visible sur Home

### Test 9 — Console errors audit
- Sur chaque écran : `browser_console_messages` → liste warnings/errors
- Liste les erreurs critiques à fixer

### Test 10 — Network requests audit
- `browser_network_requests` → confirmer pas de requête PII vers tier
- Confirmer Firestore queries OK ou en erreur attendue

---

## Output attendu

Pour chaque test :
- Snapshot accessibility tree (analyse structure)
- Screenshot PNG (analyse visuelle)
- Verdict : ✅ pass / ⚠️ warning / 🔴 fail
- Si fail : finding F1000+ documenté

Final : `MCP_TEST_REPORT.md` avec :
- Résumé tests passés/failed
- Liste findings nouveaux
- Recommandations P0/P1
- Comparaison avec tests Playwright file-based actuels (33 specs)

---

## Avantages vs Playwright file-based (déjà en place)

| Aspect | File-based (`npm run e2e:web`) | MCP interactif |
|--------|-------------------------------|----------------|
| Setup | `npm run e2e:web` | `mcp__playwright__browser_*` |
| Speed | ~4 min full suite | Lent (interaction par interaction) mais ciblé |
| Debug | Trace + video upload | Snapshot live + console live |
| Coverage | 33 specs scriptés | À la demande, exploratoire |
| Re-run | Re-script + re-build | Un seul flow par session |
| Best for | CI / régression | Audit interactif + analyse en profondeur |

**Conclusion** : MCP complète le file-based, ne le remplace pas.

---

## Action utilisateur

1. **Redémarrer Claude Code** : `exit` puis `claude` (ou Ctrl+C dans terminal puis relancer)
2. Nouvelle session : les tools `mcp__playwright__*` seront exposés
3. Dire "go" → l'orchestrateur exécute le plan ci-dessus interactivement
