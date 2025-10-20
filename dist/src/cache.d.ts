import sqlite3 from "sqlite3";
import { CacheEntry } from "./types.js";
export declare function getFileHash(filePath: string): Promise<string | null>;
export declare function initDatabase(): Promise<sqlite3.Database>;
export declare class EmbeddingCache {
    private db;
    constructor(db: sqlite3.Database);
    get(filePath: string): Promise<CacheEntry | null>;
    set(filePath: string, analysis: string, embedding: number[]): Promise<number>;
    clearOld(daysOld?: number): Promise<number>;
    close(): void;
}
//# sourceMappingURL=cache.d.ts.map