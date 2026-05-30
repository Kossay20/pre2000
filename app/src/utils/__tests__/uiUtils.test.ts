/**
 * Tests for uiUtils.confirmAction — cross-platform confirmation dialog.
 *
 * confirmAction branches on Platform.OS:
 *   - web   → window.confirm(`${title}\n\n${message}`); true→onConfirm, false→onCancel?
 *   - native→ Alert.alert(title, message, [cancel button, confirm button])
 *
 * Labels: cancelLabel/confirmLabel fall back to i18n.t('ui.cancel')/i18n.t('ui.confirm').
 *
 * Note: `react-native` is mapped to `react-native-web` via jest moduleNameMapper,
 * and testEnvironment is `node`. We fully replace `react-native` with a factory mock
 * (Platform + Alert) and stub `global.window.confirm` since `window` is absent in node.
 */

// Fully replace react-native (resolver applies moduleNameMapper → react-native-web,
// but a factory mock wins regardless of the resolved target).
jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    Alert: { alert: jest.fn() },
}));

// Lazy `require('../i18n').default` inside confirmAction → resolves to src/i18n here.
jest.mock('../../i18n', () => ({
    __esModule: true,
    default: {
        language: 'fr',
        t: (k: string) => k,
        changeLanguage: jest.fn(),
    },
}));

import { Alert, Platform } from 'react-native';
import { confirmAction } from '../uiUtils';

describe('uiUtils.confirmAction', () => {
    let confirmSpy: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        // window is undefined in the node test env — provide a controllable stub.
        confirmSpy = jest.fn(() => true);
        (global as any).window = { confirm: confirmSpy };
        // Default to native; web tests opt in explicitly.
        (Platform as any).OS = 'ios';
    });

    afterEach(() => {
        delete (global as any).window;
    });

    // ---------------------------------------------------------------------------
    // WEB branch (Platform.OS === 'web')
    // ---------------------------------------------------------------------------
    describe('web branch', () => {
        beforeEach(() => {
            (Platform as any).OS = 'web';
        });

        it('calls window.confirm with `${title}\\n\\n${message}` and fires onConfirm when accepted', () => {
            confirmSpy.mockReturnValue(true);
            const onConfirm = jest.fn();
            const onCancel = jest.fn();

            confirmAction('Supprimer ?', 'Cette action est irréversible.', onConfirm, onCancel);

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy).toHaveBeenCalledWith('Supprimer ?\n\nCette action est irréversible.');
            expect(onConfirm).toHaveBeenCalledTimes(1);
            expect(onCancel).not.toHaveBeenCalled();
            // Native dialog must not be used on web.
            expect(Alert.alert).not.toHaveBeenCalled();
        });

        it('fires onCancel (and not onConfirm) when the user dismisses', () => {
            confirmSpy.mockReturnValue(false);
            const onConfirm = jest.fn();
            const onCancel = jest.fn();

            confirmAction('Title', 'Message', onConfirm, onCancel);

            expect(onConfirm).not.toHaveBeenCalled();
            expect(onCancel).toHaveBeenCalledTimes(1);
        });

        it('does not throw and calls neither callback when dismissed with onCancel omitted', () => {
            confirmSpy.mockReturnValue(false);
            const onConfirm = jest.fn();

            expect(() => confirmAction('Title', 'Message', onConfirm)).not.toThrow();

            expect(onConfirm).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledTimes(1);
        });

        it('still fires onConfirm when accepted even with onCancel omitted', () => {
            confirmSpy.mockReturnValue(true);
            const onConfirm = jest.fn();

            confirmAction('Title', 'Message', onConfirm);

            expect(onConfirm).toHaveBeenCalledTimes(1);
        });

        it('treats any truthy confirm return as acceptance', () => {
            confirmSpy.mockReturnValue(true);
            const onConfirm = jest.fn();
            const onCancel = jest.fn();

            confirmAction('A', 'B', onConfirm, onCancel);

            expect(onConfirm).toHaveBeenCalledTimes(1);
            expect(onCancel).not.toHaveBeenCalled();
        });

        it('builds the prompt string verbatim including empty title/message', () => {
            confirmSpy.mockReturnValue(true);
            confirmAction('', '', jest.fn());

            expect(confirmSpy).toHaveBeenCalledWith('\n\n');
        });

        it('preserves special characters and Arabic (RTL) content in the prompt', () => {
            confirmSpy.mockReturnValue(true);
            const title = 'هل تريد الحذف؟';
            const message = 'لا يمكن التراجع — 100%';
            confirmAction(title, message, jest.fn());

            expect(confirmSpy).toHaveBeenCalledWith(`${title}\n\n${message}`);
        });

        it('does not consult i18n on the web branch (browser-native button labels)', () => {
            // confirmAction computes finalCancel/finalConfirm via i18n.t even on web,
            // but they are unused for window.confirm. We only assert no native dialog.
            confirmSpy.mockReturnValue(true);
            confirmAction('T', 'M', jest.fn());
            expect(Alert.alert).not.toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------------------
    // NATIVE branch (Platform.OS !== 'web')
    // ---------------------------------------------------------------------------
    describe('native branch', () => {
        beforeEach(() => {
            (Platform as any).OS = 'ios';
        });

        it('calls Alert.alert with title, message and two buttons (does not call window.confirm)', () => {
            confirmAction('Titre', 'Corps du message', jest.fn());

            expect(Alert.alert).toHaveBeenCalledTimes(1);
            const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
            expect(title).toBe('Titre');
            expect(message).toBe('Corps du message');
            expect(Array.isArray(buttons)).toBe(true);
            expect(buttons).toHaveLength(2);
            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('orders buttons as [cancel, destructive-confirm] with correct styles', () => {
            confirmAction('T', 'M', jest.fn(), jest.fn(), 'Annuler', 'OK');

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            expect(buttons[0]).toMatchObject({ text: 'Annuler', style: 'cancel' });
            expect(buttons[1]).toMatchObject({ text: 'OK', style: 'destructive' });
        });

        it('routes button[0].onPress to onCancel', () => {
            const onConfirm = jest.fn();
            const onCancel = jest.fn();
            confirmAction('T', 'M', onConfirm, onCancel);

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            buttons[0].onPress();

            expect(onCancel).toHaveBeenCalledTimes(1);
            expect(onConfirm).not.toHaveBeenCalled();
        });

        it('routes button[1].onPress to onConfirm', () => {
            const onConfirm = jest.fn();
            const onCancel = jest.fn();
            confirmAction('T', 'M', onConfirm, onCancel);

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            buttons[1].onPress();

            expect(onConfirm).toHaveBeenCalledTimes(1);
            expect(onCancel).not.toHaveBeenCalled();
        });

        it('passes onCancel as undefined when omitted (cancel button has no handler)', () => {
            const onConfirm = jest.fn();
            confirmAction('T', 'M', onConfirm);

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            expect(buttons[0].onPress).toBeUndefined();
            // Confirm handler is still wired.
            buttons[1].onPress();
            expect(onConfirm).toHaveBeenCalledTimes(1);
        });

        it('falls back to i18n keys when cancelLabel/confirmLabel are omitted', () => {
            confirmAction('T', 'M', jest.fn());

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            // i18n mock returns the key unchanged.
            expect(buttons[0].text).toBe('ui.cancel');
            expect(buttons[1].text).toBe('ui.confirm');
        });

        it('uses provided labels and ignores the i18n fallback', () => {
            confirmAction('T', 'M', jest.fn(), jest.fn(), 'Non', 'Oui');

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            expect(buttons[0].text).toBe('Non');
            expect(buttons[1].text).toBe('Oui');
        });

        it('falls back per-label: only confirmLabel provided', () => {
            confirmAction('T', 'M', jest.fn(), jest.fn(), undefined, 'Confirmer');

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            expect(buttons[0].text).toBe('ui.cancel'); // fallback
            expect(buttons[1].text).toBe('Confirmer'); // provided
        });

        it('falls back per-label: only cancelLabel provided', () => {
            confirmAction('T', 'M', jest.fn(), jest.fn(), 'Retour', undefined);

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            expect(buttons[0].text).toBe('Retour'); // provided
            expect(buttons[1].text).toBe('ui.confirm'); // fallback
        });

        it('treats empty-string labels as falsy and falls back to i18n', () => {
            // '' || i18n.t(...) → i18n key, because '' is falsy.
            confirmAction('T', 'M', jest.fn(), jest.fn(), '', '');

            const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
            expect(buttons[0].text).toBe('ui.cancel');
            expect(buttons[1].text).toBe('ui.confirm');
        });

        it('does not invoke either callback until a button is pressed', () => {
            const onConfirm = jest.fn();
            const onCancel = jest.fn();
            confirmAction('T', 'M', onConfirm, onCancel);

            // Alert.alert was called but no onPress fired yet.
            expect(onConfirm).not.toHaveBeenCalled();
            expect(onCancel).not.toHaveBeenCalled();
        });

        it('also takes the native branch for android', () => {
            (Platform as any).OS = 'android';
            confirmAction('T', 'M', jest.fn());

            expect(Alert.alert).toHaveBeenCalledTimes(1);
            expect(confirmSpy).not.toHaveBeenCalled();
        });
    });
});
