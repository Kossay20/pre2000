export interface Week {
    week_number: number;
    title_fr: string;
    title_ar?: string;
    title_en?: string;
    title_tn?: string;
    emoji: string;
    trimester: number;
    baby_size_label_fr: string;
    baby_size_label_ar?: string;
    baby_size_label_en?: string;
    baby_size_label_tn?: string;
    baby_size_cm: number;
    baby_weight_g: number;
    baby_dev_text_fr: string;
    baby_dev_text_ar?: string;
    baby_dev_text_en?: string;
    baby_dev_text_tn?: string;
    baby_facts_fr?: string; // NEW: Quick facts about baby
    baby_facts_ar?: string;
    baby_facts_en?: string;
    baby_facts_tn?: string;
    mom_body_text_fr: string;
    mom_body_text_ar?: string;
    mom_body_text_en?: string;
    mom_body_text_tn?: string;
    mom_tips_fr?: string; // NEW: Tips for mom
    mom_tips_ar?: string;
    mom_tips_en?: string;
    mom_tips_tn?: string;
    warnings_text_fr: string;
    warnings_text_ar?: string;
    warnings_text_en?: string;
    warnings_text_tn?: string;
    // V3 NEW FIELDS
    baby_facts_short_fr?: string;
    baby_facts_short_ar?: string;
    baby_facts_short_en?: string;
    baby_facts_bullets_fr?: string;
    baby_facts_bullets_ar?: string;
    baby_facts_bullets_en?: string;
    mom_tips_short_fr?: string;
    mom_tips_short_ar?: string;
    mom_tips_short_en?: string;
    mom_tips_bullets_fr?: string;
    mom_tips_bullets_ar?: string;
    mom_tips_bullets_en?: string;
    recommended_articles_ids?: string; // CSV format
    recommended_supplements_ids?: string; // CSV format
    recommended_videos_ids?: string; // CSV format
    calendar_template_ids?: string; // CSV format
    weekly_summary_fr?: string;
    weekly_summary_ar?: string;
    weekly_summary_en?: string;
    baby_image_static_url?: string;
    baby_3d_model_url?: string;
    /** Ids from CONTENT_SOURCES (data/contentSources.ts), set once a clinician has checked the text. */
    sources?: string[];
}

export interface ChatbotMessage {
    message_id: string;
    body: string;
    sender: 'user' | 'bot';
    timestamp: Date;
}

// ========================================
// HEALTH TRACKING (NEW V1.3)
// ========================================

export interface HealthMetric {
    metric_id: string;
    user_id: string;
    type: 'weight' | 'blood_pressure';
    value: number | { systolic: number; diastolic: number };
    date: string; // ISO format
    week: number; // Pregnancy week
    notes?: string;
    created_at: string;
}

export interface HealthStats {
    weightCurrent?: number;
    weightInitial?: number;
    weightGain?: number;
    lastBP?: {
        systolic: number;
        diastolic: number;
        date: string;
    };
    upcomingAppointments: number;
    pastAppointments: number;
    remindersCompletedThisWeek: number;
    remindersTotalThisWeek: number;
}

export interface Article {
    article_id: string;
    slug: string;
    title_fr: string;
    title_ar?: string;
    title_en?: string;
    title_tn?: string;
    category: string;
    summary_fr: string;
    summary_ar?: string;
    summary_en?: string;
    summary_tn?: string;
    content_markdown_fr: string;
    content_markdown_ar?: string;
    content_markdown_en?: string;
    content_markdown_tn?: string;
    content_source_path?: string;
    risk_level: 'normal' | 'sensible' | 'critique';
    week_links: string; // e.g., "12,13,14" or "1-40"
    related_supplements_ids: string[];
    related_articles_ids: string[];
    note_localisation?: string;
    language?: string;
    /** Ids from CONTENT_SOURCES (data/contentSources.ts), set once a clinician has checked the text. */
    sources?: string[];
}

export interface Supplement {
    supplement_id: string;
    name_fr: string;
    name_ar?: string;
    name_en?: string;
    name_tn?: string;
    category: string;
    short_description_fr: string;
    short_description_ar?: string;
    short_description_en?: string;
    short_description_tn?: string;
    pregnancy_safety: 'ok' | 'a_surveiller' | 'deconseille';
    pregnancy_notes_fr: string;
    pregnancy_notes_ar?: string;
    pregnancy_notes_en?: string;
    pregnancy_notes_tn?: string;
    typical_dose_text_fr: string;
    typical_dose_text_ar?: string;
    typical_dose_text_en?: string;
    typical_dose_text_tn?: string;
    precautions_fr: string;
    precautions_ar?: string;
    precautions_en?: string;
    precautions_tn?: string;
    sources: string;
    related_article_ids: string[];
    notes_localisation?: string;
}

export interface CalendarTemplate {
    template_id: string;
    title_fr: string;
    title_ar?: string;
    title_en?: string;
    title_tn?: string;
    description_fr: string;
    description_ar?: string;
    description_en?: string;
    description_tn?: string;
    // Authored as a French composite ("examen,echo"); see utils/calendarTemplateTags.
    type: string;
    importance?: 'essential' | 'recommended' | 'optional';
    // What the seeded templates actually carry: 1 = essential … 3 = optional.
    importance_level?: number;
    week_min: number;
    week_max: number;
    recommended_day?: number; // Day in week
    country_scope?: string;
    sources?: string;
    // V3 NEW FIELDS
    timing_in_day?: 'morning' | 'afternoon' | 'evening' | 'anytime';
    estimated_duration_min?: number;
    reminder_offsets?: number[]; // minutes before event
    is_checkable?: boolean;
    linked_task_ids?: string; // CSV format
}

export interface RedFlag {
    red_flag_id: string;
    label_fr: string;
    label_ar?: string;
    label_en?: string;
    label_tn?: string;
    keywords_fr: string; // Comma-separated keywords
    keywords_ar?: string;
    keywords_en?: string;
    keywords_tn?: string;
    severity: string;
    standard_message_fr: string;
    standard_message_ar?: string;
    standard_message_en?: string;
    standard_message_tn?: string;
    linked_articles_ids: string[];
    sources?: string;
}

export interface ChatbotSuggestion {
    suggestion_id: string;
    label_fr: string;
    label_ar?: string;
    label_en?: string;
    label_tn?: string;
    topic: string;
    linked_article_ids: string; // Comma-separated list of article_id
    linked_red_flag_ids?: string; // Comma-separated list of red_flag_id
    linked_tip_ids?: string; // Comma-separated list of tip_id (e.g., "tip_w12_d03")
    linked_task_ids?: string; // Comma-separated list of task_id (e.g., "task_t1_echo")
    sources?: string;
}

export interface ChatResponse {
    type: 'red_flag' | 'suggestion' | 'info' | 'unknown' | 'error';
    message: string;
    redFlag?: RedFlag;
    articles?: Article[];
    suggestions?: ChatbotSuggestion[];
    tips?: any[]; // Using any to avoid circular dependency issues for now, or import Tip
    tasks?: any[]; // Using any to avoid circular dependency issues for now, or import CalendarTemplate
    matchScore: number;
    anchor?: string; // NEW: For deep linking to specific paragraphs
    originalText?: string; // NEW: For retry logic
    // An app screen the answer points to, shown as a link under the reply.
    screenLink?: 'ForbiddenFoods';
}

export interface Video {
    video_id: string;
    week_min: number;
    week_max: number;
    title_fr: string;
    title_ar?: string;
    title_en?: string;
    title_tn?: string;
    description_fr: string;
    description_ar?: string;
    description_en?: string;
    description_tn?: string;
    youtube_search_query_fr?: string;
    youtube_url?: string;
}


// R3 FIX: EmergencyContact is the canonical shape for the emergency contacts list
// persisted on the user profile. Defined here (and re-exported from
// PregnancyContext.tsx for backward compat) so that `UserProfile.emergencyContacts`
// can reference it without a circular import between types/ and context/.
export interface EmergencyContact {
    id: string;
    name: string;
    number: string;
    type: 'partner' | 'doctor' | 'sos' | 'other';
}

export interface UserProfile {
    uid: string;
    email?: string;
    firstName: string;
    lastName?: string;
    locale?: string; // 'fr' | 'ar' | 'en' | 'tn'
    pregnancyStartDate: string; // ISO Date string (for AuthContext)
    lmp?: string; // Last Menstrual Period ISO Date string (for PregnancyContext)
    dpa?: string; // Date Prévue Accouchement (due date) ISO Date string
    /** The CONTENT week, 1..40 (0 in TTC mode): calculateCurrentWeek, recomputed on the
     *  device and never stored on the server. It stops at 40 past the due date, so no
     *  screen prints it — the printed week comes from displayedPregnancyAge. */
    currentWeek: number;
    country: string;
    city?: string;
    ageRange?: string;
    isFirstPregnancy?: boolean;
    isGuest: boolean;
    // PROFILE-FIX: Physical data needed for BMI + weight gain recommendations
    height?: number;                // Height in cm
    prePregnancyWeight?: number;    // Pre-pregnancy weight in kg
    // R3 FIX: emergency contacts persisted on the profile (Firestore for auth users,
    // AsyncStorage 'guestProfile' for guests). Firestore supports arrays natively;
    // no sub-collection is needed.
    emergencyContacts?: EmergencyContact[];
    // Declared conditions, asked once during onboarding and editable in Settings.
    // REMINDERS_V2.json has always keyed context rules on these — the glucose-check
    // reminder is authored for users with gestational diabetes only — but nothing
    // collected the answers, so the rules were inert and the reminder was listed for
    // everyone. `undefined` means never asked or skipped; see utils/medicalFlags.ts
    // for why that is deliberately distinct from an answered `false`.
    hasGestationalDiabetes?: boolean;
    hasHypertension?: boolean;
    isTwinPregnancy?: boolean;
    medicalProfileAnsweredAt?: string;   // ISO — set even when every answer was skipped
    // Explicit consent to the processing of pregnancy/health data, given on the step
    // that first saves the profile. See utils/healthDataConsent.ts.
    healthDataConsent?: { version: string; at: string };
    // TTC-FIX: Trying-To-Conceive mode flag + cycle data.
    // When isTTC === true, currentWeek is forced to 0 and the user is NOT pregnant —
    // downstream UI must check isTTC and avoid rendering pregnancy-week content.
    // TODO (Strategy B): replace isTTC + isGuest booleans with a single
    // `mode: 'pregnant' | 'ttc' | 'curious'` discriminated union and migrate the
    // home / dashboard screens to render TTC-specific cards (cycle day, fertile
    // window) instead of the pregnancy week badge. See OnboardingScreen.handleFinishTTC.
    isTTC?: boolean;
    cycleLength?: number;            // Days, clamped to [21, 35]
    ovulationDate?: string;          // ISO Date string — estimated for the current cycle
    fertileWindowStart?: string;     // ISO Date string — ovulation - 5 days
    fertileWindowEnd?: string;       // ISO Date string — ovulation + 1 day
    // Cycle 3 F201 : marqueur "Curious" (mode découverte sans grossesse réelle).
    // Avant : `handleFinishCurious` setait un fake LMP sans marqueur → l'app
    // croyait l'utilisatrice enceinte semaine X (BabyGrowthCard, RDV templates).
    // Avec ce flag, les screens peuvent guarder `if (user?.isCurious)` et afficher
    // un mode exploration neutre (cf. F212 Wave C).
    isCurious?: boolean;
    exploreWeek?: number;            // 1-40 — semaine choisie en mode découverte
}

// User's personal calendar events/appointments
export interface UserEvent {
    event_id: string;
    user_id: string;
    title: string;
    date: string; // ISO date string
    week: number; // Calculated from LMP
    type: 'appointment';
    // CAL-04: user-selected nature of the appointment (Medical vs Personal).
    // `type` stays the literal 'appointment' (consumed across the app); this
    // optional field persists the selector so re-opening an event restores it.
    // Absent on legacy events → callers fall back to the type-based heuristic.
    category?: 'medical' | 'other';
    location?: string; // NEW: Address/Location
    notes?: string;
    created_at: string; // Timestamp
}

// Combined event from templates + user events for display
export interface CombinedEvent {
    id: string;
    title: string;
    title_fr?: string;
    title_ar?: string;
    title_en?: string;
    title_tn?: string;
    date: Date;
    week: number;
    type: string;
    importance?: string;
    description?: string;
    description_fr?: string;
    description_ar?: string;
    description_en?: string;
    description_tn?: string;
    source: 'template' | 'user';
    priorityColor?: string;
    notes?: string;
    location?: string; // For user events
    category?: 'medical' | 'other'; // CAL-04: persisted Medical/Personal nature (user events)
}

// V3 NEW TYPES

export interface ReminderTemplate {
    reminder_id: string;
    title_fr: string;
    title_ar?: string | null;
    title_en: string;
    title_tn?: string | null;
    description_fr: string;
    description_ar: string;
    description_en: string;
    description_tn?: string;
    category: string; // Ex: 'hydration', 'nutrition', 'sleep', etc.
    icon_name?: string;
    default_times_per_day: number;
    week_min: number;
    week_max: number;
}

// ========================================
// SMART REMINDER SCHEDULES (V1.3)
// ========================================

export interface ReminderSchedule {
    category: string;
    intensityOptions: number[]; // Ex: [2, 3, 5]
    schedules: {
        [intensity: number]: number[]; // intensity → hours
    };
}

export const REMINDER_SCHEDULES: Record<string, ReminderSchedule> = {
    // ========================================
    // HYDRATATION - Adaptée climat Maghreb
    // ========================================
    'hydration': {
        category: 'Hydratation',
        intensityOptions: [3, 5, 7],  // +7 pour été chaud
        schedules: {
            3: [8, 13, 18],  // Répartition équilibrée
            5: [8, 11, 14, 17, 20],  // Standard
            7: [7, 9, 11, 13, 15, 17, 19],  // ÉTÉ MAGHREB (chaleur)
        },
    },

    // ========================================
    // NUTRITION - Horaires culturels Maghreb
    // ========================================
    'nutrition': {
        category: 'Nutrition',
        intensityOptions: [3, 5],
        schedules: {
            // Horaires CULTURELS Maghreb
            3: [7.5, 13.5, 20.5],  // 7h30 (petit-déj), 13h30 (déjeuner), 20h30 (dîner)
            5: [7.5, 10.5, 13.5, 17, 20.5],  // + Collation matin 10h30, Goûter 17h
        },
    },

    // ========================================
    // SOMMEIL - Avec SIESTE culturelle + Horaires tardifs
    // ========================================
    'sleep': {
        category: 'Sommeil',
        intensityOptions: [2, 3, 4],  // +1 option pour sieste
        schedules: {
            2: [21.5, 22.5],  // 21h30, 22h30 (APRÈS dîner maghrebin)
            3: [14, 21.5, 22.5],  // + SIESTE 14h (culturel + T1/T3)
            4: [14, 20.5, 21.5, 22.5],  // Sieste + Routine progressive
        },
    },

    // ========================================
    // ACTIVITÉ - Horaires FRAIS (climat Maghreb)
    // ========================================
    'activity': {
        category: 'Activité',
        intensityOptions: [1, 2, 3],
        schedules: {
            1: [8],  // T3 uniquement (lourdeur)
            2: [8, 18.5],  // Matin frais + Soir frais (18h30)
            3: [8, 12, 18.5],  // Matin + Midi (climatisé) + Soir
        },
    },

    // ========================================
    // MÉDICAMENTS - STRICT Mode (santé bébé)
    // ========================================
    'medication': {
        category: 'Médicaments',
        intensityOptions: [2, 3],
        schedules: {
            2: [8, 21],  // Après petit-déj + Avant coucher
            3: [8, 14, 21],  // Après chaque repas principal
        },
    },

    // ========================================
    // CONSULTATIONS - Rappels intelligents
    // ========================================
    'consultation': {
        category: 'Consultations',
        intensityOptions: [1, 2, 3],
        schedules: {
            1: [10],  // Rappel jour J
            2: [19, 10],  // Veille au soir + Jour J
            3: [19, 10, 16],  // Veille + Jour J matin + Préparation questions
        },
    },

    // ========================================
    // BIEN-ÊTRE MENTAL - NOUVEAU (Première grossesse)
    // ========================================
    'mental_health': {
        category: 'Bien-être',
        intensityOptions: [2, 3],
        schedules: {
            2: [10, 20],  // Matin calme + Soir réflexion
            3: [10, 15, 20],  // + Milieu journée pause
        },
    },

    // ========================================
    // PRÉPARATION ACCOUCHEMENT - NOUVEAU (T3 uniquement)
    // ========================================
    'birth_prep': {
        category: 'Préparation',
        intensityOptions: [1, 2],
        schedules: {
            1: [19],  // Soir, moment calme
            2: [11, 19],  // Matin + Soir
        },
    },

    // ========================================
    // SOUTIEN FAMILIAL - NOUVEAU (Culture Maghreb)
    // ========================================
    'family_support': {
        category: 'Famille',
        intensityOptions: [1, 2],
        schedules: {
            1: [20],  // Soir, moment famille
            2: [12, 20],  // Midi + Soir
        },
    },

    // ========================================
    // DÉFAUT - Fallback générique
    // ========================================
    'default': {
        category: 'Général',
        intensityOptions: [2, 3],
        schedules: {
            2: [9, 18],
            3: [9, 14, 19],
        },
    },
};

export interface WeeklyTask {
    task_id: string;
    label_fr: string;
    label_ar?: string | null;
    label_en?: string | null;
    label_tn?: string | null;
    week_min: number;
    week_max: number;
    type: 'medical' | 'administrative' | 'preparation' | 'lifestyle';
    priority: 'low' | 'medium' | 'high';
    linked_article_ids?: string;
    linked_calendar_template_ids?: string;
    sources?: string;
}

// User-created custom tasks
export interface RecurrenceRule {
    type: 'daily' | 'interval' | 'specific_days';
    interval?: number;
    days?: number[];
}

export interface UserTask {
    task_id: string;
    user_id: string;
    title: string;
    priority: 'high' | 'medium' | 'low';
    completed: boolean;
    created_at: Date;
    updated_at: Date;
    completed_at?: Date;
    reminder_time?: Date;
    recurrence?: RecurrenceRule;
    completed_dates?: string[];
}

export interface UserReminderSettings {
    user_id: string;
    reminder_id: string;
    enabled: boolean;
    times_per_day: number;
    custom_hours?: string[];
    last_modified: Date;
}

export interface UserTaskStatus {
    user_id: string;
    task_id: string;
    week_number: number;
    completed: boolean;
    completed_at?: Date;
}

export interface UserCalendarEventStatus {
    user_id: string;
    template_id: string;
    event_date: string;
    checked: boolean;
    checked_at?: Date;
}

// V1.2 BABY MESSAGES

export interface BabyMessage {
    message_id: string;
    week: number;
    day: number;
    message_fr: string;
    message_ar?: string | null;
    message_en?: string | null;
    message_tn?: string | null;
    tags: string[];
    emoji: string;
    sources?: string[];
}

// ========== ANTIGRAVITY TRILINGUAL DATASETS ==========

export interface Tip {
    tip_id: string;
    week: number;
    day: number;
    short_fr: string;
    short_ar: string;
    short_en: string;
    long_fr: string;
    long_ar: string;
    long_en: string;
    category: string;
    tags: string; // CSV or JSON string
    sources: string;
    // Any additional columns from CSV are preserved dynamically
}



export interface ArticleAntigravity {
    article_id: string;
    title_fr: string;
    title_ar: string;
    title_en: string;
    title_tn?: string;
    summary_fr: string;
    summary_ar: string;
    summary_en: string;
    summary_tn?: string;
    content_fr: string; // Markdown
    content_ar: string; // Markdown
    content_en: string; // Markdown
    content_tn?: string; // Markdown
    category: string;
    reading_time_min: number;
    hero_image_prompt: string;
    related_tips_ids: string[]; // Array of tip_id
    week_min: number;
    week_max: number;
    tags: string[]; // Array of tags
    sources: string[]; // Array of sources
}

// ========================================
// DAILY CHECKLIST (V2 - Connected to Reminders)
// ========================================

export interface DailyChecklistItem {
    id: string;
    type: 'appointment' | 'vitamin' | 'hydration' | 'exercise' | 'reminder' | 'custom';
    title: string;
    subtitle?: string; // Ex: "14h30" pour RDV
    completed: boolean;
    icon: string;
    priority: number; // Pour tri
    target?: number; // Pour hydratation (ex: 2L)
    current?: number; // Pour hydratation (ex: 0.5L)
    reminderId?: string; // Link to ReminderDefinition.id (V2)
    // Multi-slot tracking
    slotIndex?: number; // 0, 1, 2... for multi-slot reminders
    slotTime?: string; // "08:00", "20:00" for display
    totalSlots?: number; // Total slots for this reminder
    skipped?: boolean; // New: Track skipped status
    sortTimestamp?: number; // For sorting
}
