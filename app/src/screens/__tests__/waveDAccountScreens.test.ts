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
        expect(hook).toMatch(/t\('profile\.deleteAccountMsg', copyParams\)/);
        expect(hook).toMatch(/'profile\.resetConfirmMsgGuest' : 'profile\.resetConfirmMsg', copyParams/);
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
        const check = login.indexOf('hasPendingDeletion(userCredential.user.uid)');
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(login.indexOf('installSessionProfile('));
    });
});
