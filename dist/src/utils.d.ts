import { ImageInfo, CacheEntry } from "./types.js";
import { EmbeddingCache } from "./cache.js";
/**
 * Move ou copia um arquivo de forma assíncrona
 */
export declare function moveFile(src: string, dest: string, copy?: boolean): Promise<void>;
/**
 * Lista arquivos de imagem em uma pasta (recursivo ou não)
 */
export declare function listImageFiles(dirPath: string, recursive?: boolean): Promise<ImageInfo[]>;
/**
 * Adiciona delay entre requisições para evitar rate limiting
 */
export declare function delay(ms: number): Promise<void>;
/**
 * Gera nome para pasta de destino baseado na configuração
 */
export declare function generateDestinationName(imageInfo: ImageInfo, motherFolder: string): string;
/**
 * Obtém o embedding de uma imagem (via análise detalhada) com cache
 */
export declare function getImageEmbedding(imagePath: string, cache?: EmbeddingCache | null): Promise<CacheEntry>;
//# sourceMappingURL=utils.d.ts.map