/**
 * Unit tests for validationSystem — zod schemas + helpers used by the
 * onboarding/quiz flow of the pregnancy app.
 *
 * Covers:
 *  - Each exported schema's boundaries (min/max, regex, enum, nullable).
 *  - validateStepData success / ZodError / non-Zod error branches.
 *  - validateCompleteProfile missing-step + per-step error aggregation.
 *  - QuizAnalytics event logging + the computed summary metrics.
 *
 * Pure module: only dependency is `zod`, so no mocking is required.
 */

import {
    nameValidationSchema,
    personalInfoValidationSchema,
    healthObjectivesValidationSchema,
    symptomsValidationSchema,
    lifestyleValidationSchema,
    validateStepData,
    validateCompleteProfile,
    QuizAnalytics,
} from '../validationSystem';
import { z } from 'zod';

describe('validationSystem', () => {
    // ----------------------------------------------------------------
    // nameValidationSchema
    // ----------------------------------------------------------------
    describe('nameValidationSchema', () => {
        it('accepts a simple valid name', () => {
            const r = validateStepData(nameValidationSchema, { name: 'Marie' });
            expect(r.success).toBe(true);
            expect(r.data).toEqual({ name: 'Marie' });
        });

        it('accepts accented / hyphen / apostrophe / space names', () => {
            expect(validateStepData(nameValidationSchema, { name: 'Anne-Sophie' }).success).toBe(true);
            expect(validateStepData(nameValidationSchema, { name: "O'Hara" }).success).toBe(true);
            expect(validateStepData(nameValidationSchema, { name: 'Zoé Mélanie' }).success).toBe(true);
            expect(validateStepData(nameValidationSchema, { name: 'Aïcha' }).success).toBe(true);
        });

        it('accepts a 2-character name (lower boundary)', () => {
            expect(validateStepData(nameValidationSchema, { name: 'Jo' }).success).toBe(true);
        });

        it('rejects a 1-character name (below min)', () => {
            const r = validateStepData(nameValidationSchema, { name: 'J' });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Le prénom doit contenir au moins 2 caractères');
        });

        it('accepts a name of exactly 50 characters (upper boundary)', () => {
            const name = 'a'.repeat(50);
            expect(validateStepData(nameValidationSchema, { name }).success).toBe(true);
        });

        it('rejects a name of 51 characters (above max)', () => {
            const name = 'a'.repeat(51);
            const r = validateStepData(nameValidationSchema, { name });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Le prénom ne peut pas dépasser 50 caractères');
        });

        it('rejects a name containing digits (regex)', () => {
            const r = validateStepData(nameValidationSchema, { name: 'Marie3' });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Le prénom ne peut contenir que des lettres');
        });

        it('rejects a name containing forbidden symbols (regex)', () => {
            const r = validateStepData(nameValidationSchema, { name: 'Marie@' });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Le prénom ne peut contenir que des lettres');
        });

        it('rejects an empty string (fails min before regex)', () => {
            const r = validateStepData(nameValidationSchema, { name: '' });
            expect(r.success).toBe(false);
            // empty string violates BOTH min(2) and the non-empty regex
            expect(r.errors).toContain('Le prénom doit contenir au moins 2 caractères');
        });

        it('rejects a non-string name (type error)', () => {
            const r = validateStepData(nameValidationSchema, { name: 123 });
            expect(r.success).toBe(false);
            expect(r.errors && r.errors.length).toBeGreaterThan(0);
        });

        it('rejects a missing name key', () => {
            const r = validateStepData(nameValidationSchema, {});
            expect(r.success).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // personalInfoValidationSchema
    // ----------------------------------------------------------------
    describe('personalInfoValidationSchema', () => {
        const valid = { age: 30, gender: 'female', country: 'FR' };

        it('accepts a fully valid personal-info object', () => {
            const r = validateStepData(personalInfoValidationSchema, valid);
            expect(r.success).toBe(true);
            expect(r.data).toEqual(valid);
        });

        it('accepts age at lower boundary (16)', () => {
            expect(validateStepData(personalInfoValidationSchema, { ...valid, age: 16 }).success).toBe(true);
        });

        it('rejects age below 16', () => {
            const r = validateStepData(personalInfoValidationSchema, { ...valid, age: 15 });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Vous devez avoir au moins 16 ans');
        });

        it('accepts age at upper boundary (120)', () => {
            expect(validateStepData(personalInfoValidationSchema, { ...valid, age: 120 }).success).toBe(true);
        });

        it('rejects age above 120', () => {
            const r = validateStepData(personalInfoValidationSchema, { ...valid, age: 121 });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Âge invalide');
        });

        it('accepts each allowed gender value', () => {
            (['male', 'female', 'other'] as const).forEach(gender => {
                expect(validateStepData(personalInfoValidationSchema, { ...valid, gender }).success).toBe(true);
            });
        });

        it('rejects an invalid gender enum value', () => {
            const r = validateStepData(personalInfoValidationSchema, { ...valid, gender: 'robot' });
            expect(r.success).toBe(false);
            expect(r.errors && r.errors.length).toBeGreaterThan(0);
        });

        it('rejects a 1-character country (below min)', () => {
            const r = validateStepData(personalInfoValidationSchema, { ...valid, country: 'F' });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Veuillez sélectionner votre pays');
        });

        it('rejects a non-number age', () => {
            const r = validateStepData(personalInfoValidationSchema, { ...valid, age: '30' });
            expect(r.success).toBe(false);
        });

        it('aggregates multiple errors at once', () => {
            const r = validateStepData(personalInfoValidationSchema, { age: 10, gender: 'x', country: '' });
            expect(r.success).toBe(false);
            expect(r.errors && r.errors.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ----------------------------------------------------------------
    // healthObjectivesValidationSchema
    // ----------------------------------------------------------------
    describe('healthObjectivesValidationSchema', () => {
        it('accepts one objective with a primary objective', () => {
            const r = validateStepData(healthObjectivesValidationSchema, {
                selectedObjectives: ['energy'],
                primaryObjective: 'energy',
            });
            expect(r.success).toBe(true);
        });

        it('accepts the maximum of 5 objectives', () => {
            const r = validateStepData(healthObjectivesValidationSchema, {
                selectedObjectives: ['a', 'b', 'c', 'd', 'e'],
                primaryObjective: 'a',
            });
            expect(r.success).toBe(true);
        });

        it('rejects an empty objectives array', () => {
            const r = validateStepData(healthObjectivesValidationSchema, {
                selectedObjectives: [],
                primaryObjective: 'a',
            });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Veuillez sélectionner au moins un objectif');
        });

        it('rejects more than 5 objectives', () => {
            const r = validateStepData(healthObjectivesValidationSchema, {
                selectedObjectives: ['a', 'b', 'c', 'd', 'e', 'f'],
                primaryObjective: 'a',
            });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Maximum 5 objectifs peuvent être sélectionnés');
        });

        it('rejects an empty primaryObjective', () => {
            const r = validateStepData(healthObjectivesValidationSchema, {
                selectedObjectives: ['a'],
                primaryObjective: '',
            });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Veuillez définir votre objectif principal');
        });

        it('rejects non-string entries inside the objectives array', () => {
            const r = validateStepData(healthObjectivesValidationSchema, {
                selectedObjectives: [1, 2],
                primaryObjective: 'a',
            });
            expect(r.success).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // symptomsValidationSchema
    // ----------------------------------------------------------------
    describe('symptomsValidationSchema', () => {
        const symptom = { id: 's1', category: 'digestive', intensity: 3 };

        it('accepts a valid symptom list', () => {
            const r = validateStepData(symptomsValidationSchema, { selectedSymptoms: [symptom] });
            expect(r.success).toBe(true);
        });

        it('rejects an empty symptom list', () => {
            const r = validateStepData(symptomsValidationSchema, { selectedSymptoms: [] });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Veuillez sélectionner au moins un symptôme');
        });

        it('accepts intensity at boundaries 1 and 5', () => {
            expect(validateStepData(symptomsValidationSchema, {
                selectedSymptoms: [{ ...symptom, intensity: 1 }],
            }).success).toBe(true);
            expect(validateStepData(symptomsValidationSchema, {
                selectedSymptoms: [{ ...symptom, intensity: 5 }],
            }).success).toBe(true);
        });

        it('rejects intensity below 1', () => {
            const r = validateStepData(symptomsValidationSchema, {
                selectedSymptoms: [{ ...symptom, intensity: 0 }],
            });
            expect(r.success).toBe(false);
        });

        it('rejects intensity above 5', () => {
            const r = validateStepData(symptomsValidationSchema, {
                selectedSymptoms: [{ ...symptom, intensity: 6 }],
            });
            expect(r.success).toBe(false);
        });

        it('rejects a symptom missing required fields', () => {
            const r = validateStepData(symptomsValidationSchema, {
                selectedSymptoms: [{ id: 's1' }],
            });
            expect(r.success).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // lifestyleValidationSchema
    // ----------------------------------------------------------------
    describe('lifestyleValidationSchema', () => {
        const valid = {
            dietaryHabits: 'balanced',
            activityLevel: 'moderate',
            weight: 65,
            height: 170,
            sleepHours: 8,
            stressLevel: 'low',
        };

        it('accepts a fully valid lifestyle object', () => {
            const r = validateStepData(lifestyleValidationSchema, valid);
            expect(r.success).toBe(true);
        });

        it('accepts null for the nullable numeric fields', () => {
            const r = validateStepData(lifestyleValidationSchema, {
                ...valid,
                weight: null,
                height: null,
                sleepHours: null,
            });
            expect(r.success).toBe(true);
        });

        it('accepts numeric boundaries (weight 30/300, height 100/250, sleep 3/12)', () => {
            expect(validateStepData(lifestyleValidationSchema, {
                ...valid, weight: 30, height: 100, sleepHours: 3,
            }).success).toBe(true);
            expect(validateStepData(lifestyleValidationSchema, {
                ...valid, weight: 300, height: 250, sleepHours: 12,
            }).success).toBe(true);
        });

        it('rejects weight below 30', () => {
            expect(validateStepData(lifestyleValidationSchema, { ...valid, weight: 29 }).success).toBe(false);
        });

        it('rejects weight above 300', () => {
            expect(validateStepData(lifestyleValidationSchema, { ...valid, weight: 301 }).success).toBe(false);
        });

        it('rejects height below 100', () => {
            expect(validateStepData(lifestyleValidationSchema, { ...valid, height: 99 }).success).toBe(false);
        });

        it('rejects sleepHours above 12', () => {
            expect(validateStepData(lifestyleValidationSchema, { ...valid, sleepHours: 13 }).success).toBe(false);
        });

        it('rejects an empty dietaryHabits string', () => {
            const r = validateStepData(lifestyleValidationSchema, { ...valid, dietaryHabits: '' });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Veuillez indiquer vos habitudes alimentaires');
        });

        it('rejects an empty stressLevel string', () => {
            const r = validateStepData(lifestyleValidationSchema, { ...valid, stressLevel: '' });
            expect(r.success).toBe(false);
            expect(r.errors).toContain('Veuillez évaluer votre niveau de stress');
        });

        it('rejects when a nullable numeric field is undefined (not provided)', () => {
            // nullable() allows null but NOT undefined/missing
            const { weight, ...rest } = valid;
            const r = validateStepData(lifestyleValidationSchema, rest);
            expect(r.success).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // validateStepData (generic helper)
    // ----------------------------------------------------------------
    describe('validateStepData', () => {
        it('returns success + parsed data on a valid object', () => {
            const schema = z.object({ x: z.number() });
            const r = validateStepData(schema, { x: 1 });
            expect(r).toEqual({ success: true, data: { x: 1 } });
            expect(r.errors).toBeUndefined();
        });

        it('returns success:false + messages on a ZodError', () => {
            const schema = z.object({ x: z.number() });
            const r = validateStepData(schema, { x: 'nope' });
            expect(r.success).toBe(false);
            expect(Array.isArray(r.errors)).toBe(true);
            expect(r.data).toBeUndefined();
        });

        it('maps every ZodError issue message into errors[]', () => {
            const schema = z.object({ a: z.string(), b: z.number() });
            const r = validateStepData(schema, { a: 1, b: 'x' });
            expect(r.success).toBe(false);
            expect(r.errors && r.errors.length).toBe(2);
        });

        it('handles a non-Zod thrown error with the fallback message', () => {
            // A schema whose parse throws a plain Error (not a ZodError) exercises
            // the catch-all branch returning the generic message.
            const exploding = {
                parse: () => {
                    throw new Error('boom');
                },
            } as unknown as z.ZodSchema<unknown>;
            const r = validateStepData(exploding, {});
            expect(r.success).toBe(false);
            expect(r.errors).toEqual(['Erreur de validation inconnue']);
        });

        it('uses zod refinement / transform messages via the .parse path (smoke)', () => {
            const schema = z.string().refine(v => v.length > 3, { message: 'too short' });
            const r = validateStepData(schema, 'ab');
            expect(r.success).toBe(false);
            expect(r.errors).toContain('too short');
        });
    });

    // ----------------------------------------------------------------
    // validateCompleteProfile
    // ----------------------------------------------------------------
    describe('validateCompleteProfile', () => {
        const fullValidProfile = {
            userName: 'Marie',
            personalInfo: { age: 30, gender: 'female', country: 'FR' },
            healthObjectives: { selectedObjectives: ['energy'], primaryObjective: 'energy' },
            symptomsData: { selectedSymptoms: [{ id: 's1', category: 'digestive', intensity: 2 }] },
        };

        it('returns isValid:true with no missing steps / errors for a full profile', () => {
            const r = validateCompleteProfile(fullValidProfile);
            expect(r.isValid).toBe(true);
            expect(r.missingSteps).toEqual([]);
            expect(r.errors).toEqual([]);
        });

        it('reports all four steps missing for an empty profile', () => {
            const r = validateCompleteProfile({});
            expect(r.isValid).toBe(false);
            expect(r.missingSteps).toEqual([
                'Nom',
                'Informations personnelles',
                'Objectifs de santé',
                'Analyse des symptômes',
            ]);
            expect(r.errors).toEqual([]);
        });

        it('reports a single missing step (userName) while others are valid', () => {
            const { userName, ...rest } = fullValidProfile;
            const r = validateCompleteProfile(rest);
            expect(r.isValid).toBe(false);
            expect(r.missingSteps).toEqual(['Nom']);
            expect(r.errors).toEqual([]);
        });

        it('collects validation errors from a present-but-invalid personalInfo', () => {
            const r = validateCompleteProfile({
                ...fullValidProfile,
                personalInfo: { age: 12, gender: 'female', country: 'FR' },
            });
            expect(r.isValid).toBe(false);
            expect(r.missingSteps).toEqual([]);
            expect(r.errors).toContain('Vous devez avoir au moins 16 ans');
        });

        it('collects validation errors from invalid healthObjectives', () => {
            const r = validateCompleteProfile({
                ...fullValidProfile,
                healthObjectives: { selectedObjectives: [], primaryObjective: '' },
            });
            expect(r.isValid).toBe(false);
            expect(r.errors).toContain('Veuillez sélectionner au moins un objectif');
        });

        it('collects validation errors from invalid symptomsData', () => {
            const r = validateCompleteProfile({
                ...fullValidProfile,
                symptomsData: { selectedSymptoms: [] },
            });
            expect(r.isValid).toBe(false);
            expect(r.errors).toContain('Veuillez sélectionner au moins un symptôme');
        });

        it('aggregates both missing steps and validation errors together', () => {
            const r = validateCompleteProfile({
                personalInfo: { age: 12, gender: 'female', country: 'FR' },
            });
            expect(r.isValid).toBe(false);
            // userName, healthObjectives, symptomsData missing
            expect(r.missingSteps).toEqual([
                'Nom',
                'Objectifs de santé',
                'Analyse des symptômes',
            ]);
            expect(r.errors).toContain('Vous devez avoir au moins 16 ans');
        });

        it('treats a falsy userName (empty string) as missing', () => {
            const r = validateCompleteProfile({ ...fullValidProfile, userName: '' });
            expect(r.missingSteps).toContain('Nom');
        });
    });

    // ----------------------------------------------------------------
    // QuizAnalytics
    // ----------------------------------------------------------------
    describe('QuizAnalytics', () => {
        let logSpy: jest.SpyInstance;

        beforeEach(() => {
            // Reset the private static events array between tests so each test
            // starts from a clean analytics state.
            (QuizAnalytics as unknown as { events: unknown[] }).events = [];
            logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        });

        afterEach(() => {
            logSpy.mockRestore();
        });

        it('logEvent records an event and logs to console', () => {
            QuizAnalytics.logEvent('quiz_started', 'intro', { foo: 1 });
            const summary = QuizAnalytics.getAnalyticsSummary();
            expect(summary.totalEvents).toBe(1);
            expect(logSpy).toHaveBeenCalled();
        });

        it('logStepCompletion records a step_completed event', () => {
            QuizAnalytics.logStepCompletion('name', 1234);
            expect(QuizAnalytics.getAnalyticsSummary().totalEvents).toBe(1);
        });

        it('logValidationError records a validation_error event', () => {
            QuizAnalytics.logValidationError('name', ['err A']);
            expect(QuizAnalytics.getAnalyticsSummary().totalEvents).toBe(1);
        });

        it('getAnalyticsSummary returns 0 completion rate with no quiz_started events', () => {
            const summary = QuizAnalytics.getAnalyticsSummary();
            expect(summary.totalEvents).toBe(0);
            expect(summary.completionRate).toBe(0);
            expect(summary.averageSessionDuration).toBe(0);
            expect(summary.commonErrors).toEqual([]);
        });

        it('computes a 100% completion rate when started == completed', () => {
            QuizAnalytics.logEvent('quiz_started', 'intro');
            QuizAnalytics.logEvent('quiz_completed', 'analysis');
            expect(QuizAnalytics.getAnalyticsSummary().completionRate).toBe(100);
        });

        it('computes a 50% completion rate (2 started, 1 completed)', () => {
            QuizAnalytics.logEvent('quiz_started', 'intro');
            QuizAnalytics.logEvent('quiz_started', 'intro');
            QuizAnalytics.logEvent('quiz_completed', 'analysis');
            expect(QuizAnalytics.getAnalyticsSummary().completionRate).toBe(50);
        });

        it('computes average session duration in minutes from start/end timestamps', () => {
            const nowSpy = jest.spyOn(Date, 'now');
            // NOTE: start timestamp must be truthy — the source filters sessions
            // with `session.start && session.end`, so a literal 0 start is dropped
            // (see calculateAverageSessionDuration, validationSystem.ts:196).
            nowSpy.mockReturnValueOnce(1_000);              // quiz_started
            nowSpy.mockReturnValueOnce(1_000 + 2 * 60 * 1000); // quiz_completed, +2 min
            QuizAnalytics.logEvent('quiz_started', 'intro');
            QuizAnalytics.logEvent('quiz_completed', 'analysis');
            expect(QuizAnalytics.getAnalyticsSummary().averageSessionDuration).toBeCloseTo(2, 5);
            nowSpy.mockRestore();
        });

        it('returns 0 average duration when only a start (no completion) exists', () => {
            QuizAnalytics.logEvent('quiz_started', 'intro');
            expect(QuizAnalytics.getAnalyticsSummary().averageSessionDuration).toBe(0);
        });

        it('returns common errors ranked by frequency (top 5)', () => {
            QuizAnalytics.logValidationError('name', ['A', 'B']);
            QuizAnalytics.logValidationError('name', ['A']);
            QuizAnalytics.logValidationError('name', ['C']);
            const common = QuizAnalytics.getAnalyticsSummary().commonErrors;
            // 'A' occurs twice → must be ranked first.
            expect(common[0]).toBe('A');
            expect(common).toContain('B');
            expect(common).toContain('C');
        });

        it('caps common errors at 5 distinct entries', () => {
            QuizAnalytics.logValidationError('s', ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
            expect(QuizAnalytics.getAnalyticsSummary().commonErrors.length).toBe(5);
        });

        it('logRecommendationGeneration records an event with profile completeness', () => {
            // profile has 3 of 6 required fields → 50% completeness; just assert it logs.
            QuizAnalytics.logRecommendationGeneration(
                { userName: 'M', personalInfo: {}, healthObjectives: {} },
                4,
            );
            const summary = QuizAnalytics.getAnalyticsSummary();
            expect(summary.totalEvents).toBe(1);
        });

        it('ignores validation_error events without a data.errors payload when computing common errors', () => {
            QuizAnalytics.logEvent('validation_error', 'name'); // no data
            expect(QuizAnalytics.getAnalyticsSummary().commonErrors).toEqual([]);
        });
    });
});
