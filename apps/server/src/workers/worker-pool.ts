import { Worker } from 'worker_threads';
import { availableParallelism } from 'os';

export type ChainType = 'deep_research' | 'expert_creation' | 'insight_refinement' | 'cross_review' | 'idea_synthesis';

type ProgressCallback = (progress: any) => void;

interface QueuedTask {
  chainType: ChainType;
  params: Record<string, unknown>;
  onProgress?: ProgressCallback;
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
}

export class WorkerPool {
  private readonly maxWorkers: number;
  private readonly queue: QueuedTask[] = [];
  private activeCount = 0;

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers ?? Math.max(1, availableParallelism() - 1);
  }

  execute<T = unknown>(
    chainType: ChainType,
    params: Record<string, unknown>,
    onProgress?: ProgressCallback
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ chainType, params, onProgress, resolve, reject } as QueuedTask);
      this.processNext();
    });
  }

  private processNext(): void {
    while (this.activeCount < this.maxWorkers && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.activeCount++;
      this.runWorker(task).finally(() => {
        this.activeCount--;
        this.processNext();
      });
    }
  }

  private runWorker(task: QueuedTask): Promise<void> {
    return new Promise<void>((done) => {
      const workerUrl = new URL('llm-worker.ts', import.meta.url);
      const worker = new Worker(workerUrl, {
        workerData: { chainType: task.chainType, params: task.params },
      });

      worker.on('message', (msg: { type: string; data: any }) => {
        if (msg.type === 'progress') {
          task.onProgress?.(msg.data);
        } else if (msg.type === 'result') {
          task.resolve(msg.data);
          worker.terminate();
          done();
        } else if (msg.type === 'error') {
          task.reject(new Error(msg.data));
          worker.terminate();
          done();
        }
      });

      worker.on('error', (err) => {
        task.reject(err);
        done();
      });

      worker.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          task.reject(new Error(`Worker exited with code ${code}`));
        }
        done();
      });
    });
  }

  get queueSize(): number {
    return this.queue.length;
  }

  get activeWorkers(): number {
    return this.activeCount;
  }
}

export const workerPool = new WorkerPool();