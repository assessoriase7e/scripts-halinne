import { MAX_CONCURRENT_REQUESTS, REQUEST_DELAY } from "./config.js";
// Controle de concorrência para evitar rate limiting
export class ConcurrencyLimiter {
    maxConcurrent;
    currentCount = 0;
    queue = [];
    constructor(maxConcurrent = MAX_CONCURRENT_REQUESTS) {
        this.maxConcurrent = maxConcurrent;
    }
    async execute(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }
    async process() {
        if (this.currentCount >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }
        this.currentCount++;
        const { task, resolve, reject } = this.queue.shift();
        try {
            const result = await task();
            resolve(result);
        }
        catch (error) {
            reject(error);
        }
        finally {
            this.currentCount--;
            // Pequeno delay entre requisições para evitar rate limiting
            setTimeout(() => this.process(), REQUEST_DELAY);
        }
    }
}
// Instância global do limitador de concorrência
export const apiLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_REQUESTS);
//# sourceMappingURL=concurrency.js.map