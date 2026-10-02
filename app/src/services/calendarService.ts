import { theme } from '../theme';
/**
 * @fileoverview Calendar Service
 * Handles all calendar-related operations including:
 * - Loading calendar templates from Firestore
 * - Managing user events (CRUD operations)
 * - Generating events based on pregnancy week
 * - Combining template and user events
 * 
 * @module services/calendarService
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_GUEST_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';
import { createLogger } from '../utils/logger';
import { daysBetweenDateKeys, parseLocalDateKey, storedDateKey, toLocalDateKey } from '../utils/localDate';
import { displayedPregnancyAge, MAX_GESTATION_DAYS } from '../utils/pregnancyCalculator';
import { cancelRDVReminders } from './rdvNotificationService';
import { CalendarTemplate } from '../types';
import { rawTemplateImportance } from '../utils/calendarTemplateTags';
import bundledTemplates from '../data/calendar_templates_fallback.json';

// Create scoped logger for this service
const log = createLogger('CalendarService');
export interface GeneratedEvent {
    id: string;
    templateId: string;
    title: string; // Default title (usually FR or based on logic)
    title_fr: string;
    title_ar?: string;
    title_en?: string;
    title_tn?: string; // New
    date: Date;
    week: number;
    type: string;
    importance: string;
    description: string; // Default description
    description_fr: string;
    description_ar?: string;
    description_en?: string;
    description_tn?: string; // New
    source?: string;
    priorityColor: string;
}

// Priority color mapping — language-neutral keys
// Firestore 'importance' field may be a number (1-4) or a string in any language
const PRIORITY_COLORS: Record<string, string> = {
    // Numeric levels (1=critical, 2=high, 3=moderate, 4=low/info)
    '1': theme.colors.calendarPriorityCritical,
    '2': theme.colors.calendarPriorityHigh,
    '3': theme.colors.calendarPriorityModerate,
    '4': theme.colors.teal500,
    // English string labels
    critical: theme.colors.calendarPriorityCritical,
    high: theme.colors.calendarPriorityHigh,
    moderate: theme.colors.calendarPriorityModerate,
    medium: theme.colors.calendarPriorityModerate,
    low: theme.colors.teal500,
    info: theme.colors.calendarPriorityInfo,
    information: theme.colors.calendarPriorityInfo,
    // French string labels (legacy support)
    critique: theme.colors.calendarPriorityCritical,
    élevé: theme.colors.calendarPriorityHigh,
    modéré: theme.colors.calendarPriorityModerate,
    faible: theme.colors.teal500,
    // BUGFIX: CalendarTemplate.importance typed union ('essential'|'recommended'|'optional')
    // was unmapped → every type-conformant value fell through to the grey info fallback.
    essential: theme.colors.calendarPriorityHigh,
    recommended: theme.colors.calendarPriorityModerate,
    optional: theme.colors.calendarPriorityInfo,
};

const getPriorityColor = (importance: string): string => {
    const key = importance.toLowerCase().trim();
    return PRIORITY_COLORS[key] || PRIORITY_COLORS['information'];
};

/**
 * Local midnight of the LMP's calendar day plus `days` calendar days.
 *
 * Every pregnancy-week date in the calendar is counted from the LMP's CALENDAR day, the
 * way calculatePregnancyWeek counts her week and day. A typed or seeded LMP is stored as
 * UTC midnight, which is the evening before west of UTC; adding days to that instant in
 * local time started "Semaine 32" on Tuesday in New York while Home called Wednesday
 * day 1 of week 32. Building the date from its parts also keeps DST out of it.
 */
const lmpDayPlus = (lmpDate: Date, days: number, hours = 0, minutes = 0, seconds = 0, ms = 0): Date => {
    const lmpDay = parseLocalDateKey(storedDateKey(new Date(lmpDate))) ?? new Date(NaN);
    return new Date(lmpDay.getFullYear(), lmpDay.getMonth(), lmpDay.getDate() + days, hours, minutes, seconds, ms);
};

const calculateEventDate = (
    lmpDate: Date,
    targetWeek: number,
    recommendedDay: number
): Date => {
    const weeksOffset = (targetWeek - 1) * 7;
    const dayOffset = recommendedDay - 1;
    const totalDays = weeksOffset + dayOffset;

    const eventDate = lmpDayPlus(lmpDate, totalDays);

    // NEW: If the generated event falls on a Sunday (0), push it to Monday (add 1 day)
    // Medical appointments and standard recommendations shouldn't happen on Sundays.
    if (eventDate.getDay() === 0) {
        eventDate.setDate(eventDate.getDate() + 1);
    }

    return eventDate;
};

export const generateEventsForWeek = (
    templates: CalendarTemplate[],
    lmpDate: Date,
    targetWeek: number
): GeneratedEvent[] => {
    const events: GeneratedEvent[] = [];

    const applicableTemplates = templates.filter(
        (template) =>
            template.week_min <= targetWeek &&
            template.week_max >= targetWeek
    );

    applicableTemplates.forEach((template) => {
        const eventDate = calculateEventDate(
            lmpDate,
            targetWeek,
            template.recommended_day || 4 // Default to middle of week (day 4) if not specified
        );

        events.push({
            id: `${template.template_id}_w${targetWeek}`,
            templateId: template.template_id,
            title: template.title_fr,
            title_fr: template.title_fr,
            title_ar: template.title_ar,
            title_en: template.title_en,
            title_tn: template.title_tn,
            date: eventDate,
            week: targetWeek,
            type: template.type,
            importance: rawTemplateImportance(template),
            description: template.description_fr || '',
            description_fr: template.description_fr || '',
            description_ar: template.description_ar,
            description_en: template.description_en,
            description_tn: template.description_tn,
            source: template.sources,
            priorityColor: getPriorityColor(rawTemplateImportance(template)),
        });
    });

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const generateAllEvents = (
    templates: CalendarTemplate[],
    lmpDate: Date
): GeneratedEvent[] => {
    const allEvents: GeneratedEvent[] = [];

    for (let week = 1; week <= 40; week++) {
        const weekEvents = generateEventsForWeek(templates, lmpDate, week);
        allEvents.push(...weekEvents);
    }

    return allEvents;
};

export const getEventsForWeek = (
    allEvents: GeneratedEvent[],
    weekNumber: number
): GeneratedEvent[] => {
    return allEvents.filter((event) => event.week === weekNumber);
};

/**
 * The week templates shipped with the app (same content as the seeded `calendarTemplates`
 * collection). Offline, Firestore rejects or times out and the suggestions row used to
 * vanish ("Suggestions" with no count) even though the same week showed six online.
 */
export const getBundledCalendarTemplates = (): CalendarTemplate[] =>
    bundledTemplates as unknown as CalendarTemplate[];

/**
 * Load all calendar templates from Firestore; when the read fails (offline, timeout) the
 * bundled templates are returned so the week keeps its suggestions. The caller refetches
 * when connectivity returns to swap in the live copy.
 * @returns Promise resolving to array of CalendarTemplate
 */
export const loadCalendarTemplates = async (): Promise<CalendarTemplate[]> => {
    log.info('Loading calendar templates from Firestore...');
    try {
        const snapshot = await withTimeout(
            getDocs(collection(db, 'calendarTemplates')),
            FIRESTORE_GUEST_TIMEOUT_MS,
        );
        const templates = snapshot.docs.map((doc) => doc.data() as CalendarTemplate);
        log.success(`Loaded ${templates.length} calendar templates`);
        if (templates.length === 0) {
            log.warn('No calendar templates found! Check Firestore data import.');
        }
        return templates;
    } catch (error) {
        log.error('Error loading calendar templates, using the bundled templates:', error);
        return getBundledCalendarTemplates();
    }
};

/**
 * Pregnancy week `weekNumber` as the calendar shows it: from local midnight of LMP day
 * + 7·(n−1) to the last millisecond of LMP day + 7·(n−1) + 6 — the seven days Home counts
 * as days 1..7 of that week.
 */
export const getWeekDates = (lmpDate: Date, weekNumber: number): { start: Date; end: Date } => {
    const offset = (weekNumber - 1) * 7;
    return {
        start: lmpDayPlus(lmpDate, offset),
        end: lmpDayPlus(lmpDate, offset + 6, 23, 59, 59, 999),
    };
};

/**
 * The pregnancy week (1-based, LMP-aligned) whose seven days contain `date`'s local day.
 * Not capped at the 40 weeks the content covers: at 40+3 SA today is in week 41, and the
 * calendar has to show that week or today and this week's appointments are off screen.
 * A date before the LMP is week 1.
 */
export const pregnancyWeekOfDate = (lmpDate: Date, date: Date = new Date()): number => {
    const days = daysBetweenDateKeys(storedDateKey(new Date(lmpDate)), toLocalDateKey(date));
    return Number.isFinite(days) && days > 0 ? Math.floor(days / 7) + 1 : 1;
};

/** The last week the calendar pages forward to: the one holding 42+0 SA, the last plausible day. */
export const LAST_CALENDAR_WEEK = Math.floor(MAX_GESTATION_DAYS / 7) + 1;

/**
 * The week number the calendar prints for pregnancy week `weekNumber`, through the same
 * displayedPregnancyAge as Home, Reminders and Profile, so the header cannot disagree
 * with them ("Semaine 41" at 40+3 SA, not the content week 40).
 */
export const displayedCalendarWeek = (weekNumber: number): number =>
    displayedPregnancyAge(Math.max(0, weekNumber - 1), 0).week;

/**
 * "This week" wherever the app counts appointments in it: the pregnancy week holding
 * today, with the local-midnight boundaries the Calendar strip shows. Home's "N rendez-vous
 * prévus cette semaine" used the Sunday–Saturday week of a list capped at 3, so with four
 * appointments it said 3 while the Calendar said 4. It also used the content week, which
 * stops at 40, so past the due date "this week" was a week in the past.
 */
export const getCurrentPregnancyWeekRange = (lmpDate: Date): { start: Date; end: Date } =>
    getWeekDates(lmpDate, pregnancyWeekOfDate(lmpDate));

/** How many events fall inside `range` (both ends inclusive). */
export const countEventsInRange = (
    events: ReadonlyArray<{ date: string | Date }>,
    range: { start: Date; end: Date },
): number =>
    events.filter((event) => {
        const date = new Date(event.date);
        return date >= range.start && date <= range.end;
    }).length;

// ============ USER EVENTS SECTION ============

import { doc, getDoc, setDoc, deleteDoc, deleteField, query, where, orderBy, limit } from 'firebase/firestore';
import { UserEvent, CombinedEvent } from '../types';

/**
 * Get upcoming appointments for a user
 */
export const getUpcomingAppointments = async (userId: string, limitCount: number = 3): Promise<UserEvent[]> => {
    if (!userId || userId.startsWith('guest_')) return [];
    try {
        const now = new Date();
        const eventsRef = collection(db, 'userEvents');
        const q = query(
            eventsRef,
            where('user_id', '==', userId)
        );
        const snapshot = await getDocs(q);
        const allEvents = snapshot.docs.map(doc => doc.data() as UserEvent);

        // Filter and sort in memory to avoid index requirement
        return allEvents
            .filter(event => new Date(event.date) >= now)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, limitCount);
    } catch (error) {
        log.error('❌ Error loading upcoming appointments:', error);
        return [];
    }
};

/**
 * Calculate which week a given date falls into based on LMP
 */
export const calculateWeekFromDate = (lmpDate: Date, eventDate: Date): number =>
    // Calendar days from the LMP's calendar day, like the strip and calculatePregnancyWeek
    // (DST-safe, and a UTC-midnight LMP is not read as the evening before west of UTC). The
    // stored event week is the content week, 1..40; the calendar finds events by date.
    Math.min(40, pregnancyWeekOfDate(lmpDate, eventDate));

/**
 * Load all user events for a specific user
 */
export const loadUserEvents = async (userId: string): Promise<UserEvent[]> => {
    if (!userId || userId.startsWith('guest_')) return [];
    log.info(`Loading user events for user: ${userId}`);
    try {
        const eventsRef = collection(db, 'userEvents');
        const q = query(eventsRef, where('user_id', '==', userId));
        const snapshot = await getDocs(q);
        const events = snapshot.docs.map(doc => doc.data() as UserEvent);
        log.success(`Loaded ${events.length} user events`);
        return events;
    } catch (error) {
        log.error('Error loading user events:', error);
        return [];
    }
};

/**
 * One user event by id, or null when it is gone (deleted elsewhere) or cannot be read.
 * The edit form loads the event itself: the route only carries the id, which survives a
 * web reload — the whole object did not (it became "[object Object]" in the URL and the
 * form reopened in edit mode with every field empty).
 */
export const getUserEvent = async (eventId: string): Promise<UserEvent | null> => {
    if (!eventId) return null;
    try {
        const snapshot = await getDoc(doc(db, 'userEvents', eventId));
        return snapshot.exists() ? (snapshot.data() as UserEvent) : null;
    } catch (error) {
        log.error('Error loading user event:', error);
        return null;
    }
};

/**
 * How long Save waits for the server before treating a write as queued.
 *
 * Firestore applies a write to the local cache immediately but only settles the
 * `setDoc` promise when the server acknowledges it. Offline that never happens, so
 * awaiting it left the form on "Enregistrement…" for as long as the device had no
 * signal — and a user who gave up and re-entered the appointment got a duplicate once
 * both queued writes synced.
 */
export const EVENT_WRITE_ACK_TIMEOUT_MS = 4000;

/**
 * Client-side id for a new event. The form generates it once, so every Save of that
 * form writes the same document: a retry overwrites instead of duplicating.
 * NEW-10 FIX: the random suffix prevents collisions between forms opened in the same
 * millisecond (Date.now alone can repeat).
 */
export const newUserEventId = (): string =>
    `user_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Resolve 'acked' when the write settles in time, 'queued' when it is still pending
 * after `ms` (it stays in Firestore's queue and syncs on reconnect). A rejection that
 * arrives in time is rethrown; a later one is only logged — the caller has moved on.
 */
async function awaitWriteAck(write: Promise<void>, ms: number, label: string): Promise<'acked' | 'queued'> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'queued'>((resolve) => {
        timer = setTimeout(() => resolve('queued'), ms);
    });
    try {
        const outcome = await Promise.race([write.then(() => 'acked' as const), timedOut]);
        if (outcome === 'queued') {
            log.warn(`[CalendarService] ${label}: no server ack after ${ms}ms — queued for sync`);
            write.catch((err) => log.error(`[CalendarService] ${label}: queued write failed:`, err));
        }
        return outcome;
    } finally {
        clearTimeout(timer);
    }
}

export interface SaveUserEventOptions {
    /** Reuse the form's id (see newUserEventId) so a re-submit is idempotent. */
    eventId?: string;
    ackTimeoutMs?: number;
}

/**
 * Save a new user event to Firestore. `pendingSync` is true when the write is queued
 * (offline / no server ack yet) rather than confirmed.
 */
export const saveUserEvent = async (
    event: Omit<UserEvent, 'event_id' | 'created_at'>,
    options: SaveUserEventOptions = {}
): Promise<UserEvent & { pendingSync: boolean }> => {
    // NEW-08 FIX: Guard at service level — prevents PERMISSION_DENIED regardless of UI path
    if (!event.user_id || event.user_id.startsWith('guest_')) {
        log.warn('[CalendarService] Blocked guest from saving event to Firestore');
        throw new Error('guest_blocked');
    }

    log.info('Saving new user event:', event.title);
    const eventId = options.eventId ?? newUserEventId();


    // Filter out undefined values (Firestore doesn't accept undefined)
    const cleanedEvent: Record<string, any> = {
        event_id: eventId,
        created_at: new Date().toISOString(),
    };

    Object.entries(event).forEach(([key, value]) => {
        if (value !== undefined) {
            cleanedEvent[key] = value;
        }
    });

    try {
        log.debug('[CalendarService] Attempting to save document to Firestore:', eventId, JSON.stringify(cleanedEvent));
        const outcome = await awaitWriteAck(
            setDoc(doc(db, 'userEvents', eventId), cleanedEvent),
            options.ackTimeoutMs ?? EVENT_WRITE_ACK_TIMEOUT_MS,
            `save ${eventId}`,
        );
        if (outcome === 'acked') log.success(`User event saved: ${eventId}`);
        return { ...(cleanedEvent as UserEvent), pendingSync: outcome === 'queued' };
    } catch (error: any) {
        log.error('[CalendarService] Error saving user event:', error);
        log.error('[CalendarService] Error details:', JSON.stringify(error));
        if (error.code === 'permission-denied') {
            // PII FIX: this used to append the raw Firebase UID. `error` is the one
            // log level that is not __DEV__-gated, and its extra args are forwarded to
            // Sentry verbatim — which defeated the deliberate SHA-256 UID hashing in
            // logger.setUser(). Sentry already carries the hashed user on every event,
            // so the raw value added nothing but a privacy leak. Log only whether a
            // uid was present, which is the part that actually aids diagnosis.
            log.error(
                '[CalendarService] PERMISSION DENIED. Check Firestore rules. user_id present:',
                !!cleanedEvent.user_id,
            );
        }
        throw error;
    }
};

/**
 * Delete a user event from Firestore
 */
export const deleteUserEvent = async (eventId: string): Promise<void> => {
    log.info(`Deleting user event: ${eventId}`);
    try {
        await deleteDoc(doc(db, 'userEvents', eventId));
        log.success(`User event deleted: ${eventId}`);

        // NEW: Cancel native ghost notifications if any were scheduled for this RDV
        try {
            await cancelRDVReminders(eventId);
            log.info(`[CalendarService] Cancelled RDV reminders for ${eventId}`);
        } catch (err) {
            log.warn(`[CalendarService] Failed to cancel RDV reminders for ${eventId}:`, err);
        }
    } catch (error) {
        log.error('Error deleting user event:', error);
        throw error;
    }
};

/**
 * Combine template events and user events for a specific week
 */
export type UserEventUpdate = {
    [K in keyof Omit<UserEvent, 'event_id' | 'created_at'>]?: UserEvent[K] | null;
};

/**
 * Update an existing user event.
 *
 * `undefined` leaves a field as it is; `null` clears it. The write is a merge, so a field
 * that is simply left out keeps its old value — emptying the notes of an appointment used
 * to "save" while the server kept the old notes. A cleared field is sent as deleteField(),
 * the same way a cleared profile field is.
 */
export const updateUserEvent = async (
    eventId: string,
    updates: UserEventUpdate,
    options: Pick<SaveUserEventOptions, 'ackTimeoutMs'> = {}
): Promise<{ pendingSync: boolean }> => {
    log.info(`Updating user event: ${eventId}`);
    try {
        // Firestore rejects undefined values outright.
        const cleanedUpdates: Record<string, any> = {};
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null) {
                cleanedUpdates[key] = deleteField();
            } else if (value !== undefined) {
                cleanedUpdates[key] = value;
            }
        });

        log.debug('Cleaned updates:', cleanedUpdates);

        const eventRef = doc(db, 'userEvents', eventId);
        // Same offline behaviour as saveUserEvent; a merge onto a fixed id is idempotent.
        const outcome = await awaitWriteAck(
            setDoc(eventRef, cleanedUpdates, { merge: true }),
            options.ackTimeoutMs ?? EVENT_WRITE_ACK_TIMEOUT_MS,
            `update ${eventId}`,
        );
        if (outcome === 'acked') log.success(`User event updated: ${eventId}`);
        return { pendingSync: outcome === 'queued' };
    } catch (error) {
        log.error('Error updating user event:', error);
        throw error;
    }
};

/**
 * Combine template events and user events for a specific week
 */
export const getCombinedEventsForWeek = (
    templateEvents: GeneratedEvent[],
    userEvents: UserEvent[],
    weekNumber: number,
    weekStartDate?: Date,
    weekEndDate?: Date
): CombinedEvent[] => {
    const combined: CombinedEvent[] = [];

    // Add template events (filtered by week number - this is correct for templates)
    templateEvents
        .filter(te => te.week === weekNumber)
        .forEach(te => {
            combined.push({
                id: te.id,
                title: te.title,
                title_fr: te.title_fr,
                title_ar: te.title_ar,
                title_en: te.title_en,
                title_tn: te.title_tn,
                date: te.date,
                week: te.week,
                type: te.type,
                importance: te.importance,
                description: te.description,
                description_fr: te.description_fr,
                description_ar: te.description_ar,
                description_en: te.description_en,
                description_tn: te.description_tn,
                source: 'template',
                priorityColor: te.priorityColor,
            });
        });

    // Add user events - filter by DATE RANGE if provided, otherwise by week number
    const filteredUserEvents = weekStartDate && weekEndDate
        ? userEvents.filter(ue => {
            const eventDate = new Date(ue.date);
            return eventDate >= weekStartDate && eventDate <= weekEndDate;
        })
        : userEvents.filter(ue => ue.week === weekNumber);

    filteredUserEvents.forEach(ue => {
        combined.push({
            id: ue.event_id,
            title: ue.title,
            date: new Date(ue.date),
            week: ue.week,
            type: ue.type,
            source: 'user',
            notes: ue.notes,
            location: ue.location, // BUGFIX: was dropped → user-event address vanished in combined view
            category: ue.category, // CAL-04: carry persisted Medical/Personal nature into the combined view
            priorityColor: theme.colors.indigoAccent, // Purple for user events
        });
    });

    // Sort by date
    return combined.sort((a, b) => a.date.getTime() - b.date.getTime());
};

/**
 * Get date key in local timezone (YYYY-MM-DD)
 * This prevents UTC conversion issues where a date like Dec 5 at 23:30 local time
 * becomes Dec 6 when converted to UTC with toISOString()
 */
export const getLocalDateKey = (date: Date): string => toLocalDateKey(date);

/**
 * Group events by date string (YYYY-MM-DD) using local timezone
 */
export const groupEventsByDate = (events: CombinedEvent[]): Record<string, CombinedEvent[]> => {
    const grouped: Record<string, CombinedEvent[]> = {};
    events.forEach(event => {
        const dateKey = getLocalDateKey(event.date);
        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }
        grouped[dateKey].push(event);
    });
    return grouped;
};

/**
 * The suggestions a user is offered, once each. A template that spans several weeks is
 * generated once per week, so the same advice repeats; the list (and every count of it)
 * shows it once, at its earliest date.
 */
export const distinctSuggestions = (events: ReadonlyArray<CombinedEvent>): CombinedEvent[] => {
    const seen = new Set<string>();
    return events
        .filter((e) => e.source === 'template')
        .slice()
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .filter((e) => {
            if (seen.has(e.title)) return false;
            seen.add(e.title);
            return true;
        });
};

export interface MonthSummary {
    suggestions: CombinedEvent[];
    suggestionCount: number;
    userEventCount: number;
    totalEvents: number;
}

/**
 * One month of the calendar (monthKey 'yyyy-MM', local). The Suggestions pill, the opened
 * suggestions list and the "this month" card all read this, so they cannot disagree: the
 * pill used to count distinct advice (9) while the card counted every weekly copy (29).
 */
export const summariseMonth = (
    eventsByDate: Record<string, ReadonlyArray<CombinedEvent>>,
    monthKey: string,
): MonthSummary => {
    const inMonth = Object.entries(eventsByDate)
        .filter(([dateKey]) => dateKey.startsWith(monthKey))
        .flatMap(([, events]) => events);
    const suggestions = distinctSuggestions(inMonth);
    const userEventCount = inMonth.filter((e) => e.source === 'user').length;
    return {
        suggestions,
        suggestionCount: suggestions.length,
        userEventCount,
        totalEvents: userEventCount + suggestions.length,
    };
};
