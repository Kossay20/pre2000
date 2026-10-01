import {
    __resetForTests,
    HospitalBagItem,
    addCustomItem,
    bagItemLabel,
    computeProgress,
    loadState,
    removeCustomItem,
    toggleItem,
} from '../hospitalBagService';

// The service syncs signed-in history to Firestore; these tests cover the device side
// (no uid), and trackerHistorySync.test.ts the server side.
jest.mock('../../config/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => require('../../testing/fakeFirestore').fakeFirestoreModule);

jest.mock('@react-native-async-storage/async-storage', () => {
    const store: Record<string, string> = {};
    return {
        getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
        setItem: jest.fn((k: string, v: string) => {
            store[k] = v;
            return Promise.resolve();
        }),
        removeItem: jest.fn((k: string) => {
            delete store[k];
            return Promise.resolve();
        }),
    };
});

describe('hospitalBagService', () => {
    beforeEach(async () => {
        await __resetForTests();
    });

    it('seeds defaults on first load', async () => {
        const state = await loadState();
        expect(state.items.length).toBeGreaterThan(10);
        expect(state.checked).toEqual({});
    });

    it('toggles an item', async () => {
        const initial = await loadState();
        const id = initial.items[0].id;
        const after = await toggleItem(id);
        expect(after.checked[id]).toBe(true);
        const after2 = await toggleItem(id);
        expect(after2.checked[id]).toBe(false);
    });

    it('addCustomItem appends a custom item', async () => {
        const before = await loadState();
        const after = await addCustomItem('mom', 'Lunettes de lecture');
        expect(after.items.length).toBe(before.items.length + 1);
        const added = after.items[after.items.length - 1];
        expect(added.custom).toBe(true);
        expect(added.section).toBe('mom');
    });

    it('addCustomItem rejects empty labels', async () => {
        const before = await loadState();
        const after = await addCustomItem('mom', '   ');
        expect(after.items.length).toBe(before.items.length);
    });

    it('removeCustomItem deletes only custom items', async () => {
        const initial = await loadState();
        const defaultId = initial.items[0].id;
        const afterRemoveDefault = await removeCustomItem(defaultId);
        expect(afterRemoveDefault.items.find((i) => i.id === defaultId)).toBeDefined();

        const afterAdd = await addCustomItem('papers', 'Test custom');
        const customId = afterAdd.items[afterAdd.items.length - 1].id;
        const afterRemoveCustom = await removeCustomItem(customId);
        expect(afterRemoveCustom.items.find((i) => i.id === customId)).toBeUndefined();
    });

    it('computeProgress reports done/total', async () => {
        const initial = await loadState();
        const id = initial.items[0].id;
        await toggleItem(id);
        const after = await loadState();
        const { done, total } = computeProgress(after);
        expect(done).toBe(1);
        expect(total).toBe(after.items.length);
    });
});

// B-016: a user in France was shown Tunisian papers ("Carte d'identité (CIN)", "Carte CNAM").
describe('bagItemLabel — administrative papers follow the profile country', () => {
    const defaults = require('../../data/hospital_bag_default.json') as HospitalBagItem[];
    const item = (id: string) => defaults.find((d) => d.id === id)!;
    const LANGS = ['fr', 'en', 'ar', 'tn'];

    it('France: carte Vitale and mutuelle, no CIN, no CNAM', () => {
        expect(bagItemLabel(item('mom-insurance-card'), 'fr', 'france')).toBe('Carte Vitale et carte de mutuelle');
        expect(bagItemLabel(item('mom-id-card'), 'fr', 'france')).toBe("Pièce d'identité");
        for (const lang of LANGS) {
            for (const id of ['mom-id-card', 'mom-insurance-card']) {
                expect(bagItemLabel(item(id), lang, 'france')).not.toMatch(/CIN|CNAM|الكنام/);
            }
        }
    });

    it('Tunisia: CIN and CNAM', () => {
        expect(bagItemLabel(item('mom-id-card'), 'fr', 'tunisia')).toBe("Carte d'identité (CIN)");
        expect(bagItemLabel(item('mom-insurance-card'), 'fr', 'tunisia')).toMatch(/CNAM/);
        expect(bagItemLabel(item('mom-insurance-card'), 'tn', 'tunisia')).toBe('كارط الكنام');
        // Older profiles: ISO code or the French name.
        expect(bagItemLabel(item('mom-id-card'), 'fr', 'TN')).toBe("Carte d'identité (CIN)");
        expect(bagItemLabel(item('mom-id-card'), 'fr', 'Tunisie')).toBe("Carte d'identité (CIN)");
    });

    it('any other country, or none: neutral wording, in every language', () => {
        for (const country of ['belgium', 'canada', 'other', '', undefined, null]) {
            expect(bagItemLabel(item('mom-id-card'), 'fr', country)).toBe("Pièce d'identité");
            expect(bagItemLabel(item('mom-insurance-card'), 'fr', country)).toBe("Carte d'assurance maladie");
            expect(bagItemLabel(item('mom-insurance-card'), 'en', country)).toBe('Health insurance card');
            for (const lang of LANGS) {
                expect(bagItemLabel(item('mom-insurance-card'), lang, country)).not.toMatch(/CIN|CNAM|Vitale|الكنام|فيتال/);
            }
        }
    });

    it('every country wording exists in the four languages', () => {
        for (const d of defaults) {
            for (const [country, labels] of Object.entries(d.labels_by_country ?? {})) {
                for (const key of ['label_fr', 'label_en', 'label_ar', 'label_tn'] as const) {
                    expect({ id: d.id, country, key, ok: !!labels[key] }).toEqual({ id: d.id, country, key, ok: true });
                }
            }
        }
    });

    it('a list seeded before the change (CIN stored on the device) is read from the shipped defaults', () => {
        const stored: HospitalBagItem = { ...item('mom-id-card'), label_fr: "Carte d'identité (CIN)", labels_by_country: undefined, custom: false };
        expect(bagItemLabel(stored, 'fr', 'france')).toBe("Pièce d'identité");
    });

    it('her own items keep her wording whatever the country', () => {
        const custom: HospitalBagItem = { id: 'custom-1', section: 'papers', label_fr: 'Livret de famille', label_en: 'Livret de famille', label_ar: 'Livret de famille', label_tn: 'Livret de famille', custom: true };
        expect(bagItemLabel(custom, 'ar', 'france')).toBe('Livret de famille');
    });

    it('the checklist screen asks for the label with the profile country', () => {
        const fs = require('fs');
        const path = require('path');
        const screen = fs.readFileSync(path.join(__dirname, '../../screens/HospitalBagChecklistScreen.tsx'), 'utf8');
        expect(screen).toMatch(/bagItemLabel\(item, i18n\.language, user\?\.country\)/);
        expect(screen).not.toMatch(/item\.label_fr/);
    });
});
