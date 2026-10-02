/**
 * Wave D (final-release) — Profile save truth, Settings export, /language Continue, task
 * checkbox state. These are .tsx with JSX, which ts-jest cannot load under the Expo tsconfig
 * (see authFunnelUi.test.ts), so the fixes are locked at source level; the logic they call
 * is tested behaviourally in src/context/__tests__/profileSync.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

describe('HYP-D1 / HYP-D2 — Profile', () => {
    const src = read('src/screens/ProfileScreen.tsx');
    const save = src.slice(src.indexOf('const handleSave = async'), src.indexOf('const handleLogout = async'));

    it('says "Succès" only when updateProfile reports the save went through', () => {
        expect(save).toMatch(/const result = await updateProfile\(\{/);
        const failure = save.indexOf('if (!result.ok)');
        expect(failure).toBeGreaterThan(-1);
        expect(save.slice(failure, save.indexOf('return;', failure))).toMatch(/showAlert\(t\('common\.error'\), t\('profile\.errorUpdate'\)\)/);
        expect(failure).toBeLessThan(save.indexOf("t('profile.successUpdate')"));
    });

    it('no longer updates the local profile before the server accepted the edit', () => {
        expect(save.indexOf('await setProfile(')).toBeGreaterThan(save.indexOf('if (!result.ok)'));
    });

    it('re-syncs the form only for the stored fields that changed', () => {
        const effect = src.slice(src.indexOf('const syncedProfileRef'), src.indexOf('}, [profile]);'));
        expect(effect).toMatch(/changedFormFields\(syncedProfileRef\.current, profile\)/);
        expect(effect).toMatch(/if \(changed\.includes\('firstName'\)\) setFirstName/);
        expect(effect).not.toMatch(/^\s*setFirstName\(profile\.firstName \|\| ''\);/m);
    });
});

describe('HYP-D4 / HYP-D3 — Settings', () => {
    const src = read('src/screens/SettingsScreen.tsx');

    it('the PDF export uses its own busy flag, never the screen-level skeleton flag', () => {
        const pdf = src.slice(src.indexOf("accessibilityLabel={t('common.privacyData.exportPDF')}"), src.indexOf("accessibilityLabel={t('common.privacyData.export')}"));
        expect(pdf).toMatch(/setPdfExporting\(true\)/);
        expect(pdf).toMatch(/setPdfExporting\(false\)/);
        expect(pdf).not.toMatch(/setLoading\(/);
    });

    it('does not offer Linking.openSettings on web, where it does not exist', () => {
        expect(src).toMatch(/Platform\.OS === 'web' \? undefined : \[[\s\S]*?Linking\.openSettings\(\)/);
    });
});

describe('HYP-D5 — /language Continue for a signed-in user', () => {
    const src = read('src/screens/LanguageSelectScreen.tsx');

    it('returns to the previous screen or Home instead of resetting to the signed-out AuthChoice', () => {
        const handler = src.slice(src.indexOf('const handleContinue'), src.indexOf('};', src.indexOf('const handleContinue')));
        expect(handler).toMatch(/route\.name !== 'LanguageSelect'/);
        expect(handler).toMatch(/navigation\.goBack\(\)/);
        expect(handler).toMatch(/routes: \[\{ name: 'HomeMain' \}\]/);
        expect(src).toMatch(/onPress=\{handleContinue\}/);
    });
});

describe('weekly task rows expose their checked state on web', () => {
    it.each([
        ['src/components/tasks/TaskCard.tsx', "'aria-checked': completed"],
        ['src/components/tasks/MyDaySection.tsx', "'aria-checked': item.completed"],
    ])('%s', (file, attr) => {
        expect(read(file)).toContain(`{...(Platform.OS === 'web' ? { ${attr} } : {})}`);
    });
});

describe('D-016 — Profile: safety feature above the destructive block, logout not red', () => {
    const src = read('src/screens/ProfileScreen.tsx');

    it('renders emergency contacts before the danger zone', () => {
        expect(src.indexOf('<EmergencyContactsSection />')).toBeGreaterThan(-1);
        expect(src.indexOf('<EmergencyContactsSection />')).toBeLessThan(src.indexOf("t('common.dangerZone')"));
    });

    it('draws logout in the neutral text colour', () => {
        const row = src.slice(src.indexOf('onPress={handleLogout}'), src.indexOf('onPress={requestResetProfile}'));
        expect(row).not.toMatch(/theme\.colors\.(error|red700)/);
    });
});

describe('D-017 / D-018 / D-019 / D-011 — deletion flow', () => {
    const hook = read('src/hooks/useAccountDeletion.tsx');
    const modal = read('src/components/profile/ReauthDeleteModal.tsx');

    it('confirmations name what is erased and where to export first', () => {
        expect(hook).toMatch(/const message = t\(key, copyParams\);/);
        expect(hook).toMatch(/confirmMessage\('profile\.deleteAccountMsg'\)/);
        expect(hook).toMatch(/confirmMessage\(user\?\.isGuest \? 'profile\.resetConfirmMsgGuest' : 'profile\.resetConfirmMsg'\)/);
        expect(hook).toMatch(/exportLabel: t\('common\.privacyData\.export'\)/);
    });

    it('a finished deletion is confirmed, distinct from a logout', () => {
        expect(hook.match(/showDeleted\(\);/g)?.length).toBe(2);
        expect(hook).toMatch(/showAlert\(t\('profile\.deleteDoneTitle'\), t\('profile\.deleteDoneMsg'\)\)/);
    });

    it('cancelling after the data was erased signs out instead of keeping the emptied account', () => {
        expect(hook).toMatch(/promptPassword\(isErasedButNotDeleted\(error\)\)/);
        const close = hook.slice(hook.indexOf('const closeReauth'), hook.indexOf('const showDeleted'));
        expect(close).toMatch(/if \(erasedPending\) leaveErasedAccount\(\)/);
        expect(hook).toMatch(/const leaveErasedAccount = \(\) => \{[\s\S]*?logout\(\)/);
    });

    it('the reauth modal: real placeholder, "Supprimer définitivement", forgot-password link', () => {
        expect(modal).not.toMatch(/placeholder="•+"/);
        expect(modal).toMatch(/placeholder=\{t\('passwordPlaceholder'\)\}/);
        expect(modal).toMatch(/\{t\('common\.deleteForever'\)\}/);
        expect(modal).toMatch(/onForgotPassword && \(/);
        expect(hook).toMatch(/sendPasswordResetEmail\(auth, email\)/);
    });
});

describe('D-011 — a pending deletion is never opened as a normal account', () => {
    const auth = read('src/context/AuthContext.tsx');

    it('the listener signs out and explains when the deletion cannot be finished now', () => {
        const listener = auth.slice(auth.indexOf('onAuthStateChanged(auth'), auth.indexOf('const register = async'));
        expect(listener).toMatch(/const resume = await resumePendingDeletion\(db, fbUser\);\s*if \(resume !== 'none'\) \{/);
        expect(listener).toMatch(/if \(resume !== 'deleted'\) await signOut\(auth\)/);
        expect(listener).toMatch(/profile\.deletePendingSignInMsg/);
    });

    it('login() leaves a pending deletion to the listener instead of installing the placeholder', () => {
        const login = auth.slice(auth.indexOf('const login = async'), auth.indexOf('const loginAsGuest = async'));
        // D-031: with `db`, so the request recorded on the server is found on a phone that
        // has no device marker.
        const check = login.indexOf('pendingDeletionAtSignIn(userCredential.user.uid, db)');
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(login.indexOf('installSessionProfile('));
    });
});

const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const locale = (lang: string, ns: string) => JSON.parse(read(`src/i18n/locales/${lang}/${ns}.json`));

describe('D-034 — a deletion finished at sign-in does not leave the deleted login in the form', () => {
    const auth = read('src/context/AuthContext.tsx');
    const screen = read('src/screens/LoginScreen.tsx');

    it("login() reports 'deletion-pending' instead of resolving like a normal sign-in", () => {
        const login = auth.slice(auth.indexOf('const login = async'), auth.indexOf('const loginAsGuest = async'));
        expect(login).toMatch(/pendingDeletionAtSignIn\([^)]*\)\)\) \{[\s\S]*?return 'deletion-pending' as const;/);
        expect(login).toMatch(/return 'signed-in' as const;/);
    });

    it('the Login form is emptied on that outcome, and no login is recorded in analytics', () => {
        const handler = screen.slice(screen.indexOf('const handleLogin = async'), screen.indexOf('const handleForgotPassword'));
        const branch = handler.slice(handler.indexOf("if (outcome === 'deletion-pending')"), handler.indexOf("analyticsService.logEvent('login'"));
        expect(branch).toMatch(/setEmail\(''\);/);
        expect(branch).toMatch(/setPassword\(''\);/);
        expect(branch).toMatch(/return;/);
    });

    it('the listener confirms "Compte supprimé" once the deletion is done', () => {
        expect(auth).toMatch(/if \(resume === 'deleted'\) \{\s*showAlert\(i18n\.t\('profile\.deleteDoneTitle'\), i18n\.t\('profile\.deleteDoneMsg'\)\);/);
    });
});

describe('D-020 — the erase shows that it is running', () => {
    const hook = read('src/hooks/useAccountDeletion.tsx');
    const modal = read('src/components/profile/ReauthDeleteModal.tsx');

    it('a blocking overlay is rendered with the reauth modal, so every caller gets it', () => {
        expect(hook).toMatch(/<DeletionProgressModal visible=\{busy && !reauthVisible\} \/>/);
        for (const caller of ['ProfileScreen', 'SettingsScreen', 'HealthDataConsentScreen']) {
            expect(read(`src/screens/${caller}.tsx`)).toMatch(/\{reauthModal\}/);
        }
    });

    it('the overlay is a modal that cannot be dismissed, with a spinner and a localized, announced label', () => {
        const overlay = modal.slice(modal.indexOf('export const DeletionProgressModal'), modal.indexOf('const styles = StyleSheet.create'));
        expect(overlay).toMatch(/<Modal visible=\{visible\} transparent animationType="none" onRequestClose=\{\(\) => \{\}\}>/);
        expect(overlay).toMatch(/<ActivityIndicator/);
        expect(overlay).toMatch(/accessibilityLabel=\{t\('profile\.deleteInProgress'\)\}/);
        expect(overlay).toMatch(/accessibilityState=\{\{ busy: true \}\}/);
        expect(overlay).toMatch(/\{t\('profile\.deleteInProgress'\)\}<\/Text>/);
    });

    it('the password prompt says so too while it erases', () => {
        expect(modal).toMatch(/\{loading && \(\s*<Text[^>]*>\s*\{t\('profile\.deleteInProgress'\)\}/);
    });

    it.each(LOCALES)('%s has the label', (lang) => {
        expect(locale(lang, 'profile').deleteInProgress).toEqual(expect.stringMatching(/\S/));
    });
});

describe('D-018 — a forgotten password does not block the deletion on any platform', () => {
    const hook = read('src/hooks/useAccountDeletion.tsx');
    const modal = read('src/components/profile/ReauthDeleteModal.tsx');

    it('the iOS prompt offers "Mot de passe oublié ?" as a third button', () => {
        const prompt = hook.slice(hook.indexOf('Alert.prompt('), hook.indexOf("'secure-text'"));
        expect(prompt).toMatch(/text: t\('forgotPassword'\),\s*onPress: \(\) => \{\s*sendPasswordReset\(\);/);
        // Her data is already erased: closing the prompt must not leave her in the empty account.
        expect(prompt).toMatch(/sendPasswordReset\(\);\s*if \(afterErase\) leaveErasedAccount\(\);/);
    });

    it('the Android / web prompt has a show-password toggle, like Login', () => {
        expect(modal).toMatch(/secureTextEntry=\{!showPassword\}/);
        expect(modal).toMatch(/accessibilityLabel=\{showPassword \? t\('hidePassword'\) : t\('showPassword'\)\}/);
    });
});

describe('D-030 / D-035 — declining the health-data consent', () => {
    const screen = read('src/screens/HealthDataConsentScreen.tsx');
    const hook = read('src/hooks/useAccountDeletion.tsx');
    const decline = screen.slice(screen.indexOf("t('onboarding.healthConsent.declineTitle')"));

    it('offers the export on the sheet itself, through the same service and warning as Settings', () => {
        expect(screen).toMatch(/import \{ exportUserData \} from '\.\.\/services\/dataExportService';/);
        expect(screen).toMatch(/t\('export\.warningTitle'\),\s*t\('export\.warningMessage'\),/);
        expect(screen).toMatch(/await exportUserData\(user, profile, t\);/);
        expect(decline).toMatch(/testID="health_consent_export"/);
    });

    it('lists export, then logout, then the erase — the erase no longer the outlined, dominant button', () => {
        const order = ['health_consent_export', 'health_consent_logout', 'health_consent_erase'].map((id) => decline.indexOf(`testID="${id}"`));
        expect(order.every((i) => i > -1)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        const erase = decline.slice(decline.lastIndexOf('<Button', order[2]), order[2]);
        expect(erase).toMatch(/variant="ghost"/);
        expect(erase).toMatch(/styles\.eraseText/);
        const exportButton = decline.slice(decline.lastIndexOf('<Button', order[0]), order[0]);
        expect(exportButton).toMatch(/variant="outline"/);
    });

    it('the confirmations point at this screen, not at an unreachable Settings', () => {
        expect(screen).toMatch(/useAccountDeletion\(\{ exportOnThisScreen: true \}\)/);
        expect(hook).toMatch(/if \(!opts\?\.exportOnThisScreen\) return message;/);
        expect(hook).toMatch(/message\.slice\(0, message\.lastIndexOf\('\\n\\n'\)\)\}\\n\\n\$\{t\('profile\.exportFirstHere', copyParams\)\}/);
    });

    // The hook swaps the LAST paragraph, so the export advice must be exactly that one.
    it.each(LOCALES)('%s: the export advice is the last paragraph of each confirmation', (lang) => {
        const profile = locale(lang, 'profile');
        for (const key of ['deleteAccountMsg', 'resetConfirmMsgGuest', 'resetConfirmMsg']) {
            const paragraphs: string[] = profile[key].split('\n\n');
            expect(paragraphs.length).toBeGreaterThan(1);
            expect(paragraphs[paragraphs.length - 1]).toContain('{{settings}}');
            expect(paragraphs[paragraphs.length - 1]).toContain('{{exportLabel}}');
            for (const p of paragraphs.slice(0, -1)) expect(p).not.toContain('{{settings}}');
        }
        expect(profile.exportFirstHere).toContain('{{exportLabel}}');
        expect(profile.exportFirstHere).not.toContain('{{settings}}');
    });

    it('says under "Se déconnecter" that signing out erases nothing, and how to erase', () => {
        const note = decline.indexOf("t('onboarding.healthConsent.logoutNote', { deleteLabel: eraseLabel })");
        expect(note).toBeGreaterThan(decline.indexOf('testID="health_consent_logout"'));
        expect(note).toBeLessThan(decline.indexOf('testID="health_consent_erase"'));
    });

    it.each(LOCALES)('%s has the logout note, naming the delete action', (lang) => {
        expect(locale(lang, 'onboarding').healthConsent.logoutNote).toContain('{{deleteLabel}}');
    });
});

describe('D-023 — the legal documents are tabs', () => {
    const screen = read('src/screens/PrivacyPolicyScreen.tsx');

    it('a tablist of tabs, each exposing whether it is the selected one', () => {
        expect(screen).toMatch(/style=\{styles\.tabContainer\} accessibilityRole="tablist"/);
        expect(screen).toMatch(/accessibilityRole="tab"\s*accessibilityState=\{\{ selected: activeTab === tab \}\}/);
    });

    it('says so on web too, where react-native-web drops accessibilityState', () => {
        // aria-selected is the state of a role=tab (aria-pressed belongs to toggle buttons).
        expect(screen).toMatch(/import \{[^}]*\bPlatform\b[^}]*\} from 'react-native';/);
        expect(screen).toMatch(/accessibilityState=\{\{ selected: activeTab === tab \}\}[^>]*?\{\.\.\.\(Platform\.OS === 'web' \? \{ 'aria-selected': activeTab === tab \} : \{\}\)\}/);
    });
});

describe('D-022 / D-028 / D-033 — small leaks', () => {
    it('the French profile says DDR, not the English "LMP"', () => {
        const fr = locale('fr', 'profile');
        expect(JSON.stringify(fr)).not.toContain('LMP');
        expect(fr.lmpLabel).toContain('DDR');
        expect(fr.dpaSubtext).toContain('DDR');
    });

    it('no reminder that is not an injection carries a syringe', () => {
        expect(read('src/data/REMINDERS_V2.json')).not.toContain('💉');
    });

    it('Home is the root URL on web, not /HomeMain', () => {
        expect(read('App.tsx')).toMatch(/Home: \{\s*screens: \{[^}]*HomeMain: '',/);
    });
});
