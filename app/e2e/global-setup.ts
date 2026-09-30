import { chromium, FullConfig } from '@playwright/test';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { buildGuestProfile } from './helpers/guest-profile';

/**
 * Playwright globalSetup — runs once before the entire test suite.
 *
 * Why : the per-test `ensureMainTabs` helper traversait `/HomeMain → /Language
 * → English → Continue → AuthChoice → Onboarding (5 écrans) → MainTabs` à chaque
 * test. Cumul cold-boot Expo + reconciliation React + Continue DOM-detach =
 * flakiness 6/7 fail. La fix : pré-populer `localStorage` avec un profil guest
 * valide (consommé par `AuthContext.useEffect` au mount) → `App.tsx` route
 * directement vers MainTabs sans passer par AuthStack.
 *
 * Le helper `ensureMainTabs` reste idempotent (return early si `[role="tablist"]`
 * visible), donc aucune modif des specs nécessaire.
 */
const STATE_PATH = 'e2e/.auth/state.json';

const GUEST_PROFILE = buildGuestProfile(13);

async function globalSetup(_config: FullConfig) {
    mkdirSync(dirname(STATE_PATH), { recursive: true });

    const baseURL = process.env.E2E_BASE_URL || 'http://localhost:8081';
    const browser = await chromium.launch();
    const context = await browser.newContext();

    // `addInitScript` s'exécute AVANT tout script de la page (avant le bundle Expo).
    // C'est plus sûr que `page.evaluate` après goto, qui était cassé par la
    // navigation auto de l'app (`Execution context was destroyed`).
    await context.addInitScript(({ profile }) => {
        try {
            localStorage.setItem('app_locale', 'en');
            localStorage.setItem('user_profile', JSON.stringify(profile));
        } catch (e) {
            console.warn('[e2e/global-setup] localStorage write failed:', e);
        }
    }, { profile: GUEST_PROFILE });

    const page = await context.newPage();
    // Charge la page une fois pour que l'origin soit posée (storageState a besoin
    // d'au moins une visite pour enregistrer le localStorage de cet origin).
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Pas de evaluate ici — l'addInitScript a déjà tourné au moment du load.

    await context.storageState({ path: STATE_PATH });
    await browser.close();
}

export default globalSetup;
