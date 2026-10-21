/**
 * Health ("Ma Santé") and the tracker ("Mon Poids") each reduce the merged weight
 * history to one weighing per day. If the two rules disagree, the same day shows two
 * different weights on two screens. They must pick the same weighing.
 */
jest.mock('../../config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

import { dedupeWeightByDate } from '../healthService';
import { latestWeighingPerDay } from '../weightService';
import type { HealthMetric } from '../../types';
import type { WeightEntry } from '../weightService';

type Weighing = { id: string; value: number; date: string; created_at?: string; tracker: boolean };

const asMetric = (w: Weighing): HealthMetric => ({
  metric_id: w.id,
  user_id: 'u1',
  type: 'weight',
  value: w.value,
  date: w.date,
  week: 32,
  created_at: w.created_at ?? w.date,
} as HealthMetric);

const asEntry = (w: Weighing): WeightEntry => ({
  id: w.id,
  user_id: 'u1',
  weight: w.value,
  date: w.date,
  week_of_pregnancy: 32,
  source: w.tracker ? 'weight_entries' : 'healthMetrics',
} as WeightEntry);

const healthPick = (ws: Weighing[]) =>
  // Health concatenates legacy (dashboard) entries first, tracker entries after.
  dedupeWeightByDate([...ws.filter(w => !w.tracker), ...ws.filter(w => w.tracker)].map(asMetric)).map(m => m.value);

const trackerPick = (ws: Weighing[]) =>
  latestWeighingPerDay(ws.map(asEntry)).map(e => e.weight).reverse();

describe('one weighing per day — Health and tracker agree', () => {
  const cases: Record<string, Weighing[]> = {
    'later weighing of the day wins, whichever screen': [
      { id: 't', value: 68.4, date: '2026-10-01T07:00:00.000Z', tracker: true },
      { id: 'h', value: 69, date: '2026-10-01T09:00:00.000Z', tracker: false },
    ],
    'a backfilled entry created later but weighed earlier does not win': [
      { id: 't', value: 68.4, date: '2026-10-01T09:00:00.000Z', tracker: true, created_at: '2026-10-01T09:00:00.000Z' },
      { id: 'h', value: 69, date: '2026-10-01T07:00:00.000Z', tracker: false, created_at: '2026-10-01T20:00:00.000Z' },
    ],
    'same instant: the tracker entry wins': [
      { id: 't', value: 68.4, date: '2026-10-01T08:00:00.000Z', tracker: true },
      { id: 'h', value: 69, date: '2026-10-01T08:00:00.000Z', tracker: false },
    ],
    'different days are both kept': [
      { id: 't', value: 68.4, date: '2026-09-30T08:00:00.000Z', tracker: true },
      { id: 'h', value: 69, date: '2026-10-01T08:00:00.000Z', tracker: false },
    ],
  };

  it.each(Object.entries(cases))('%s', (_name, weighings) => {
    expect(healthPick(weighings)).toEqual(trackerPick(weighings));
  });
});
