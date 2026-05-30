/**
 * Unit tests for useCurrentWeek (re-exported from ../../hooks/useCurrentWeek).
 *
 * useCurrentWeek is a React hook. The repo's Jest config uses `testEnvironment: 'node'`
 * and ships NO React renderer (`@testing-library/react`, `react-test-renderer`) — so we
 * drive the hook deterministically by mocking React's primitives (useState / useEffect /
 * useCallback). This lets us:
 *   - read the value the hook returns on a given render,
 *   - re-render after a state setter fires (simulating React's re-render),
 *   - manually invoke the captured useEffect (and its cleanup) so we can exercise the
 *     async fetch branches.
 *
 * Branches covered:
 *   - targetWeek default (1) / from pregnancyInfo.week / explicit weekNumber arg
 *   - currentDay default (1) / from pregnancyInfo.dayInWeek
 *   - effect early-return when contextLoading && !weekNumber
 *   - effect early-return when !weekNumber && !pregnancyInfo (sets loading false)
 *   - fetch success → weekData set
 *   - fetch doc missing → error 'common.errors.weekDataNotFound'
 *   - fetch throws generic → error 'common.errors.loadingFailed' + log.warn
 *   - fetch throws AbortError / code 'unavailable' → error set but NO log.warn
 *   - isMounted race protection (cleanup before resolve → no state writes)
 *   - returned loading = loading || (contextLoading && !weekNumber)
 *   - isInvalid passthrough
 *   - refetch() clears error, sets loading, bumps nonce
 */

// ---------------------------------------------------------------------------
// React mock: a minimal, controllable hook implementation.
// ---------------------------------------------------------------------------
let hookStates: any[];
let stateCursor: number;
let renderFn: (() => void) | null = null;
const capturedEffects: Array<{ fn: () => void | (() => void); deps: any[] }> = [];

jest.mock('react', () => ({
    useState: (initial: any) => {
        const idx = stateCursor++;
        if (hookStates.length <= idx) {
            hookStates[idx] = typeof initial === 'function' ? initial() : initial;
        }
        const setter = (next: any) => {
            const prev = hookStates[idx];
            hookStates[idx] = typeof next === 'function' ? next(prev) : next;
            // simulate React scheduling a re-render
            if (renderFn) renderFn();
        };
        return [hookStates[idx], setter];
    },
    // useCallback: just return the callback (deps irrelevant for our purposes).
    useCallback: (cb: any) => cb,
    // useEffect: capture the latest effect + deps; we run it manually in tests.
    useEffect: (fn: any, deps: any[]) => {
        capturedEffects.push({ fn, deps });
    },
}));

// ---------------------------------------------------------------------------
// Firestore + firebase config mocks.
// ---------------------------------------------------------------------------
const mockDoc = jest.fn();
const mockGetDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
    doc: (...args: any[]) => mockDoc(...args),
    getDoc: (...args: any[]) => mockGetDoc(...args),
}));

jest.mock('../../config/firebase', () => ({ db: { __db: true } }));

// ---------------------------------------------------------------------------
// Logger mock — capture warns to assert the "console spam suppression" branch.
// ---------------------------------------------------------------------------
const mockWarn = jest.fn();
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: mockWarn,
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));

// ---------------------------------------------------------------------------
// PregnancyContext mock — usePregnancy returns whatever we set per test.
// ---------------------------------------------------------------------------
const mockUsePregnancy = jest.fn();
jest.mock('../../context/PregnancyContext', () => ({
    usePregnancy: () => mockUsePregnancy(),
}));

import { useCurrentWeek } from '../useCurrentWeek';

// ---------------------------------------------------------------------------
// Test driver helpers.
// ---------------------------------------------------------------------------
type RenderResult = ReturnType<typeof useCurrentWeek>;

/**
 * Renders the hook once. Sets up a renderFn so state setters re-run the hook and
 * the returned object always reflects the latest committed state.
 */
function renderHook(weekNumber?: number): {
    result: { current: RenderResult };
    effects: typeof capturedEffects;
    rerender: () => void;
} {
    hookStates = [];
    const result = { current: undefined as unknown as RenderResult };

    const doRender = () => {
        stateCursor = 0;
        capturedEffects.length = 0;
        result.current = useCurrentWeek(weekNumber);
    };
    renderFn = doRender;
    doRender();

    return { result, effects: capturedEffects, rerender: doRender };
}

/** Runs the most recently captured effect and returns its cleanup (if any). */
async function runEffect(effects: typeof capturedEffects): Promise<void | (() => void)> {
    const eff = effects[effects.length - 1];
    const cleanup = eff.fn();
    // Let the async fetchWeekData microtasks flush.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    return cleanup as void | (() => void);
}

const makeWeekDoc = (data: any) => ({
    exists: () => data != null,
    data: () => data,
});

beforeEach(() => {
    jest.clearAllMocks();
    renderFn = null;
    hookStates = [];
    stateCursor = 0;
    capturedEffects.length = 0;
    // Default: a normal pregnant user, context done loading.
    mockUsePregnancy.mockReturnValue({
        pregnancyInfo: { week: 12, dayInWeek: 3, isInvalid: false, mode: 'pregnant' },
        loading: false,
    });
    mockDoc.mockReturnValue({ __ref: true });
    mockGetDoc.mockResolvedValue(makeWeekDoc({ week_number: 12, title_fr: 'Semaine 12' }));
});

describe('useCurrentWeek — initial returned shape', () => {
    it('derives currentWeekNumber from pregnancyInfo.week when no arg given', () => {
        const { result } = renderHook();
        expect(result.current.currentWeekNumber).toBe(12);
    });

    it('derives currentDay from pregnancyInfo.dayInWeek', () => {
        const { result } = renderHook();
        expect(result.current.currentDay).toBe(3);
    });

    it('prefers the explicit weekNumber argument over pregnancyInfo.week', () => {
        const { result } = renderHook(25);
        expect(result.current.currentWeekNumber).toBe(25);
    });

    it('defaults currentWeekNumber to 1 when no arg and pregnancyInfo is null', () => {
        mockUsePregnancy.mockReturnValue({ pregnancyInfo: null, loading: false });
        const { result } = renderHook();
        expect(result.current.currentWeekNumber).toBe(1);
    });

    it('defaults currentDay to 1 when pregnancyInfo is null', () => {
        mockUsePregnancy.mockReturnValue({ pregnancyInfo: null, loading: false });
        const { result } = renderHook();
        expect(result.current.currentDay).toBe(1);
    });

    it('defaults currentWeekNumber to 1 when pregnancyInfo.week is 0 (falsy)', () => {
        // week 0 (TTC mode) is falsy → `weekNumber || pregnancyInfo?.week || 1` → 1
        mockUsePregnancy.mockReturnValue({
            pregnancyInfo: { week: 0, dayInWeek: 0, mode: 'ttc' },
            loading: false,
        });
        const { result } = renderHook();
        expect(result.current.currentWeekNumber).toBe(1);
    });

    it('defaults currentDay to 1 when dayInWeek is 0 (falsy)', () => {
        mockUsePregnancy.mockReturnValue({
            pregnancyInfo: { week: 10, dayInWeek: 0, mode: 'pregnant' },
            loading: false,
        });
        const { result } = renderHook();
        expect(result.current.currentDay).toBe(1);
    });

    it('initial loading is true before the effect resolves', () => {
        const { result } = renderHook();
        expect(result.current.loading).toBe(true);
    });

    it('initial error is null', () => {
        const { result } = renderHook();
        expect(result.current.error).toBeNull();
    });

    it('initial weekData is null', () => {
        const { result } = renderHook();
        expect(result.current.weekData).toBeNull();
    });

    it('exposes a refetch function', () => {
        const { result } = renderHook();
        expect(typeof result.current.refetch).toBe('function');
    });
});

describe('useCurrentWeek — isInvalid passthrough', () => {
    it('returns isInvalid=false by default', () => {
        const { result } = renderHook();
        expect(result.current.isInvalid).toBe(false);
    });

    it('passes through pregnancyInfo.isInvalid=true', () => {
        mockUsePregnancy.mockReturnValue({
            pregnancyInfo: { week: 5, dayInWeek: 2, isInvalid: true, mode: 'pregnant' },
            loading: false,
        });
        const { result } = renderHook();
        expect(result.current.isInvalid).toBe(true);
    });

    it('returns isInvalid=false when pregnancyInfo is null', () => {
        mockUsePregnancy.mockReturnValue({ pregnancyInfo: null, loading: false });
        const { result } = renderHook();
        expect(result.current.isInvalid).toBe(false);
    });
});

describe('useCurrentWeek — returned loading composition', () => {
    it('loading is true when contextLoading && !weekNumber (no arg)', () => {
        mockUsePregnancy.mockReturnValue({
            pregnancyInfo: { week: 8, dayInWeek: 1, mode: 'pregnant' },
            loading: true,
        });
        const { result } = renderHook();
        expect(result.current.loading).toBe(true);
    });

    it('contextLoading does NOT force loading when a weekNumber arg is provided', async () => {
        mockUsePregnancy.mockReturnValue({
            pregnancyInfo: { week: 8, dayInWeek: 1, mode: 'pregnant' },
            loading: true,
        });
        const { result, effects } = renderHook(20);
        // With an explicit week, the effect proceeds even while context loads.
        await runEffect(effects);
        // local loading set false in finally; contextLoading is masked because weekNumber set.
        expect(result.current.loading).toBe(false);
    });
});

describe('useCurrentWeek — effect early returns', () => {
    it('returns early (no fetch) when contextLoading && !weekNumber', async () => {
        mockUsePregnancy.mockReturnValue({
            pregnancyInfo: { week: 8, dayInWeek: 1, mode: 'pregnant' },
            loading: true,
        });
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(mockGetDoc).not.toHaveBeenCalled();
        // loading stays true (context still loading, no week arg)
        expect(result.current.loading).toBe(true);
    });

    it('returns early and sets loading=false when no weekNumber and no pregnancyInfo', async () => {
        mockUsePregnancy.mockReturnValue({ pregnancyInfo: null, loading: false });
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(mockGetDoc).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
    });

    it('still fetches when pregnancyInfo is null but an explicit weekNumber is given', async () => {
        mockUsePregnancy.mockReturnValue({ pregnancyInfo: null, loading: false });
        const { effects } = renderHook(15);
        await runEffect(effects);
        expect(mockGetDoc).toHaveBeenCalledTimes(1);
        expect(mockDoc).toHaveBeenCalledWith({ __db: true }, 'weeks', '15');
    });
});

describe('useCurrentWeek — fetch success', () => {
    it('sets weekData from the document and clears loading', async () => {
        const data = { week_number: 12, title_fr: 'Semaine 12', emoji: '👶' };
        mockGetDoc.mockResolvedValue(makeWeekDoc(data));
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(result.current.weekData).toEqual(data);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('builds the doc ref against the "weeks" collection with the target week as a string', async () => {
        const { effects } = renderHook(7);
        await runEffect(effects);
        expect(mockDoc).toHaveBeenCalledWith({ __db: true }, 'weeks', '7');
    });

    it('uses pregnancyInfo.week (stringified) for the doc id when no arg', async () => {
        mockUsePregnancy.mockReturnValue({
            pregnancyInfo: { week: 30, dayInWeek: 4, mode: 'pregnant' },
            loading: false,
        });
        const { effects } = renderHook();
        await runEffect(effects);
        expect(mockDoc).toHaveBeenCalledWith({ __db: true }, 'weeks', '30');
    });
});

describe('useCurrentWeek — fetch errors', () => {
    it('sets weekDataNotFound error when the document does not exist', async () => {
        mockGetDoc.mockResolvedValue(makeWeekDoc(null)); // exists() === false
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(result.current.error).toBe('common.errors.weekDataNotFound');
        expect(result.current.weekData).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it('sets loadingFailed error and logs a warning on a generic throw', async () => {
        mockGetDoc.mockRejectedValue(Object.assign(new Error('boom'), { name: 'FirebaseError' }));
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(result.current.error).toBe('common.errors.loadingFailed');
        expect(result.current.loading).toBe(false);
        expect(mockWarn).toHaveBeenCalledWith('Error fetching week data:', 'boom');
    });

    it('sets loadingFailed error but does NOT warn for an AbortError', async () => {
        mockGetDoc.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(result.current.error).toBe('common.errors.loadingFailed');
        expect(mockWarn).not.toHaveBeenCalled();
    });

    it('sets loadingFailed error but does NOT warn when code is "unavailable"', async () => {
        mockGetDoc.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(result.current.error).toBe('common.errors.loadingFailed');
        expect(mockWarn).not.toHaveBeenCalled();
    });
});

describe('useCurrentWeek — isMounted race protection', () => {
    it('does not write state after cleanup ran (success path)', async () => {
        let resolveDoc!: (v: any) => void;
        mockGetDoc.mockReturnValue(new Promise((res) => { resolveDoc = res; }));
        const { result, effects } = renderHook();

        // Start the effect; capture cleanup, then unmount before the promise resolves.
        const eff = effects[effects.length - 1];
        const cleanup = eff.fn() as () => void;
        cleanup(); // isMounted = false

        resolveDoc(makeWeekDoc({ week_number: 12, title_fr: 'x' }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Because isMounted became false, weekData must NOT have been set.
        expect(result.current.weekData).toBeNull();
    });

    it('does not write error or stop loading after cleanup ran (error path)', async () => {
        let rejectDoc!: (e: any) => void;
        mockGetDoc.mockReturnValue(new Promise((_res, rej) => { rejectDoc = rej; }));
        const { result, effects } = renderHook();

        const eff = effects[effects.length - 1];
        const cleanup = eff.fn() as () => void;
        cleanup(); // isMounted = false

        rejectDoc(Object.assign(new Error('late'), { name: 'FirebaseError' }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // No state writes, no warn after unmount.
        expect(result.current.error).toBeNull();
        expect(mockWarn).not.toHaveBeenCalled();
        // loading was never set false (finally guarded by isMounted)
        expect(result.current.loading).toBe(true);
    });

    it('cleanup returned by the effect is a function', () => {
        const { effects } = renderHook();
        const eff = effects[effects.length - 1];
        const cleanup = eff.fn();
        expect(typeof cleanup).toBe('function');
    });
});

describe('useCurrentWeek — refetch', () => {
    it('refetch clears error, sets loading true, and bumps the effect deps (nonce)', async () => {
        // First render: make it error so we have something to clear.
        mockGetDoc.mockResolvedValueOnce(makeWeekDoc(null));
        const { result, effects } = renderHook();
        await runEffect(effects);
        expect(result.current.error).toBe('common.errors.weekDataNotFound');

        // capture nonce dep before refetch (deps = [pregnancyInfo, contextLoading, targetWeek, nonce])
        const depsBefore = effects[effects.length - 1].deps;
        const nonceBefore = depsBefore[depsBefore.length - 1];

        // Now a healthy doc on the refetch.
        const data = { week_number: 12, title_fr: 'ok' };
        mockGetDoc.mockResolvedValue(makeWeekDoc(data));

        // Calling refetch triggers setError(null), setLoading(true), setNonce(n+1),
        // each of which re-renders via our mock.
        result.current.refetch();

        // After the synchronous setters + re-render, error cleared & loading true.
        expect(result.current.error).toBeNull();
        expect(result.current.loading).toBe(true);

        const depsAfter = effects[effects.length - 1].deps;
        const nonceAfter = depsAfter[depsAfter.length - 1];
        expect(nonceAfter).toBe(nonceBefore + 1);

        // Running the new effect should populate weekData from the healthy doc.
        await runEffect(effects);
        expect(result.current.weekData).toEqual(data);
        expect(result.current.error).toBeNull();
    });
});
