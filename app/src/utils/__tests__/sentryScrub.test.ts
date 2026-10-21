import { scrubSentryTransaction, scrubSentryBreadcrumb } from '../sentryScrub';

describe('F-042 scrubSentryTransaction', () => {
  it('drops span data and URL queries, keeps op, timing and status', () => {
    const out: any = scrubSentryTransaction({
      transaction: 'GET https://api.example.com/users/42?email=a@b.c',
      user: { id: 'abc', email: 'a@b.c', ip_address: '1.2.3.4' },
      request: { url: 'x', data: { a: 1 }, headers: { h: 1 } },
      contexts: { trace: { op: 'navigation', status: 'ok', data: { 'http.url': 'https://x?y=1' } } },
      spans: [
        { op: 'http.client', description: 'GET https://api.example.com/a?token=secret#frag', data: { 'http.query': 'token=secret' }, status: 'ok', start_timestamp: 1, timestamp: 2 },
      ],
    });
    expect(out.transaction).toBe('GET https://api.example.com/users/42');
    expect(out.user).toEqual({ id: 'abc' });
    expect(out.request.data).toBeUndefined();
    expect(out.contexts.trace.data).toBeUndefined();
    expect(out.contexts.trace.op).toBe('navigation');
    expect(out.spans[0].data).toBeUndefined();
    expect(out.spans[0].description).toBe('GET https://api.example.com/a');
    expect(out.spans[0]).toMatchObject({ op: 'http.client', status: 'ok', start_timestamp: 1, timestamp: 2 });
  });

  it('copes with a transaction without spans', () => {
    expect(() => scrubSentryTransaction({ transaction: 'Home' })).not.toThrow();
  });
});

describe('F-042 scrubSentryBreadcrumb', () => {
  it('drops console breadcrumbs, which can hold whatever was logged', () => {
    expect(scrubSentryBreadcrumb({ category: 'console', message: 'profile {...}' })).toBeNull();
  });
  it('strips data (URLs, bodies) but keeps the rest', () => {
    const out: any = scrubSentryBreadcrumb({ category: 'xhr', type: 'http', message: 'm', data: { url: 'https://x?y=1' } });
    expect(out).toEqual({ category: 'xhr', type: 'http', message: 'm' });
  });
});
