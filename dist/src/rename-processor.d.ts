import { ProcessedImage } from "./types.js";
/**
 * Atualiza o cache de embeddings com os novos nomes dos arquivos
 */
export declare function updateCacheWithNewNames(processedFiles: ProcessedImage[]): Promise<{
    updatedCount: number;
    errorCount: number;
}>;
/**
 * Verifica se um arquivo tem embedding no cache
 */
export declare function checkCacheStatus(filePath: string): Promise<boolean>;
/**
 * Gera embeddings para todos os arquivos em um diretório
 */
export declare function generateEmbeddingsForDirectory(dirPath: string, recursive?: boolean): Promise<{
    processed: number;
    errors: number;
}>;
//# sourceMappingURL=rename-processor.d.ts.map