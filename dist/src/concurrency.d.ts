export declare class ConcurrencyLimiter {
    private maxConcurrent;
    private currentCount;
    private queue;
    constructor(maxConcurrent?: number);
    execute<T>(task: () => Promise<T>): Promise<T>;
    private process;
}
export declare const apiLimiter: ConcurrencyLimiter;
//# sourceMappingURL=concurrency.d.ts.map