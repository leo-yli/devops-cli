import { apiClient } from './client.js';

export interface TaskResult<T = unknown> {
  status: 'pending' | 'success' | 'failure';
  result?: T;
  error?: string;
}

/**
 * 异步任务轮询服务
 */
export class PollingService {
  async pollTaskResult<T>(
    taskId: string,
    options: {
      interval?: number;
      maxAttempts?: number;
      onProgress?: (attempt: number) => void;
    } = {}
  ): Promise<T> {
    const { interval = 2000, maxAttempts = 60, onProgress } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      onProgress?.(attempt);

      try {
        const res = await apiClient.getClient().get<{ status: string; context?: T; error?: string }>(
          `/tasks/result/?task_id=${taskId}`
        );

        if (res.data.status === 'success') {
          return res.data.context as T;
        }
        if (res.data.status === 'failure') {
          throw new Error(res.data.error || 'Task failed');
        }
      } catch (e: any) {
        if (e.response?.status !== 404) {
          throw e;
        }
      }

      await this.sleep(interval);
    }

    throw new Error(`Task polling timeout after ${maxAttempts} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const pollingService = new PollingService();
