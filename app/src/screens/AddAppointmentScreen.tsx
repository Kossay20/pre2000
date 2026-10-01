import { createLogger } from '../utils/logger';
const log = createLogger('AddAppointmentScreen');
import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Platform,
    ScrollView,
    Switch,
    ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePregnancy } from '../context/PregnancyContext';
import { saveUserEvent, calculateWeekFromDate, updateUserEvent, newUserEventId, getUserEvent } from '../services/calendarService';
import { UserEvent } from '../types';
import { parseLocalDateKey, toLocalDateKey, isOnLocalDay } from '../utils/localDate';
import { initialAppointmentDate, withLocalDay, withLocalTime, toMinute } from '../utils/appointmentDate';
import { Button } from '../components/common/Button';
import { scheduleRDVReminders, cancelRDVReminders, getRDVReminders, getRDVPreference } from '../services/rdvNotificationService';
import { requestNotificationsAndResync } from '../services/notificationPermissionFlow';
import { analyticsService } from '../services/analyticsService';
import { trackPositiveAction } from '../services/inAppReviewService';
import { theme } from '../theme';
import { format, isValid } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../hooks/useDateLocale';
import { getPickerLocale } from '../utils/pickerLocale';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { showAlert } from '../utils/alert';
import { confirmAction } from '../utils/uiUtils';
import {
    savePendingAppointmentDraft,
    loadPendingAppointmentDraft,
    clearPendingAppointmentDraft,
} from '../utils/pendingAppointmentDraft';
import { styles } from './AddAppointmentScreen.styles';






/** The event being edited, as the form reads it. */
interface EditableEvent {
    id: string;
    title: string;
    date: string;
    type?: string;
    category?: 'medical' | 'other';
    location?: string;
    notes?: string;
}

const toEditable = (event: UserEvent): EditableEvent => ({
    id: event.event_id,
    title: event.title,
    date: event.date,
    type: event.type,
    category: event.category,
    location: event.location,
    notes: event.notes,
});

/**
 * Edit mode is addressed by `eventId` alone and the event is read from the server here.
 * The Calendar used to pass the whole event object: on web that param became
 * "[object Object]" in the URL, so a reload reopened an "edit" form with every field
 * empty, and the Month view passed an object without the location.
 */
export const AddAppointmentScreen = () => {
    useScreenAnalytics('AddAppointmentScreen');
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { t } = useTranslation();
    const eventId: string | undefined = typeof route.params?.eventId === 'string' && route.params.eventId
        ? route.params.eventId
        : undefined;
    const [loaded, setLoaded] = useState<{ id: string; event: EditableEvent | null } | null>(null);

    useEffect(() => {
        if (!eventId) return;
        let cancelled = false;
        getUserEvent(eventId).then((event) => {
            if (!cancelled) setLoaded({ id: eventId, event: event ? toEditable(event) : null });
        });
        return () => { cancelled = true; };
    }, [eventId]);

    if (!eventId) return <AppointmentForm />;

    if (!loaded || loaded.id !== eventId) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.centerStateMsg}>{t('common.loading')}</Text>
            </View>
        );
    }

    if (!loaded.event) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.centerStateTitle} accessibilityRole="header">{t('addAppointment.notFoundTitle')}</Text>
                <Text style={styles.centerStateMsg}>{t('addAppointment.notFoundMsg')}</Text>
                <Button
                    title={t('addAppointment.backToCalendar')}
                    onPress={() => navigation.navigate('CalendarMain' as never)}
                />
            </View>
        );
    }

    return <AppointmentForm key={loaded.id} editingEvent={loaded.event} />;
};

const AppointmentForm = ({ editingEvent }: { editingEvent?: EditableEvent }) => {
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { user, firebaseUser } = useAuth();

    const { profile, pregnancyInfo } = usePregnancy();
    const { showToast } = useToast();
    const { t, i18n } = useTranslation();

    // Get date locale based on current language
    // Get date locale using shared hook (handles tn -> arTN correctly)
    const dateLocale = useDateLocale();

    // DEBUG: Log incoming params
    useEffect(() => {
        log.debug('[AddAppointmentScreen] Params:', JSON.stringify(route.params));
        // Note: date is initialized from route.params, logged above
    }, []);

    const [title, setTitle] = useState(editingEvent?.title || '');
    // CAL-04: prefer the persisted `category` (Medical/Personal) so re-opening an
    // event restores the real choice. Legacy events without `category` fall back to
    // the old type-based heuristic (every user event has type 'appointment' → 'medical').
    const initialType = (
        editingEvent?.category === 'medical' || editingEvent?.category === 'other'
            ? editingEvent.category
            : (editingEvent?.type === 'appointment' ? 'medical' : 'other')
    ) as 'medical' | 'other';
    const [type, setType] = useState<'medical' | 'other'>(initialType);

    const getInitialDate = () => {
        if (editingEvent?.date) return new Date(editingEvent.date);
        const selected = route.params?.selectedDate;
        return initialAppointmentDate(typeof selected === 'string' ? selected : undefined);
    };

    const [date, setDate] = useState(getInitialDate());
    const [tempDate, setTempDate] = useState<Date>(date);
    // Web types the day as text. The text is kept as typed so an impossible day
    // ("2026-02-31") stays on screen with an error instead of being rolled over to 3 March
    // by the Date constructor; `date` only takes days that exist.
    const [dateText, setDateText] = useState(() => toLocalDateKey(date));
    const [location, setLocation] = useState(editingEvent?.location || '');
    const [notes, setNotes] = useState(editingEvent?.notes || '');

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [saving, setSaving] = useState(false);
    // One document id per form: a second Save (after an error, or a retry while the
    // first write is still queued offline) overwrites that document instead of
    // creating a duplicate appointment.
    const newEventIdRef = React.useRef<string>(newUserEventId());

    // Reminder settings - 3 independent options
    const [reminderJ1, setReminderJ1] = useState(true);   // Veille à 8h
    const [reminderJ, setReminderJ] = useState(true);     // Jour J à 8h
    const [reminderH2, setReminderH2] = useState(false);  // 2h avant
    const [loadingReminders, setLoadingReminders] = useState(!!editingEvent);

    const isGuest = !!user?.isGuest;

    // GUEST-DRAFT FIX (restore side). When a guest hits Save we stash the form and
    // send them to the account screen; on the way back, authenticated, we refill it
    // so they don't have to retype anything. Only restores for a real account and
    // only for a fresh form (never clobbers an event being edited).
    useEffect(() => {
        if (isGuest || editingEvent) return;
        let cancelled = false;
        (async () => {
            const draft = await loadPendingAppointmentDraft();
            if (!draft || cancelled) return;
            setTitle(draft.title);
            setType(draft.type);
            const restoredDate = new Date(draft.date);
            if (!isNaN(restoredDate.getTime())) {
                setDate(restoredDate);
                setTempDate(restoredDate);
            }
            setLocation(draft.location);
            setNotes(draft.notes);
            setReminderJ1(draft.reminderJ1);
            setReminderJ(draft.reminderJ);
            setReminderH2(draft.reminderH2);
            await clearPendingAppointmentDraft();
            showToast(t('addAppointment.draftRestored'), 'success');
        })();
        return () => { cancelled = true; };
    }, [isGuest, editingEvent]);

    // Load existing reminder preferences when editing
    useEffect(() => {
        const loadExistingPreferences = async () => {
            if (editingEvent?.id) {
                try {
                    // Use preferences (what user WANTED) instead of scheduled reminders
                    const preference = await getRDVPreference(editingEvent.id);

                    if (preference) {
                        setReminderJ1(preference.reminderJ1);
                        setReminderJ(preference.reminderJ);
                        setReminderH2(preference.reminderH2);
                    } else {
                        // No preference found, try to load from actually scheduled reminders (backward compatibility)
                        const existingReminders = await getRDVReminders(editingEvent.id);
                        if (existingReminders.length > 0) {
                            const hasJ1 = existingReminders.some(r => r.reminderType === 'J-1');
                            const hasJ = existingReminders.some(r => r.reminderType === 'J');
                            const hasH2 = existingReminders.some(r => r.reminderType === 'H-2');
                            setReminderJ1(hasJ1);
                            setReminderJ(hasJ);
                            setReminderH2(hasH2);
                        } else {
                            // No existing reminders, default all to false for existing events
                            setReminderJ1(false);
                            setReminderJ(false);
                            setReminderH2(false);
                        }
                    }
                } catch (error) {
                    log.error('Error loading existing preferences:', error);
                } finally {
                    setLoadingReminders(false);
                }
            }
        };

        loadExistingPreferences();
    }, [editingEvent?.id]);

    const isTitleValid = title.trim().length > 0;

    // A date set from elsewhere (restored draft, native picker) replaces the text unless
    // the text already names that day.
    useEffect(() => {
        setDateText((prev) => (parseLocalDateKey(prev) && isOnLocalDay(date, prev) ? prev : toLocalDateKey(date)));
    }, [date]);

    const dateError = Platform.OS !== 'web'
        ? null
        : dateText.trim() === ''
            ? t('addAppointment.errors.dateRequired')
            : parseLocalDateKey(dateText) ? null : t('addAppointment.errors.dateInvalid');

    // PERFECT-FIX-3: snapshot the full initial form state at mount so hasUnsavedChanges
    // covers title, date, location, type, notes AND reminder toggles
    // (previously only title + notes were compared → users lost silent edits on back).
    // For edit mode, reminder baselines are reconciled once getRDVPreference resolves.
    const initialSnapshotRef = React.useRef({
        title: editingEvent?.title || '',
        dateMs: date.getTime(),
        location: editingEvent?.location || '',
        type: initialType,
        notes: editingEvent?.notes || '',
        reminderJ1: editingEvent ? false : true,
        reminderJ: editingEvent ? false : true,
        reminderH2: false,
    });
    const remindersBaselineCapturedRef = React.useRef(!editingEvent);

    // Reconcile reminder baseline once edit-mode preferences load
    useEffect(() => {
        if (!loadingReminders && !remindersBaselineCapturedRef.current) {
            initialSnapshotRef.current.reminderJ1 = reminderJ1;
            initialSnapshotRef.current.reminderJ = reminderJ;
            initialSnapshotRef.current.reminderH2 = reminderH2;
            remindersBaselineCapturedRef.current = true;
        }
    }, [loadingReminders, reminderJ1, reminderJ, reminderH2]);

    // Check for unsaved changes (extended)
    const hasUnsavedChanges = useMemo(() => {
        if (!remindersBaselineCapturedRef.current) return false;
        const snap = initialSnapshotRef.current;
        return (
            title.trim() !== snap.title.trim()
            || date.getTime() !== snap.dateMs
            || location.trim() !== snap.location.trim()
            || type !== snap.type
            || notes.trim() !== snap.notes.trim()
            || reminderJ1 !== snap.reminderJ1
            || reminderJ !== snap.reminderJ
            || reminderH2 !== snap.reminderH2
        );
    }, [title, date, location, type, notes, reminderJ1, reminderJ, reminderH2, loadingReminders]);

    // Prevent accidental back navigation if changes exist
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (!hasUnsavedChanges || saving) {
                // If we don't have changes, or we are currently saving, proceed
                return;
            }

            // Prevent default behavior of leaving the screen
            e.preventDefault();

            // CAL-02: Alert.alert is a no-op on react-native-web, which trapped the
            // user (Cancel/back/tab all blocked) because preventDefault() ran but no
            // dialog ever appeared. On web, use the synchronous window.confirm and
            // dispatch the blocked action immediately when the user confirms.
            if (Platform.OS === 'web') {
                const confirmDiscard = window.confirm(
                    `${t('addAppointment.discardTitle')}\n\n${t('addAppointment.discardMsg')}`
                );
                if (confirmDiscard) {
                    navigation.dispatch(e.data.action);
                }
                return;
            }

            // Prompt the user before leaving (native — web handled above via window.confirm).
            // WEB-ALERT: confirmAction keeps the destructive "discard" callback (dispatch the
            // blocked action) and the "keep editing" cancel label.
            confirmAction(
                t('addAppointment.discardTitle'),
                t('addAppointment.discardMsg'),
                // If the user confirmed, then we dispatch the action we blocked earlier
                // This will continue the action that had triggered the removal of the screen
                () => navigation.dispatch(e.data.action),
                undefined,
                t('addAppointment.keepEditing'),
                t('addAppointment.discard')
            );
        });

        return unsubscribe;
    }, [navigation, hasUnsavedChanges, saving, t]);

    const handleDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
                const newDate = new Date(date);
                newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                setDate(newDate);
            }
        } else if (Platform.OS === 'ios') {
            if (selectedDate) {
                const newDate = new Date(tempDate);
                newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                setTempDate(newDate); // Buffer the change
            }
        }
    };

    const handleWebDateChange = (text: string) => {
        setDateText(text);
        // Only a day that exists is committed; anything else stays as typed, flagged by
        // dateError, and Save is held back until it is fixed.
        const next = withLocalDay(date, text);
        if (next) setDate(next);
    };

    const handleWebTimeChange = (text: string) => {
        // Seconds are zeroed: `date` starts from new Date(), and an appointment saved at
        // "10:30" was stored as 10:30:13.559.
        const next = withLocalTime(date, text);
        if (next) setDate(next);
    };

    const handleTimeChange = (event: any, selectedTime?: Date) => {
        if (Platform.OS === 'android') {
            setShowTimePicker(false);
            if (event.type === 'set' && selectedTime) {
                const newDate = new Date(date);
                newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
                setDate(newDate);
            }
        } else if (Platform.OS === 'ios') {
            if (selectedTime) {
                const newDate = new Date(tempDate);
                newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
                setTempDate(newDate); // Buffer the change
            }
        }
    };

    const handleSave = async () => {
        if (!isTitleValid) {
            // WEB-ALERT: showAlert surfaces the message on web too (Alert.alert is a no-op there).
            showAlert(t('addAppointment.missingTitleTitle'), t('addAppointment.missingTitleMsg'));
            return;
        }
        if (dateError) {
            showAlert(t('addAppointment.errorSaveTitle'), dateError);
            return;
        }

        // DEBUG: Log user and profile state
        // NOTE: firebaseUser is already available from component-level useAuth() call
        log.debug('[AddAppointmentScreen] Saving event. UserUID:', user?.uid, 'FirebaseUID:', firebaseUser?.uid, 'Profile LMP:', profile?.lmp);

        // Robust check: Ensure we have at least a UID and a pregnancy start date (from either context)
        const effectiveLmp = profile?.lmp || user?.pregnancyStartDate || user?.lmp || new Date().toISOString(); // Fallback to now if absolutely everything fails

        // Use the correct UID (user.uid should now be populated from AuthContext fix)
        // Fallback chain: user.uid (from profile) > firebaseUser.uid (from Firebase auth)
        const effectiveUid = user?.uid || firebaseUser?.uid;

        // Log the decision
        log.info('[AddAppointmentScreen] Using effective UID:', effectiveUid, 'LMP:', effectiveLmp);

        if (!effectiveUid) {
            log.error('[AddAppointmentScreen] No UID available. User may not be authenticated.');
            // DEAD-END FIX: this used to show a message and stop, leaving the user
            // stuck on a form they could never submit. Offer the way out — same
            // draft-preserving path as the guest branch below.
            await savePendingAppointmentDraft({
                title: title.trim(),
                type,
                date: date.toISOString(),
                location,
                notes,
                reminderJ1,
                reminderJ,
                reminderH2,
            });
            confirmAction(
                t('addAppointment.notConnectedTitle'),
                t('addAppointment.notConnectedMsg'),
                () => navigation.getParent()?.navigate('Home', { screen: 'GuestUpgrade' }),
                undefined,
                t('addAppointment.cancel'),
                t('addAppointment.guestAlertCreate')
            );
            return;
        }

        // Guest check
        if (user?.isGuest) {
            // GUEST-DRAFT FIX: a guest used to lose everything they had typed here —
            // the form was fully open, Save was the first sign an account was needed,
            // and the data was dropped on the way to the signup screen. Persist the
            // draft first; RegisterScreen sends them back here after signup and the
            // restore effect above refills the form.
            await savePendingAppointmentDraft({
                title: title.trim(),
                type,
                date: date.toISOString(),
                location,
                notes,
                reminderJ1,
                reminderJ,
                reminderH2,
            });

            const goToUpgrade = () =>
                navigation.getParent()?.navigate('Home', { screen: 'GuestUpgrade' });

            // confirmAction handles both platforms (window.confirm on web,
            // Alert.alert on native). The previous web branch called window.confirm
            // directly, which cannot render the localized "create account" button
            // label — it always showed the browser's OK/Cancel.
            confirmAction(
                t('addAppointment.guestAlertTitle'),
                t('addAppointment.guestAlertMsg'),
                goToUpgrade,
                undefined,
                t('addAppointment.cancel'),
                t('addAppointment.guestAlertCreate')
            );
            return;
        }

        setSaving(true);

        try {
            const lmpDate = new Date(effectiveLmp);
            const when = toMinute(date);
            const week = calculateWeekFromDate(lmpDate, when);

            let eventId: string;

            if (editingEvent?.id) {
                // UPDATE existing event. An emptied location/notes is sent as null (= clear):
                // the update is a merge, so leaving the key out kept the old text.
                eventId = editingEvent.id;
                const { pendingSync } = await updateUserEvent(editingEvent.id, {
                    title: title.trim(),
                    date: when.toISOString(),
                    week,
                    type: 'appointment',
                    category: type, // CAL-04: persist the real Medical/Personal selection
                    location: location.trim() || null,
                    notes: notes.trim() || null,
                });
                showToast(pendingSync ? t('addAppointment.savedOffline') : t('addAppointment.successEdit'), pendingSync ? 'info' : 'success');
            } else {
                // CREATE new event
                const result = await saveUserEvent({
                    user_id: effectiveUid, // Use the robust UID
                    title: title.trim(),
                    date: when.toISOString(),
                    week,
                    type: 'appointment',
                    category: type, // CAL-04: persist the real Medical/Personal selection
                    location: location.trim() || undefined,
                    notes: notes.trim() || undefined,
                }, { eventId: newEventIdRef.current });
                // U-FIX-3: was `(result as any)?.id` but saveUserEvent returns `event_id`,
                // so eventId always fell back to `temp_*` — notifications were orphaned from
                // the real Firestore doc. Now reads the correct field.
                eventId = result?.event_id || `temp_${Date.now()}`;
                // Offline the write is queued, not lost: say so instead of claiming it
                // reached the server (and instead of spinning on "Enregistrement…").
                showToast(
                    result.pendingSync ? t('addAppointment.savedOffline') : t('addAppointment.successAdd'),
                    result.pendingSync ? 'info' : 'success'
                );
                // Engagement: Track positive action
                trackPositiveAction('add_rdv');
                await analyticsService.logEvent('appointment_created', { type: type });
            }

            // Schedule reminders based on individual toggles
            // WRAP IN TRY/CATCH so it doesn't block the save if it fails
            try {
                const hasAnyReminder = reminderJ1 || reminderJ || reminderH2;
                if (hasAnyReminder && eventId) {
                    log.debug('[AddAppointmentScreen] Scheduling reminders for:', eventId);
                    // Asking here (rather than inside scheduleRDVReminders) means a first
                    // grant from this screen also schedules her other reminders.
                    await requestNotificationsAndResync({ week: pregnancyInfo?.week, locale: i18n.language, userId: user?.uid });
                    // P3.1 FIX: pass user.country so notifications fire in user's timezone
                    // (was defaulting to Africa/Algiers for everyone — wrong for FR/MA/TN/etc.)
                    await scheduleRDVReminders(eventId, title.trim(), when, {
                        reminderJ1: reminderJ1,
                        reminderJ: reminderJ,
                        reminderH2: reminderH2,
                        countryCode: user?.country,
                    });
                } else if (editingEvent?.id) {
                    // If no reminders selected, cancel existing ones
                    await cancelRDVReminders(editingEvent.id);
                }
            } catch (notifError) {
                log.error('[AddAppointmentScreen] Failed to schedule reminders (non-blocking):', notifError);
                // We don't throw here to ensure the RDV is kept
                // WEB-ALERT: showAlert surfaces this info on web too (Alert.alert is a no-op there).
                showAlert(t('addAppointment.reminderInfoTitle'), t('addAppointment.reminderInfoMsg'));
            }

            navigation.goBack();
        } catch (error: any) {
            log.error('Error saving appointment:', error);
            // WEB-ALERT: showAlert surfaces the save error on web too (Alert.alert is a no-op there).
            showAlert(t('addAppointment.errorSaveTitle'), t('addAppointment.errorSaveMsg', { error: error.message || t('common.unknownError') }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>{editingEvent ? t('addAppointment.editTitle') : t('addAppointment.newTitle')}</Text>
                    <Text style={styles.headerSubtitle}>
                        {editingEvent ? t('addAppointment.editSubtitle') : t('addAppointment.newSubtitle')}
                    </Text>
                </View>

                {/* GUEST-BANNER FIX: a guest used to get the whole form with no hint
                    that saving needs an account — the block only fired on Save, after
                    everything was typed. Say it up front, with the way out one tap away. */}
                {isGuest && (
                    <TouchableOpacity
                        style={styles.guestBanner}
                        onPress={() => navigation.getParent()?.navigate('Home', { screen: 'GuestUpgrade' })}
                        accessibilityRole="button"
                        accessibilityLabel={t('addAppointment.guestAlertCreate')}
                    >
                        <Text style={styles.guestBannerTitle}>{t('addAppointment.guestBannerTitle')}</Text>
                        <Text style={styles.guestBannerMsg}>{t('addAppointment.guestBannerMsg')}</Text>
                        <Text style={styles.guestBannerCta}>{t('addAppointment.guestAlertCreate')}</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.form}>
                    {/* Title Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('addAppointment.titleLabel')}</Text>
                        <TextInput
                            style={[styles.input, !isTitleValid && title.length > 0 && { borderColor: theme.colors.error }]}
                            placeholder={t('addAppointment.titlePlaceholder')}
                            placeholderTextColor={theme.colors.textLight}
                            value={title}
                            onChangeText={setTitle}
                            maxLength={100}
                            accessibilityLabel={t('addAppointment.titleLabel')}
                        />
                    </View>

                    {/* Type Selector */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('addAppointment.typeLabel')}</Text>
                        <View style={styles.typeContainer}>
                            <TouchableOpacity
                                style={[styles.typeButton, type === 'medical' && styles.typeButtonActive]}
                                onPress={() => setType('medical')}
                                accessibilityRole="button"
                                accessibilityLabel={t('addAppointment.typeMedical')}
                                accessibilityState={{ selected: type === 'medical' }}
                                // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.selected → expose aria explicitly.
                                {...(Platform.OS === 'web' ? { 'aria-selected': type === 'medical' } : {})}
                            >
                                <Text style={[styles.typeText, type === 'medical' && styles.typeTextActive]}>{t('addAppointment.typeMedical')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.typeButton, type === 'other' && styles.typeButtonActive]}
                                onPress={() => setType('other')}
                                accessibilityRole="button"
                                accessibilityLabel={t('addAppointment.typeOther')}
                                accessibilityState={{ selected: type === 'other' }}
                                // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.selected → expose aria explicitly.
                                {...(Platform.OS === 'web' ? { 'aria-selected': type === 'other' } : {})}
                            >
                                <Text style={[styles.typeText, type === 'other' && styles.typeTextActive]}>{t('addAppointment.typeOther')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Date & Time Pickers Row */}
                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.label}>{t('addAppointment.dateLabel')}</Text>
                            {Platform.OS === 'web' ? (
                                <>
                                    <TextInput
                                        style={[styles.dateButton, !!dateError && { borderColor: theme.colors.error }]}
                                        value={dateText}
                                        onChangeText={handleWebDateChange}
                                        placeholder="YYYY-MM-DD"
                                        accessibilityLabel={t('addAppointment.dateLabel')}
                                        // @ts-ignore - Web specific attribute
                                        inputMode="none"
                                    />
                                    {dateError ? (
                                        <Text style={styles.fieldError} accessibilityLiveRegion="polite" role="alert">
                                            {dateError}
                                        </Text>
                                    ) : isValid(date) && (
                                        // CAL-07: the control keeps a yyyy-MM-dd value (required for
                                        // parsing), but raw ISO is unfriendly — show a localized read-out.
                                        <Text style={styles.dateReadout}>
                                            {format(date, 'dd MMM yyyy', { locale: dateLocale })}
                                        </Text>
                                    )}
                                </>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.dateButton, showDatePicker && { borderColor: theme.colors.primary, borderWidth: 2 }]}
                                    onPress={() => {
                                        setTempDate(date); // Initialize buffer to current date before opening
                                        setShowDatePicker(true);
                                        setShowTimePicker(false); // Close other picker
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${t('addAppointment.dateLabel')}: ${format(date, 'dd MMMM yyyy', { locale: dateLocale })}`}
                                    accessibilityHint={t('a11y.selectDate')}
                                    accessibilityState={{ expanded: showDatePicker }}
                                    // CAL-R2-03: this picker button renders on NATIVE only (web uses the
                                    // <TextInput> branch above), so no web aria is needed here.
                                >
                                    <Text style={styles.dateText}>
                                        {format(date, 'dd MMMM yyyy', { locale: dateLocale })}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.label}>{t('addAppointment.timeLabel')}</Text>
                            {Platform.OS === 'web' ? (
                                <TextInput
                                    style={styles.dateButton}
                                    value={isValid(date) ? format(date, 'HH:mm') : ''}
                                    onChangeText={handleWebTimeChange}
                                    placeholder="HH:MM"
                                    // @ts-ignore - Web specific attribute
                                    inputMode="none"
                                />
                            ) : (
                                <TouchableOpacity
                                    style={[styles.dateButton, showTimePicker && { borderColor: theme.colors.primary, borderWidth: 2 }]}
                                    onPress={() => {
                                        setTempDate(date); // Initialize buffer to current time before opening
                                        setShowTimePicker(true);
                                        setShowDatePicker(false); // Close other picker
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${t('addAppointment.timeLabel')}: ${format(date, 'HH:mm')}`}
                                    accessibilityHint={t('a11y.selectTime')}
                                    accessibilityState={{ expanded: showTimePicker }}
                                    // CAL-R2-03: this picker button renders on NATIVE only (web uses the
                                    // <TextInput> branch above), so no web aria is needed here.
                                >
                                    <Text style={styles.dateText}>
                                        {format(date, 'HH:mm')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Native Pickers Area (Android) */}
                    {Platform.OS === 'android' && (showDatePicker || showTimePicker) && (
                        <View>
                            {showDatePicker && (
                                <DateTimePicker
                                    value={date}
                                    mode="date"
                                    display="default"
                                    onChange={handleDateChange}
                                    locale={getPickerLocale(i18n.language)}
                                    minimumDate={new Date()}
                                />
                            )}
                            {showTimePicker && (
                                <DateTimePicker
                                    value={date}
                                    mode="time"
                                    display="default"
                                    onChange={handleTimeChange}
                                    locale={getPickerLocale(i18n.language)}
                                />
                            )}
                        </View>
                    )}

                    {/* Location Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('addAppointment.locationLabel')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('addAppointment.locationPlaceholder')}
                            placeholderTextColor={theme.colors.textLight}
                            value={location}
                            onChangeText={setLocation}
                            maxLength={200}
                            accessibilityLabel={t('addAppointment.locationLabel')}
                        />
                    </View>

                    {/* Notes Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('addAppointment.notesLabel')}</Text>
                        <TextInput
                            style={[styles.input, styles.notesInput]}
                            placeholder={t('addAppointment.notesPlaceholder')}
                            placeholderTextColor={theme.colors.textLight}
                            value={notes}
                            onChangeText={setNotes}
                            multiline
                            numberOfLines={4}
                            maxLength={500}
                            accessibilityLabel={t('addAppointment.notesLabel')}
                        />
                    </View>

                    {/* Reminders Section */}
                    <View style={styles.remindersSection}>
                        <Text style={styles.remindersSectionTitle}>🔔 {t('addAppointment.remindersLabel')}</Text>

                        {/* J-1: Veille à 8h */}
                        <View style={styles.reminderRow}>
                            <View style={styles.reminderInfo}>
                                <Text style={styles.reminderLabel}>{t('addAppointment.reminderJ1')}</Text>
                                <Text style={styles.reminderDesc}>{t('addAppointment.reminderJ1Desc')}</Text>
                            </View>
                            <Switch
                                value={reminderJ1}
                                onValueChange={setReminderJ1}
                                trackColor={{ false: theme.colors.disabled, true: theme.colors.primarySoft }}
                                thumbColor={reminderJ1 ? theme.colors.primary : theme.colors.neutral400}
                                accessibilityRole="switch"
                                accessibilityLabel={t('addAppointment.reminderJ1')}
                                accessibilityState={{ checked: reminderJ1 }}
                                {...(Platform.OS === 'web' ? { 'aria-checked': reminderJ1 } : {})}
                            />
                        </View>

                        {/* J: Jour même à 8h */}
                        <View style={styles.reminderRow}>
                            <View style={styles.reminderInfo}>
                                <Text style={styles.reminderLabel}>{t('addAppointment.reminderJ')}</Text>
                                <Text style={styles.reminderDesc}>{t('addAppointment.reminderJDesc')}</Text>
                            </View>
                            <Switch
                                value={reminderJ}
                                onValueChange={setReminderJ}
                                trackColor={{ false: theme.colors.disabled, true: theme.colors.primarySoft }}
                                thumbColor={reminderJ ? theme.colors.primary : theme.colors.neutral400}
                                accessibilityRole="switch"
                                accessibilityLabel={t('addAppointment.reminderJ')}
                                accessibilityState={{ checked: reminderJ }}
                                {...(Platform.OS === 'web' ? { 'aria-checked': reminderJ } : {})}
                            />
                        </View>

                        {/* H-2: 2 heures avant */}
                        <View style={styles.reminderRow}>
                            <View style={styles.reminderInfo}>
                                <Text style={styles.reminderLabel}>{t('addAppointment.reminderH2')}</Text>
                                <Text style={styles.reminderDesc}>{t('addAppointment.reminderH2Desc')}</Text>
                            </View>
                            <Switch
                                value={reminderH2}
                                onValueChange={setReminderH2}
                                trackColor={{ false: theme.colors.disabled, true: theme.colors.primarySoft }}
                                thumbColor={reminderH2 ? theme.colors.primary : theme.colors.neutral400}
                                accessibilityRole="switch"
                                accessibilityLabel={t('addAppointment.reminderH2')}
                                accessibilityState={{ checked: reminderH2 }}
                                {...(Platform.OS === 'web' ? { 'aria-checked': reminderH2 } : {})}
                            />
                        </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={() => navigation.goBack()}
                            disabled={saving}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.cancel')}
                            accessibilityState={{ disabled: saving }}
                        >
                            <Text style={styles.cancelButtonText}>{t('addAppointment.cancel')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.saveChanges')}
                            accessibilityHint={t('a11y.saveChangesHint')}
                            accessibilityState={{ disabled: !isTitleValid || !!dateError || saving, busy: saving }}
                            style={[
                                styles.button,
                                styles.saveButton,
                                (!isTitleValid || !!dateError || saving) && styles.saveButtonDisabled
                            ]}
                            onPress={handleSave}
                            disabled={saving || !isTitleValid || !!dateError}
                        >
                            <Text style={styles.saveButtonText}>
                                {saving ? t('addAppointment.saving') : t('addAppointment.save')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {/* iOS Overlays for Date & Time Pickers */}
            {
                Platform.OS === 'ios' && (showDatePicker || showTimePicker) && (
                    <View style={styles.iosPickerOverlay}>
                        <View style={styles.iosPickerContent}>
                            <View style={styles.iosPickerHeader}>
                                <Text style={styles.iosPickerTitle}>
                                    {showDatePicker ? t('addAppointment.dateLabel') : t('addAppointment.timeLabel')}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        setDate(tempDate); // COMMIT the buffered changes when 'Valider' is clicked
                                        setShowDatePicker(false);
                                        setShowTimePicker(false);
                                    }}
                                >
                                    <Text style={styles.iosPickerDoneText}>{t('addAppointment.validate', 'Valider ✓')}</Text>
                                </TouchableOpacity>
                            </View>

                            {showDatePicker && (
                                <DateTimePicker
                                    value={tempDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={handleDateChange}
                                    locale={getPickerLocale(i18n.language)}
                                    minimumDate={new Date()}
                                    style={{ flex: 1, height: 200 }}
                                    themeVariant="light"
                                />
                            )}

                            {showTimePicker && (
                                <DateTimePicker
                                    value={tempDate}
                                    mode="time"
                                    display="spinner"
                                    onChange={handleTimeChange}
                                    locale={getPickerLocale(i18n.language)}
                                    style={{ flex: 1, height: 200 }}
                                    themeVariant="light"
                                />
                            )}
                        </View>
                    </View>
                )
            }
        </>
    );
};

