import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const whereSelect = vi.fn();
const whereDelete = vi.fn();

vi.mock('@/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: whereSelect }) }),
    delete: () => ({ where: whereDelete }),
  },
}));

vi.mock('@/db/schema', () => ({
  deviceTokens: {
    id: 'id',
    userId: 'user_id',
  },
}));

import { sendPushToUser } from './pushSender';

describe('sendPushToUser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    whereSelect.mockReset();
    whereDelete.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not call Expo when the user has no devices', async () => {
    whereSelect.mockResolvedValue([]);
    await sendPushToUser('user-1', 'Title', 'Body');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends every token and removes one rejected by FCM', async () => {
    whereSelect.mockResolvedValue([
      { id: 'token-row-1', expoPushToken: 'ExponentPushToken[first]' },
      { id: 'token-row-2', expoPushToken: 'ExponentPushToken[second]' },
    ]);
    whereDelete.mockResolvedValue(undefined);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
        { status: 'ok', id: 'ticket-1' },
        { status: 'ok', id: 'ticket-2' },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        'ticket-1': { status: 'error', message: 'Not registered', details: { error: 'DeviceNotRegistered' } },
        'ticket-2': { status: 'ok' },
      } }), { status: 200 }));

    await sendPushToUser('user-1', 'Title', 'Body', { applicationId: 'app-1' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(sent).toHaveLength(2);
    expect(sent[0].data).toEqual({ applicationId: 'app-1' });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(whereDelete).toHaveBeenCalledTimes(1);
  });

  it('does not throw when Expo rejects the request', async () => {
    whereSelect.mockResolvedValue([{ id: 'token-row-1', expoPushToken: 'ExponentPushToken[first]' }]);
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 500 }));
    await expect(sendPushToUser('user-1', 'Title', 'Body')).resolves.toBeUndefined();
  });
});
