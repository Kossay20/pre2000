import { theme } from '../theme';
import { differenceInCalendarDays } from 'date-fns';
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
import { createLogger } from '../utils/logger';
import { cancelRDVReminders } from './rdvNotificationService';
import { CalendarTemplate } from '../types';

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

const calculateEventDate = (
    lmpDate: Date,
    targetWeek: number,
    recommendedDay: number
): Date => {
    const weeksOffset = (targetWeek - 1) * 7;
    const dayOffset = recommendedDay - 1;
    const totalDays = weeksOffset + dayOffset;

    const eventDate = new Date(lmpDate);
    eventDate.setDate(lmpDate.getDate() + totalDays);

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
            importance: String(template.importance),
            description: template.description_fr || '',
            description_fr: template.description_fr || '',
            description_ar: template.description_ar,
            description_en: template.description_en,
            description_tn: template.description_tn,
            source: template.sources,
            priorityColor: getPriorityColor(String(template.importance)),
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
 * Load all calendar templates from Firestore
 * @returns Promise resolving to array of CalendarTemplate
 */
export const loadCalendarTemplates = async (): Promise<CalendarTemplate[]> => {
    log.info('Loading calendar templates from Firestore...');
    try {
        const snapshot = await getDocs(collection(db, 'calendarTemplates'));
        const templates = snapshot.docs.map((doc) => doc.data() as CalendarTemplate);
        log.success(`Loaded ${templates.length} calendar templates`);
        if (templates.length === 0) {
            log.warn('No calendar templates found! Check Firestore data import.');
        }
        return templates;
    } catch (error) {
        log.error('Error loading calendar templates:', error);
        return [];
    }
};

export const getWeekDates = (lmpDate: Date, weekNumber: number): { start: Date; end: Date } => {
    const weekStart = new Date(lmpDate);
    weekStart.setDate(lmpDate.getDate() + (weekNumber - 1) * 7);
    // FIX: Set to start of day (00:00:00) to include events at any time
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    // FIX: Set to end of day (23:59:59) to include events at any time on the last day
    weekEnd.setHours(23, 59, 59, 999);

    return { start: weekStart, end: weekEnd };
};

// ============ USER EVENTS SECTION ============

import { doc, setDoc, deleteDoc, query, where, orderBy, limit } from 'firebase/firestore';
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
export const calculateWeekFromDate = (lmpDate: Date, eventDate: Date): number => {
    // W3 #3: calendar-day diff is DST-safe. The previous raw (getTime diff)/86400000 floor drifted
    // ±1 day across a spring-forward/fall-back boundary, so a persisted event.week could land one
    // week off from the canonical calculatePregnancyWeek (which normalizes via UTC).
    const diffDays = differenceInCalendarDays(eventDate, lmpDate);
    const weeks = Math.floor(diffDays / 7) + 1;
    return Math.max(1, Math.min(40, weeks));
};

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
 * Save a new user event to Firestore
 */
export const saveUserEvent = async (
    event: Omit<UserEvent, 'event_id' | 'created_at'>
): Promise<UserEvent> => {
    // NEW-08 FIX: Guard at service level — prevents PERMISSION_DENIED regardless of UI path
    if (!event.user_id || event.user_id.startsWith('guest_')) {
        log.warn('[CalendarService] Blocked guest from saving event to Firestore');
        throw new Error('guest_blocked');
    }

    log.info('Saving new user event:', event.title);
    // NEW-10 FIX: Nano-id prevents ID collisions on rapid double-taps (Date.now alone can repeat)
    const eventId = `user_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;


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
        await setDoc(doc(db, 'userEvents', eventId), cleanedEvent);
        log.success(`User event saved: ${eventId}`);
        return cleanedEvent as UserEvent;
    } catch (error: any) {
        log.error('[CalendarService] Error saving user event:', error);
        log.error('[CalendarService] Error details:', JSON.stringify(error));
        if (error.code === 'permission-denied') {
            log.error('[CalendarService] PERMISSION DENIED. Check Firestore rules. User ID used:', cleanedEvent.user_id);
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
/**
 * Update an existing user event
 */
export const updateUserEvent = async (
    eventId: string,
    updates: Partial<Omit<UserEvent, 'event_id' | 'created_at'>>
): Promise<void> => {
    log.info(`Updating user event: ${eventId}`);
    try {
        // Filter out undefined values (Firestore doesn't accept undefined)
        const cleanedUpdates: Record<string, any> = {};
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                cleanedUpdates[key] = value;
            }
        });

        log.debug('Cleaned updates:', cleanedUpdates);

        const eventRef = doc(db, 'userEvents', eventId);
        await setDoc(eventRef, cleanedUpdates, { merge: true });
        log.success(`User event updated: ${eventId}`);
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
export const getLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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
