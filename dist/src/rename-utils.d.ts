import { ImageInfo, ProcessedImage, ImageType, Counters, ReportData } from "./types.js";
/**
 * Função de log personalizada
 */
export declare function log(level: "debug" | "info" | "warn" | "error", message: string): void;
/**
 * Extrai o código numérico do nome do arquivo
 */
export declare function extractCode(fileName: string): string | null;
/**
 * Identifica o tipo de imagem com base no nome do arquivo
 */
export declare function identifyImageType(fileName: string, filePath: string): ImageType;
/**
 * Gera o novo nome do arquivo conforme o padrão especificado
 */
export declare function generateNewFileName(fileName: string, filePath: string, code: string, imageType: ImageType, counters: Counters): string;
/**
 * Lista arquivos de imagem em uma pasta (recursivo ou não)
 */
export declare function listImageFiles(dirPath: string, recursive?: boolean): Promise<ImageInfo[]>;
/**
 * Move ou copia um arquivo de forma assíncrona
 */
export declare function moveFile(src: string, dest: string, copy?: boolean): Promise<void>;
/**
 * Cria um relatório das operações realizadas
 */
export declare function createReport(processedFiles: ProcessedImage[], errors: Array<{
    file: string;
    error: string;
}>): ReportData;
/**
 * Salva o relatório em um arquivo JSON
 */
export declare function saveReport(report: ReportData, outputPath?: string): Promise<void>;
//# sourceMappingURL=rename-utils.d.ts.map