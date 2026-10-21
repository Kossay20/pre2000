import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Tick onboarding's health-data consent (HealthDataConsentCheck, step 4). Navigation step
 * only: the step-4 save ("Créer mon compte", "Finaliser", "Continuer sans compte") stays
 * disabled until it is ticked, so every spec that finishes onboarding goes through here.
 * It starts unticked; asserting that first keeps a double tap from silently unticking it.
 */
export async function tickHealthConsent(page: Page): Promise<void> {
  const consent = page.getByTestId('health_consent_checkbox');
  await expect(consent).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
  await consent.click();
  await expect(consent).toHaveAttribute('aria-checked', 'true');
}
