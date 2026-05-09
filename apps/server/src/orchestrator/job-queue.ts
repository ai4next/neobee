export class JobQueue {
  private readonly queue: string[] = [];
  private readonly inProgress = new Set<string>();
  private readonly processor: (sessionId: string) => Promise<void>;

  constructor(processor: (sessionId: string) => Promise<void>) {
    this.processor = processor;
  }

  enqueue(sessionId: string): void {
    if (this.inProgress.has(sessionId) || this.queue.includes(sessionId)) return;
    this.queue.push(sessionId);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.inProgress.size > 0 || this.queue.length === 0) return;

    // Process one at a time per stage to maintain ordering
    const sessionId = this.queue.shift()!;
    this.inProgress.add(sessionId);

    try {
      await this.processor(sessionId);
    } catch {
      // Error handling is done by the processor (controller)
    } finally {
      this.inProgress.delete(sessionId);
      this.processNext();
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.inProgress.size;
  }

  clear(): void {
    this.queue.length = 0;
  }
}