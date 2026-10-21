/**
 * Android channel every reminder, appointment and baby message is posted on.
 *
 * Its own module so services that schedule notifications can name it without
 * importing notificationService (which installs the global notification handler
 * at load time). The channel itself is created by ensureNotificationChannels.
 */
export const REMINDERS_CHANNEL_ID = 'pregnancy-reminders';
