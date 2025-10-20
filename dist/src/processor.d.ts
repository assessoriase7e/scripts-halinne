import { EmbeddingData, ProcessingStats } from "./types.js";
/**
 * Processa imagens de uma pasta e gera embeddings
 */
export declare function processImages(folderPath: string, cache: any, folderName: string): Promise<Record<string, EmbeddingData>>;
/**
 * Compara imagens brancas com modelos e cria agrupamentos
 */
export declare function compareAndGroup(embBranco: Record<string, EmbeddingData>, embModelo: Record<string, EmbeddingData>): Promise<ProcessingStats>;
/**
 * Prepara as pastas de saída
 */
export declare function prepareOutputFolders(): Promise<void>;
/**
 * Exibe o resumo final do processamento
 */
export declare function displayFinalSummary(successfulMatches: number, notFoundCount: number, unpairedModelo: number): void;
//# sourceMappingURL=processor.d.ts.map