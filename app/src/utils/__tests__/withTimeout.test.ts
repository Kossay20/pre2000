import { withTimeout } from '../withTimeout';

describe('withTimeout', () => {
    it('resolves when the inner promise wins', async () => {
        await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
    });

    it('rejects when the inner promise hangs past ms', async () => {
        await expect(
            withTimeout(new Promise(() => { /* never */ }), 20, 'hung'),
        ).rejects.toThrow('hung');
    });

    it('rejects with the inner error if it fails first', async () => {
        await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
    });
});
