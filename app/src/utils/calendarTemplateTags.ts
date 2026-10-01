/**
 * Calendar templates are authored with a French composite `type`
 * ("examen,echo") and a numeric `importance_level` (1 = most important).
 * The card used to print both raw — "examen,echo" and, since the code read a
 * field the data never had, the literal string "undefined" — in every locale.
 * These map them to language-neutral keys the UI translates.
 */
export type TemplateCategory = 'administrative' | 'exam' | 'preparation' | 'prevention' | 'selfCare';
export type TemplateImportance = 'essential' | 'recommended' | 'optional';

const CATEGORY_BY_PREFIX: Record<string, TemplateCategory> = {
  administratif: 'administrative',
  examen: 'exam',
  preparation: 'preparation',
  prevention: 'prevention',
  self_care: 'selfCare',
};

// Templates have carried numbers, English and French labels over time; the
// card only needs three tiers to name.
const IMPORTANCE_BY_RAW: Record<string, TemplateImportance> = {
  '1': 'essential',
  critical: 'essential',
  critique: 'essential',
  essential: 'essential',
  '2': 'recommended',
  high: 'recommended',
  élevé: 'recommended',
  recommended: 'recommended',
  '3': 'optional',
  '4': 'optional',
  moderate: 'optional',
  medium: 'optional',
  modéré: 'optional',
  low: 'optional',
  faible: 'optional',
  optional: 'optional',
};

export function templateCategory(type: string | undefined): TemplateCategory | null {
  const prefix = type?.split(',')[0]?.trim().toLowerCase();
  return (prefix && CATEGORY_BY_PREFIX[prefix]) || null;
}

/** The raw importance a template carries, whichever field it was authored in. */
export function rawTemplateImportance(template: {
  importance?: string | number;
  importance_level?: number | string;
}): string {
  const raw = template.importance ?? template.importance_level;
  return raw == null ? '' : String(raw);
}

export function importanceTier(raw: string | undefined): TemplateImportance | null {
  return IMPORTANCE_BY_RAW[(raw ?? '').trim().toLowerCase()] ?? null;
}

export function templateImportance(template: {
  importance?: string | number;
  importance_level?: number | string;
}): TemplateImportance | null {
  return importanceTier(rawTemplateImportance(template));
}
