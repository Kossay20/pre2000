/**
 * Tests for the cross-platform `showAlert` utility.
 *
 * The module branches on `Platform.OS`:
 *   - 'web'  → uses window.alert (+ window.confirm for multi-button dialogs)
 *   - native → delegates straight to React Native's Alert.alert
 *
 * We mock `react-native` so we can flip Platform.OS per test and spy on
 * Alert.alert, and we stub window.alert / window.confirm to assert the web path.
 */

// Mutable Platform mock so individual tests can switch OS.
const mockPlatform = { OS: 'web' as 'web' | 'ios' | 'android' };
const mockAlertAlert = jest.fn();

jest.mock('react-native', () => ({
    __esModule: true,
    Platform: mockPlatform,
    Alert: { alert: mockAlertAlert },
}));

import { showAlert } from '../alert';

describe('showAlert', () => {
    let alertSpy: jest.SpyInstance;
    let confirmSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlatform.OS = 'web';

        // jsdom-free env: window may not exist in node testEnvironment, so guarantee it.
        const g = global as unknown as {
            window?: { alert?: (m?: string) => void; confirm?: (m?: string) => boolean };
        };
        g.window = g.window || {};
        if (typeof g.window.alert !== 'function') {
            g.window.alert = () => undefined;
        }
        if (typeof g.window.confirm !== 'function') {
            g.window.confirm = () => true;
        }
        alertSpy = jest
            .spyOn(g.window, 'alert')
            .mockImplementation(() => undefined);
        confirmSpy = jest
            .spyOn(g.window, 'confirm')
            .mockImplementation(() => true);
    });

    afterEach(() => {
        alertSpy.mockRestore();
        confirmSpy.mockRestore();
    });

    // ---------------------------------------------------------------------------
    // WEB PLATFORM
    // ---------------------------------------------------------------------------
    describe('on web', () => {
        beforeEach(() => {
            mockPlatform.OS = 'web';
        });

        it('calls window.alert combining title and message with a blank line', () => {
            showAlert('Titre', 'Mon message');

            expect(alertSpy).toHaveBeenCalledTimes(1);
            expect(alertSpy).toHaveBeenCalledWith('Titre\n\nMon message');
            // Never touches the native Alert on web.
            expect(mockAlertAlert).not.toHaveBeenCalled();
        });

        it('does NOT call window.confirm when no buttons are provided', () => {
            showAlert('Titre', 'Message');

            expect(alertSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('does NOT call window.confirm when buttons array is empty', () => {
            showAlert('Titre', 'Message', []);

            expect(alertSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('with a single button having an onPress, fires onPress without confirm', () => {
            const onPress = jest.fn();
            showAlert('Titre', 'Message', [{ text: 'OK', onPress }]);

            expect(alertSpy).toHaveBeenCalledWith('Titre\n\nMessage');
            expect(confirmSpy).not.toHaveBeenCalled();
            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('with a single button WITHOUT onPress, does nothing extra', () => {
            // confirmButton is found but confirmButton.onPress is undefined → no-op.
            expect(() =>
                showAlert('Titre', 'Message', [{ text: 'OK' }]),
            ).not.toThrow();

            expect(alertSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('with a single button whose style is "cancel", does not fire onPress (no non-cancel button)', () => {
            const onPress = jest.fn();
            showAlert('Titre', 'Message', [
                { text: 'Annuler', style: 'cancel', onPress },
            ]);

            // find() returns undefined → confirmButton falsy → branch skipped.
            expect(onPress).not.toHaveBeenCalled();
            expect(confirmSpy).not.toHaveBeenCalled();
            expect(alertSpy).toHaveBeenCalledTimes(1);
        });

        describe('multi-button confirmation dialogs', () => {
            it('uses window.confirm and fires the positive onPress when confirmed (true)', () => {
                confirmSpy.mockReturnValue(true);
                const onConfirm = jest.fn();
                const onCancel = jest.fn();

                showAlert('Email déjà utilisé', 'Voulez-vous vous connecter ?', [
                    { text: 'Annuler', style: 'cancel', onPress: onCancel },
                    { text: 'Connexion', onPress: onConfirm },
                ]);

                expect(confirmSpy).toHaveBeenCalledTimes(1);
                expect(confirmSpy).toHaveBeenCalledWith(
                    'Email déjà utilisé\n\nVoulez-vous vous connecter ?',
                );
                expect(onConfirm).toHaveBeenCalledTimes(1);
                // The cancel button's onPress is never invoked by this implementation.
                expect(onCancel).not.toHaveBeenCalled();
            });

            it('does NOT fire the positive onPress when confirm is dismissed (false)', () => {
                confirmSpy.mockReturnValue(false);
                const onConfirm = jest.fn();

                showAlert('Titre', 'Message', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'OK', onPress: onConfirm },
                ]);

                expect(confirmSpy).toHaveBeenCalledTimes(1);
                expect(onConfirm).not.toHaveBeenCalled();
            });

            it('selects the FIRST non-cancel button as the confirm action', () => {
                confirmSpy.mockReturnValue(true);
                const first = jest.fn();
                const second = jest.fn();

                showAlert('Titre', 'Message', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Premier', onPress: first },
                    { text: 'Second', onPress: second },
                ]);

                expect(first).toHaveBeenCalledTimes(1);
                expect(second).not.toHaveBeenCalled();
            });

            it('treats a button with no style as the positive (non-cancel) action even if listed first', () => {
                confirmSpy.mockReturnValue(true);
                const positive = jest.fn();

                showAlert('Titre', 'Message', [
                    { text: 'Oui', onPress: positive },
                    { text: 'Non', style: 'cancel' },
                ]);

                // find() returns the first element whose style !== 'cancel' → the "Oui" button.
                expect(positive).toHaveBeenCalledTimes(1);
                expect(confirmSpy).toHaveBeenCalledTimes(1);
            });

            it('treats style="destructive" as a non-cancel (positive) action', () => {
                confirmSpy.mockReturnValue(true);
                const onDestroy = jest.fn();

                showAlert('Supprimer', 'Sûr ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Supprimer', style: 'destructive', onPress: onDestroy },
                ]);

                expect(onDestroy).toHaveBeenCalledTimes(1);
            });

            it('shows the confirm even when the positive button has no onPress', () => {
                // Previously the implementation required `confirmButton.onPress` to
                // exist before showing a confirm, so a Cancel/OK pair with no handler
                // degraded to a plain alert — the user lost the choice entirely. The
                // dialog is now driven by the button set, not by handler presence; a
                // handler-less button simply does nothing when chosen.
                showAlert('Titre', 'Message', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'OK' },
                ]);

                expect(confirmSpy).toHaveBeenCalledTimes(1);
                // Exactly one dialog: no alert stacked in front of the confirm.
                expect(alertSpy).not.toHaveBeenCalled();
            });

            it('shows exactly one dialog — no alert stacked before the confirm', () => {
                // REGRESSION GUARD: the old web path always ran window.alert first and
                // then window.confirm with the IDENTICAL text, so the user had to
                // dismiss the same message twice before the choice appeared.
                confirmSpy.mockReturnValue(true);
                showAlert('Titre', 'Message', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'OK', onPress: jest.fn() },
                ]);

                expect(alertSpy).not.toHaveBeenCalled();
                expect(confirmSpy).toHaveBeenCalledTimes(1);
            });

            it('fires the cancel button onPress when the confirm is dismissed', () => {
                // Native Alert.alert invokes the cancel handler; the web path never
                // did, so cancel-side cleanup silently did nothing on web.
                confirmSpy.mockReturnValue(false);
                const onCancel = jest.fn();
                const onConfirm = jest.fn();

                showAlert('Titre', 'Message', [
                    { text: 'Annuler', style: 'cancel', onPress: onCancel },
                    { text: 'OK', onPress: onConfirm },
                ]);

                expect(onCancel).toHaveBeenCalledTimes(1);
                expect(onConfirm).not.toHaveBeenCalled();
            });

            it('with two buttons where ALL are cancel, fires nothing extra', () => {
                const a = jest.fn();
                const b = jest.fn();
                showAlert('Titre', 'Message', [
                    { text: 'A', style: 'cancel', onPress: a },
                    { text: 'B', style: 'cancel', onPress: b },
                ]);

                // No non-cancel button found.
                expect(a).not.toHaveBeenCalled();
                expect(b).not.toHaveBeenCalled();
                expect(confirmSpy).not.toHaveBeenCalled();
            });
        });

        it('handles empty title and message strings', () => {
            showAlert('', '');
            expect(alertSpy).toHaveBeenCalledWith('\n\n');
        });

        it('preserves multiline messages and special characters', () => {
            showAlert(' Titre', 'ligne1\nligne2 — éàü 🤰');
            expect(alertSpy).toHaveBeenCalledWith(' Titre\n\nligne1\nligne2 — éàü 🤰');
        });
    });

    // ---------------------------------------------------------------------------
    // NATIVE PLATFORM (ios / android)
    // ---------------------------------------------------------------------------
    describe('on native', () => {
        it('delegates to Alert.alert on iOS with title, message and buttons', () => {
            mockPlatform.OS = 'ios';
            const buttons = [{ text: 'OK', onPress: jest.fn() }];

            showAlert('Titre', 'Message', buttons);

            expect(mockAlertAlert).toHaveBeenCalledTimes(1);
            expect(mockAlertAlert).toHaveBeenCalledWith('Titre', 'Message', buttons);
            // Web path must not run.
            expect(alertSpy).not.toHaveBeenCalled();
            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('delegates to Alert.alert on Android', () => {
            mockPlatform.OS = 'android';

            showAlert('Titre', 'Message');

            expect(mockAlertAlert).toHaveBeenCalledTimes(1);
            expect(mockAlertAlert).toHaveBeenCalledWith('Titre', 'Message', undefined);
        });

        it('passes buttons through untouched (no confirm/onPress execution by the wrapper)', () => {
            mockPlatform.OS = 'ios';
            const onPress = jest.fn();
            // `as const` on style: showAlert's buttons are now typed (AlertButton[])
            // instead of `any[]`, so a widened `string` no longer satisfies the union.
            const buttons = [
                { text: 'Annuler', style: 'cancel' as const },
                { text: 'OK', onPress },
            ];

            showAlert('Titre', 'Message', buttons);

            // Native path forwards buttons but does NOT invoke onPress itself.
            expect(onPress).not.toHaveBeenCalled();
            expect(mockAlertAlert).toHaveBeenCalledWith('Titre', 'Message', buttons);
        });

        it('forwards undefined buttons when none provided', () => {
            mockPlatform.OS = 'android';
            showAlert('A', 'B');
            const callArgs = mockAlertAlert.mock.calls[0];
            expect(callArgs[2]).toBeUndefined();
        });
    });
});
