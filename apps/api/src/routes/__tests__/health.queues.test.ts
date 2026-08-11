const mockGetWaitingJobCounts = jest.fn();

jest.mock('../../lib/queue', () => ({
  getWaitingJobCounts: (...args: unknown[]) => mockGetWaitingJobCounts(...args),
}));

import { checkQueues, QueueDepths } from '../health';

beforeEach(() => {
  mockGetWaitingJobCounts.mockReset();
});

describe('checkQueues()', () => {
  it('returns waiting counts from the shared queue helper', async () => {
    const counts: QueueDepths = {
      validate: 2,
      transcribe: 0,
      analyze: 1,
      webhooks: 3,
    };
    mockGetWaitingJobCounts.mockResolvedValue(counts);

    await expect(checkQueues()).resolves.toEqual(counts);
    expect(mockGetWaitingJobCounts).toHaveBeenCalledTimes(1);
  });

  it('maps helper failures to the existing error shape', async () => {
    mockGetWaitingJobCounts.mockRejectedValue(new Error('Redis connection refused'));

    await expect(checkQueues()).resolves.toEqual({
      status: 'error',
      error: 'Redis connection refused',
    });
  });
});
