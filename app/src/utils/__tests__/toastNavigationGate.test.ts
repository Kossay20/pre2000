/**
 * A-013 (product side): the "Langue mise à jour" toast from the language screen followed
 * her over the sign-up and onboarding headers. The decision lives in a pure gate (the repo
 * ships no React renderer); the wiring into ToastProvider and the NavigationContainer is
 * locked at source level below.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createToastNavigationGate } from '../toastNavigationGate';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

describe('toastNavigationGate', () => {
    it('a toast hides when she leaves the screen it was shown on', () => {
        const gate = createToastNavigationGate();
        gate.routeFocused('Language-1');
        gate.shown(false);
        expect(gate.routeFocused('AuthChoice-2')).toBe(true);
    });

    it('staying on the same route (a setParams, a re-render) keeps it', () => {
        const gate = createToastNavigationGate();
        gate.routeFocused('TasksTab-1');
        gate.shown(false);
        expect(gate.routeFocused('TasksTab-1')).toBe(false);
        expect(gate.routeFocused(undefined)).toBe(false);
    });

    it('a persistent toast survives the navigation it accompanies', () => {
        const gate = createToastNavigationGate();
        gate.routeFocused('AddAppointment-3');
        gate.shown(true);
        expect(gate.routeFocused('CalendarMain-2')).toBe(false);
    });

    it('nothing to hide once the toast is gone, or before any toast', () => {
        const gate = createToastNavigationGate();
        expect(gate.routeFocused('A')).toBe(false);
        expect(gate.routeFocused('B')).toBe(false);
        gate.shown(false);
        gate.hidden();
        expect(gate.routeFocused('C')).toBe(false);
    });

    it('the first focused route is a reference, not a navigation', () => {
        const gate = createToastNavigationGate();
        gate.shown(false);
        expect(gate.routeFocused('Language-1')).toBe(false);
        expect(gate.routeFocused('AuthChoice-2')).toBe(true);
    });

    it('a new toast replaces the persistence of the previous one', () => {
        const gate = createToastNavigationGate();
        gate.routeFocused('A');
        gate.shown(true);
        gate.shown(false);
        expect(gate.routeFocused('B')).toBe(true);
    });
});

describe('wiring', () => {
    it('ToastProvider feeds the gate and hides on its verdict', () => {
        const src = read('src/context/ToastContext.tsx');
        expect(src).toMatch(/gate\.shown\(!!options\?\.persistent\)/);
        expect(src).toMatch(/const hideToast = \(\) => \{\s*gate\.hidden\(\);/);
        expect(src).toMatch(/if \(!gate\.routeFocused\(routeKey\)\) return;/);
    });

    it('the NavigationContainer reports the focused route on ready and on every change', () => {
        const app = read('App.tsx');
        expect(app).toMatch(/onReady=\{\(\) => onRouteFocused\(navigationRef\.getCurrentRoute\(\)\?\.key\)\}/);
        const onStateChange = app.slice(app.indexOf('onStateChange={'), app.indexOf('ref={navigationRef}'));
        expect(onStateChange).toMatch(/onRouteFocused\(navigationRef\.getCurrentRoute\(\)\?\.key\)/);
    });

    it.each([
        ['src/screens/AddAppointmentScreen.tsx', 2],
        ['src/screens/RegisterScreen.tsx', 1],
        ['src/screens/CompletedTasksScreen.tsx', 1],
    ])('%s: a confirmation followed by the app navigating away is persistent', (file, count) => {
        expect(read(file).match(/\{ persistent: true \}/g)).toHaveLength(count);
    });

    it('the language confirmation is transient (A-013)', () => {
        const src = read('src/screens/LanguageSelectScreen.tsx');
        expect(src).toMatch(/showToast\(i18n\.getFixedT\(languageCode\)\('common\.languageUpdated'\), 'success'\);/);
    });
});
