/**
 * The Health form and firestore.rules must agree on what a valid reading is. When they did
 * not, 300/200 mmHg passed the form, raised the clinical alert, and the write then came back
 * 403 from the server. These read the bounds out of the rules file itself, so changing one
 * side without the other fails here.
 */
import * as fs from 'fs';
import * as path from 'path';
import { HEALTH_RULE_LIMITS, validateHealthEntry } from '../validation';

const rules = fs.readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8');

const ruleUpperBound = (field: string): number => {
    const m = rules.match(new RegExp(`request\\.resource\\.data\\.${field.replace(/\./g, '\\.')}\\s*<\\s*(\\d+)`));
    if (!m) throw new Error(`no "< N" bound on ${field} in firestore.rules`);
    return Number(m[1]);
};

describe('health entry bounds match firestore.rules', () => {
    it('uses the same exclusive upper bounds as validHealthMetric', () => {
        expect(HEALTH_RULE_LIMITS.systolicBelow).toBe(ruleUpperBound('value.systolic'));
        expect(HEALTH_RULE_LIMITS.diastolicBelow).toBe(ruleUpperBound('value.diastolic'));
        expect(HEALTH_RULE_LIMITS.weightKgBelow).toBe(ruleUpperBound('value'));
    });

    it('refuses in the form every blood pressure the rules refuse', () => {
        const sys = validateHealthEntry({ type: 'blood_pressure', systolic: ruleUpperBound('value.systolic'), diastolic: 100 });
        expect(sys).toEqual({ valid: false, error: 'weight.errors.bpSystolicInvalid' });
        const dia = validateHealthEntry({ type: 'blood_pressure', systolic: 250, diastolic: ruleUpperBound('value.diastolic') });
        expect(dia).toEqual({ valid: false, error: 'weight.errors.bpDiastolicInvalid' });
        expect(validateHealthEntry({ type: 'blood_pressure', systolic: 300, diastolic: 200 }).valid).toBe(false);
    });

    it('still accepts the highest reading the rules accept', () => {
        expect(validateHealthEntry({
            type: 'blood_pressure',
            systolic: HEALTH_RULE_LIMITS.systolicBelow - 1,
            diastolic: HEALTH_RULE_LIMITS.diastolicBelow - 1,
        }).valid).toBe(true);
    });

    it('never lets the form accept a weight the rules refuse', () => {
        expect(validateHealthEntry({ type: 'weight', value: HEALTH_RULE_LIMITS.weightKgBelow }).valid).toBe(false);
    });
});
