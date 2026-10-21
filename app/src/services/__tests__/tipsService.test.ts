/**
 * tipsService — daily pregnancy tips loader (280 tips, 40 weeks × 7 days, FR/AR/EN).
 * Covers: doc-id zero-padding (padStart boundary), exists true/false branches, the three
 * error sub-branches in getTipForDay's catch (unavailable / AbortError silent vs generic
 * logged), getTipsForWeek day-sort, getTipsByCategory order-preservation, empty + throw → []
 * fallbacks, and getRandomTip's Math.random → (week,day) mapping via the doc-id it builds.
 */

// Module-level logger capture — mock-prefix survives jest's hoist guard so we can assert
// which error sub-branch logged.
const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
};
jest.mock('../../utils/logger', () => ({ createLogger: () => mockLog }));
jest.mock('../../config/firebase', () => ({ db: { __db: true } }));

// Firestore mock: doc/collection/query/where are passthrough recorders; getDoc/getDocs are
// per-test jest.fn()s whose behavior each test sets explicitly (clearAllMocks clears call
// records but NOT implementations, so we re-set every test to avoid leakage).
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: any, ...path: string[]) => ({ __doc: path })),
  collection: jest.fn((_db: any, name: string) => ({ __coll: name })),
  where: jest.fn((field: string, op: string, val: any) => ({ field, op, val })),
  query: jest.fn((coll: any, clause: any) => ({ coll, clause })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
}));

import {
  getTipForDay,
  getTipsForWeek,
  getTipsByCategory,
  getRandomTip,
} from '../tipsService';
import { doc, collection, where, getDoc, getDocs } from 'firebase/firestore';

const mockedDoc = doc as jest.Mock;
const mockedCollection = collection as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;

// Build a Tip-shaped fixture.
const makeTip = (over: Partial<any> = {}): any => ({
  tip_id: 'tip_w05_d03',
  week: 5,
  day: 3,
  short_fr: 'Buvez beaucoup d eau aujourd hui pour rester hydratee',
  short_ar: 'aشرب',
  short_en: 'Drink water',
  long_fr: 'long fr',
  long_ar: 'long ar',
  long_en: 'long en',
  category: 'nutrition',
  tags: 'a,b',
  sources: 'who',
  ...over,
});

// Helpers to fabricate firestore doc-snapshot / query-snapshot shapes.
const docSnap = (exists: boolean, data?: any) => ({
  exists: () => exists,
  data: () => data,
});
const querySnap = (datas: any[]) => ({
  docs: datas.map((d) => ({ data: () => d })),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tipsService.getTipForDay', () => {
  it('returns the tip data when the doc exists', async () => {
    const tip = makeTip();
    mockedGetDoc.mockResolvedValue(docSnap(true, tip));

    const result = await getTipForDay(5, 3);

    expect(result).toEqual(tip);
    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('builds the doc id with two-digit zero-padding for single-digit week/day', async () => {
    mockedGetDoc.mockResolvedValue(docSnap(true, makeTip()));

    await getTipForDay(5, 3);

    // doc(db, 'tips', tipId) — third positional arg is the id.
    expect(mockedDoc).toHaveBeenCalledWith(
      { __db: true },
      'tips',
      'tip_w05_d03'
    );
  });

  it('does NOT over-pad already-two-digit week/day', async () => {
    mockedGetDoc.mockResolvedValue(docSnap(true, makeTip({ week: 12, day: 10 })));

    await getTipForDay(12, 10);

    expect(mockedDoc).toHaveBeenCalledWith(
      { __db: true },
      'tips',
      'tip_w12_d10'
    );
  });

  it('builds the doc id correctly at the lower boundary (week 1, day 1)', async () => {
    mockedGetDoc.mockResolvedValue(docSnap(false));

    await getTipForDay(1, 1);

    expect(mockedDoc).toHaveBeenCalledWith(
      { __db: true },
      'tips',
      'tip_w01_d01'
    );
  });

  it('builds the doc id correctly at the upper boundary (week 40, day 7)', async () => {
    mockedGetDoc.mockResolvedValue(docSnap(false));

    await getTipForDay(40, 7);

    expect(mockedDoc).toHaveBeenCalledWith(
      { __db: true },
      'tips',
      'tip_w40_d07'
    );
  });

  it('returns null and warns when the doc does not exist', async () => {
    mockedGetDoc.mockResolvedValue(docSnap(false));

    const result = await getTipForDay(99, 9);

    expect(result).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledTimes(1);
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('returns the data even when short_fr is undefined (optional-chaining in log)', async () => {
    const tip = makeTip({ short_fr: undefined });
    mockedGetDoc.mockResolvedValue(docSnap(true, tip));

    const result = await getTipForDay(5, 3);

    expect(result).toEqual(tip);
    // No throw from log.info(`...${data.short_fr?.substring(...)}`)
    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('returns null WITHOUT logging error when error.code === "unavailable"', async () => {
    mockedGetDoc.mockRejectedValue({ code: 'unavailable' });

    const result = await getTipForDay(5, 3);

    expect(result).toBeNull();
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('returns null WITHOUT logging error when error.name === "AbortError"', async () => {
    mockedGetDoc.mockRejectedValue({ name: 'AbortError' });

    const result = await getTipForDay(5, 3);

    expect(result).toBeNull();
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('returns null AND logs error for a generic error', async () => {
    mockedGetDoc.mockRejectedValue(new Error('permission-denied'));

    const result = await getTipForDay(5, 3);

    expect(result).toBeNull();
    expect(mockLog.error).toHaveBeenCalledTimes(1);
  });

  it('logs error for an error whose code is set but not "unavailable"', async () => {
    mockedGetDoc.mockRejectedValue({ code: 'permission-denied', name: 'FirebaseError' });

    const result = await getTipForDay(5, 3);

    expect(result).toBeNull();
    expect(mockLog.error).toHaveBeenCalledTimes(1);
  });
});

describe('tipsService.getTipsForWeek', () => {
  it('returns tips sorted ascending by day', async () => {
    const unsorted = [
      makeTip({ tip_id: 't3', day: 3 }),
      makeTip({ tip_id: 't1', day: 1 }),
      makeTip({ tip_id: 't7', day: 7 }),
      makeTip({ tip_id: 't2', day: 2 }),
    ];
    mockedGetDocs.mockResolvedValue(querySnap(unsorted));

    const result = await getTipsForWeek(5);

    expect(result.map((t: any) => t.day)).toEqual([1, 2, 3, 7]);
  });

  it('queries the tips collection filtered by week', async () => {
    mockedGetDocs.mockResolvedValue(querySnap([]));

    await getTipsForWeek(12);

    expect(mockedCollection).toHaveBeenCalledWith({ __db: true }, 'tips');
    expect(mockedWhere).toHaveBeenCalledWith('week', '==', 12);
  });

  it('returns [] when the week has no tips', async () => {
    mockedGetDocs.mockResolvedValue(querySnap([]));

    const result = await getTipsForWeek(5);

    expect(result).toEqual([]);
  });

  it('returns [] and logs error when getDocs throws', async () => {
    mockedGetDocs.mockRejectedValue(new Error('network'));

    const result = await getTipsForWeek(5);

    expect(result).toEqual([]);
    expect(mockLog.error).toHaveBeenCalledTimes(1);
  });
});

describe('tipsService.getTipsByCategory', () => {
  it('returns tips in the order received WITHOUT sorting (contrast with getTipsForWeek)', async () => {
    const cat = [
      makeTip({ tip_id: 'c1', day: 5 }),
      makeTip({ tip_id: 'c2', day: 1 }),
      makeTip({ tip_id: 'c3', day: 3 }),
    ];
    mockedGetDocs.mockResolvedValue(querySnap(cat));

    const result = await getTipsByCategory('nutrition');

    // Order is preserved exactly as Firestore returned it — no day sort.
    expect(result.map((t: any) => t.tip_id)).toEqual(['c1', 'c2', 'c3']);
    expect(result.map((t: any) => t.day)).toEqual([5, 1, 3]);
  });

  it('queries the tips collection filtered by category', async () => {
    mockedGetDocs.mockResolvedValue(querySnap([]));

    await getTipsByCategory('hydration');

    expect(mockedCollection).toHaveBeenCalledWith({ __db: true }, 'tips');
    expect(mockedWhere).toHaveBeenCalledWith('category', '==', 'hydration');
  });

  it('returns [] when the category has no tips', async () => {
    mockedGetDocs.mockResolvedValue(querySnap([]));

    const result = await getTipsByCategory('empty-cat');

    expect(result).toEqual([]);
  });

  it('returns [] and logs error when getDocs throws', async () => {
    mockedGetDocs.mockRejectedValue(new Error('boom'));

    const result = await getTipsByCategory('nutrition');

    expect(result).toEqual([]);
    expect(mockLog.error).toHaveBeenCalledTimes(1);
  });
});

describe('tipsService.getRandomTip', () => {
  afterEach(() => {
    (Math.random as any).mockRestore?.();
  });

  it('maps Math.random()===0 to week 1, day 1 (lower bound) via getTipForDay doc id', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockedGetDoc.mockResolvedValue(docSnap(true, makeTip()));

    await getRandomTip();

    expect(mockedDoc).toHaveBeenCalledWith({ __db: true }, 'tips', 'tip_w01_d01');
  });

  it('maps Math.random()≈0.9999 to week 40, day 7 (upper bound) via getTipForDay doc id', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9999999);
    mockedGetDoc.mockResolvedValue(docSnap(true, makeTip()));

    await getRandomTip();

    expect(mockedDoc).toHaveBeenCalledWith({ __db: true }, 'tips', 'tip_w40_d07');
  });

  it('returns the tip when getTipForDay finds one', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const tip = makeTip();
    mockedGetDoc.mockResolvedValue(docSnap(true, tip));

    const result = await getRandomTip();

    expect(result).toEqual(tip);
  });

  it('returns null when the randomly selected tip does not exist', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    mockedGetDoc.mockResolvedValue(docSnap(false));

    const result = await getRandomTip();

    expect(result).toBeNull();
  });

  it('returns null (not a throw) when underlying getDoc rejects — getTipForDay swallows', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    mockedGetDoc.mockRejectedValue(new Error('fail'));

    const result = await getRandomTip();

    expect(result).toBeNull();
  });
});
