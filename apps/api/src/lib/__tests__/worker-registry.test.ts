const mockCreateWorker = jest.fn();

jest.mock('../queue', () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
}));

jest.mock('../../jobs/validate-recording', () => ({ runValidateRecordingJob: jest.fn() }));
jest.mock('../../jobs/transcribe', () => ({ runTranscribeJob: jest.fn() }));
jest.mock('../../jobs/analyze', () => ({ runAnalyzeJob: jest.fn() }));
jest.mock('../../jobs/deliver-webhook', () => ({ runDeliverWebhookJob: jest.fn() }));
jest.mock('../../jobs/expire-session', () => ({ runExpireSessionJob: jest.fn() }));

import { startPipelineWorkers } from '../worker-registry';

describe('startPipelineWorkers', () => {
  beforeEach(() => {
    mockCreateWorker.mockReset();
    mockCreateWorker.mockImplementation((name: string) => ({ name }));
  });

  it('registers every active pipeline worker and no retired import worker', () => {
    const workers = startPipelineWorkers({ info: jest.fn() });

    expect(mockCreateWorker.mock.calls.map(([name]) => name)).toEqual([
      'validate-recording',
      'transcribe',
      'analyze',
      'deliver-webhook',
      'expire-session',
    ]);
    expect(workers).toHaveLength(5);
  });
});
