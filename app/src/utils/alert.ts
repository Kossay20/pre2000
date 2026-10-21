import { Alert, Platform } from 'react-native';

export interface AlertButton {
    text?: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress?: () => void;
}

/**
 * Cross-platform alert utility.
 * Uses Alert.alert on native and window.alert / window.confirm on web.
 *
 * WEB DOUBLE-DIALOG FIX: the previous implementation ALWAYS called
 * `window.alert(title\n\nmessage)` first, and then — when the caller passed two
 * or more buttons — called `window.confirm(title\n\nmessage)` with the exact
 * same text. The user had to dismiss the identical message twice before the
 * confirmation even appeared. Now web picks exactly one dialog:
 *   • 2+ buttons  → a single window.confirm (a real choice), or one confirm per
 *                   positive button when there are several
 *   • 0-1 buttons → a single window.alert
 *
 * Web also never invoked the cancel button's `onPress`, unlike Alert.alert on
 * native, so a caller relying on cancel cleanup silently did nothing. Both
 * platforms now behave the same.
 *
 * Note that `window.alert`/`window.confirm` are synchronous and block the page.
 * They are acceptable for the web *preview* of a native-first app; a real web
 * release should route these through the in-app modal instead.
 */
export const showAlert = (title: string, message: string, buttons?: AlertButton[]) => {
    if (Platform.OS !== 'web') {
        Alert.alert(title, message, buttons);
        return;
    }

    const text = `${title}\n\n${message}`;
    const confirmButton = buttons?.find(b => b.style !== 'cancel');
    const cancelButton = buttons?.find(b => b.style === 'cancel');
    const positiveButtons = buttons?.filter(b => b.style !== 'cancel') ?? [];

    // Several positive choices (the clinical alert's "call emergency" and "save anyway")
    // cannot fit in one OK/Cancel dialog: OK used to mean the first of them, so the others
    // were unreachable on web. Each one is offered in turn, named in the dialog, and
    // dismissing them all is the cancel.
    if (positiveButtons.length > 1) {
        for (const button of positiveButtons) {
            if (window.confirm(`${text}\n\n➜ ${button.text ?? ''}`)) {
                button.onPress?.();
                return;
            }
        }
        cancelButton?.onPress?.();
        return;
    }

    // A genuine choice — two or more buttons, one of them positive — gets ONE
    // confirm dialog and no preceding alert. With no positive button there is
    // nothing to confirm, and window.confirm cannot report *which* cancel was
    // tapped, so that degenerate case stays informational.
    if (buttons && buttons.length > 1 && confirmButton) {
        if (window.confirm(text)) confirmButton?.onPress?.();
        else cancelButton?.onPress?.();
        return;
    }

    // Informational, or a single acknowledge button.
    window.alert(text);
    confirmButton?.onPress?.();
};
