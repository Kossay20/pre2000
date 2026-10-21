/**
 * @fileoverview Validation Utilities
 * Provides validation functions for user inputs across the app.
 * All error values are i18n translation keys — callers must use t(result.error) to display them.
 *
 * @module utils/validation
 */

export interface ValidationResult {
    valid: boolean;
    error?: string; // i18n key — use t(error) in the calling screen
}

/**
 * Validate email format
 */
export const validateEmail = (email: string): ValidationResult => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
        return { valid: false, error: 'errors.emailRequired' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(trimmedEmail)) {
        return { valid: false, error: 'invalidEmail' };
    }

    return { valid: true };
};

/**
 * Validate password strength
 * Rules: min 10 chars, max 100, at least 1 digit, at least 1 uppercase letter
 */
export const validatePassword = (password: string): ValidationResult => {
    if (!password) {
        return { valid: false, error: 'errors.passwordRequired' };
    }

    if (password.length < 10) {
        return { valid: false, error: 'errors.passwordLength' };
    }

    if (password.length > 100) {
        return { valid: false, error: 'errors.passwordTooLong' };
    }

    // At least 1 digit
    if (!/\d/.test(password)) {
        return { valid: false, error: 'errors.passwordComplexity' };
    }

    // At least 1 uppercase letter
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'errors.passwordUppercase' };
    }

    return { valid: true };
};

/**
 * Permissive password check for LOGIN of pre-existing accounts.
 *
 * IMPORTANT: do NOT use `validatePassword` for login — that one enforces the
 * NEW (post-C9) policy (10+ chars + uppercase + digit). Pre-existing users
 * who registered with the old 8-char policy would be locked out.
 *
 * Login validation only ensures the input is non-empty and within reasonable
 * bounds; Firebase Auth itself rejects wrong passwords with `auth/wrong-password`.
 */
export const validatePasswordForLogin = (password: string): ValidationResult => {
    if (!password) {
        return { valid: false, error: 'errors.passwordRequired' };
    }
    if (password.length > 100) {
        return { valid: false, error: 'errors.passwordTooLong' };
    }
    return { valid: true };
};

/**
 * Validate password confirmation
 */
export const validatePasswordMatch = (password: string, confirmPassword: string): ValidationResult => {
    if (password !== confirmPassword) {
        return { valid: false, error: 'errors.passwordMismatch' };
    }

    return { valid: true };
};

/**
 * Validate required field
 */
export const validateRequired = (value: string, fieldNameKey: string): ValidationResult => {
    if (!value.trim()) {
        return { valid: false, error: fieldNameKey };
    }

    return { valid: true };
};

/**
 * Validate appointment data
 */
export const validateAppointment = (data: {
    title?: string;
    date?: string | Date;
}): ValidationResult => {
    // Title validation
    if (!data.title || data.title.trim().length < 2) {
        return { valid: false, error: 'addAppointment.errors.titleTooShort' };
    }

    if (data.title.trim().length > 100) {
        return { valid: false, error: 'addAppointment.errors.titleTooLong' };
    }

    // Date validation
    if (!data.date) {
        return { valid: false, error: 'addAppointment.errors.dateRequired' };
    }

    const dateValue = data.date instanceof Date ? data.date : new Date(data.date);
    if (isNaN(dateValue.getTime())) {
        return { valid: false, error: 'addAppointment.errors.dateInvalid' };
    }

    return { valid: true };
};

/**
 * The bounds firestore.rules (validHealthMetric) puts on a healthMetrics write, all strict
 * `<`. The form used to accept exactly 300/200 mmHg, which the rules refuse: the entry went
 * through the clinical alert and then failed on the server. The form now stops one unit
 * short of each bound, and healthBounds.test.ts reads the rules file to keep the two equal.
 */
export const HEALTH_RULE_LIMITS = {
    weightKgBelow: 500,
    systolicBelow: 300,
    diastolicBelow: 200,
} as const;

/**
 * Validate health metric entry (weight, blood pressure)
 */
export const validateHealthEntry = (data: {
    type: 'weight' | 'blood_pressure';
    value?: number;
    systolic?: number;
    diastolic?: number;
}): ValidationResult => {
    if (data.type === 'weight') {
        if (!data.value || data.value <= 0) {
            return { valid: false, error: 'weight.errors.weightPositive' };
        }
        if (data.value > 300) {
            return { valid: false, error: 'weight.errors.weightTooHigh' };
        }
    }

    if (data.type === 'blood_pressure') {
        if (!data.systolic || !data.diastolic) {
            return { valid: false, error: 'weight.errors.bpRequired' };
        }
        if (data.systolic < 50 || data.systolic >= HEALTH_RULE_LIMITS.systolicBelow) {
            return { valid: false, error: 'weight.errors.bpSystolicInvalid' };
        }
        if (data.diastolic < 30 || data.diastolic >= HEALTH_RULE_LIMITS.diastolicBelow) {
            return { valid: false, error: 'weight.errors.bpDiastolicInvalid' };
        }
        if (data.diastolic >= data.systolic) {
            return { valid: false, error: 'weight.errors.bpDiastolicHigher' };
        }
    }

    return { valid: true };
};

/**
 * Validate user profile data
 */
export const validateProfile = (data: {
    firstName?: string;
    lastName?: string;
    lmp?: string | Date;
}): ValidationResult => {
    if (!data.firstName || data.firstName.trim().length < 1) {
        return { valid: false, error: 'errors.enterFirstName' };
    }

    if (data.firstName.trim().length > 50) {
        return { valid: false, error: 'errors.firstNameTooLong' };
    }

    if (data.lastName && data.lastName.trim().length > 50) {
        return { valid: false, error: 'errors.lastNameTooLong' };
    }

    if (data.lmp) {
        const lmpDate = data.lmp instanceof Date ? data.lmp : new Date(data.lmp);
        if (isNaN(lmpDate.getTime())) {
            return { valid: false, error: 'errors.lmpInvalid' };
        }

        if (lmpDate > new Date()) {
            return { valid: false, error: 'errors.futureDate' };
        }
    }

    return { valid: true };
};

/**
 * Sanitize user input (remove potential XSS)
 */
export const sanitizeInput = (input: string): string => {
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
};
