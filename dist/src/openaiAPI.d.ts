/**
 * Analisa a imagem e extrai características visuais detalhadas
 */
export declare function analyzeImage(imagePath: string): Promise<string>;
/**
 * Gera embedding da descrição textual
 */
export declare function getTextEmbedding(text: string): Promise<number[]>;
/**
 * Verificação adicional de similaridade usando análise comparativa
 */
export declare function verifySimilarity(imagePath1: string, imagePath2: string, expectedSimilarity: number): Promise<boolean>;
//# sourceMappingURL=openaiAPI.d.ts.map