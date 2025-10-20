import { MAX_CONCURRENT_REQUESTS, REQUEST_DELAY } from "./config.js";
import { Task } from "./types.js";

// Controle de concorrência para evitar rate limiting
export class ConcurrencyLimiter {
  private maxConcurrent: number;
  private currentCount: number = 0;
  private queue: Task<any>[] = [];

  constructor(maxConcurrent: number = MAX_CONCURRENT_REQUESTS) {
    this.maxConcurrent = maxConcurrent;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.currentCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.currentCount++;
    const { task, resolve, reject } = this.queue.shift()!;

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.currentCount--;
      // Pequeno delay entre requisições para evitar rate limiting
      setTimeout(() => this.process(), REQUEST_DELAY);
    }
  }
}

// Instância global do limitador de concorrência
export const apiLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_REQUESTS);
