/**
 * D-024: a JSON export left in the cache (crash between write and delete) is removed by the
 * sweep the local wipe calls; other cache files are left alone.
 */
const mockRead = jest.fn();
const mockDelete = jest.fn(async () => undefined);
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  readDirectoryAsync: (...a: unknown[]) => mockRead(...a),
  deleteAsync: (...a: unknown[]) => mockDelete(...(a as [])),
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));

import { Platform } from 'react-native';
import { sweepExportFiles } from '../exportFileSweep';

describe('sweepExportFiles', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    mockRead.mockReset();
    mockDelete.mockClear();
  });

  it('deletes only the export files', async () => {
    mockRead.mockResolvedValue(['mama-bebe-export-2026-10-02.json', 'image.png', 'mama-bebe-export-2026-09-30.json']);
    await sweepExportFiles();
    expect(mockDelete.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'file:///cache/mama-bebe-export-2026-10-02.json',
      'file:///cache/mama-bebe-export-2026-09-30.json',
    ]);
  });

  it('never throws when the cache cannot be read', async () => {
    mockRead.mockRejectedValue(new Error('denied'));
    await expect(sweepExportFiles()).resolves.toBeUndefined();
  });
});
