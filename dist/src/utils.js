import fs from "fs/promises";
import path from "path";
import { COPY_FILES, RECURSIVE_SEARCH, KEEP_ORIGINAL_NAMES } from "./config.js";
/**
 * Move ou copia um arquivo de forma assíncrona
 */
export async function moveFile(src, dest, copy = COPY_FILES) {
    try {
        // Garantir que o diretório de destino exista
        const destDir = path.dirname(dest);
        await fs.mkdir(destDir, { recursive: true });
        if (copy) {
            // Copiar o arquivo
            await fs.copyFile(src, dest);
            console.log(`    📁 Copiado: ${path.basename(src)} → ${dest}`);
        }
        else {
            // Mover o arquivo
            await fs.rename(src, dest);
            console.log(`    📁 Movido: ${path.basename(src)} → ${dest}`);
        }
    }
    catch (error) {
        console.error(`    ❌ Erro ao ${copy ? "copiar" : "mover"} arquivo: ${error.message}`);
        throw error;
    }
}
/**
 * Lista arquivos de imagem em uma pasta (recursivo ou não)
 */
export async function listImageFiles(dirPath, recursive = RECURSIVE_SEARCH) {
    try {
        const imageFiles = [];
        async function scanDirectory(currentPath) {
            const items = await fs.readdir(currentPath);
            for (const item of items) {
                const itemPath = path.join(currentPath, item);
                const stats = await fs.stat(itemPath);
                if (stats.isDirectory() && recursive) {
                    // Continuar busca recursiva em subpastas
                    await scanDirectory(itemPath);
                }
                else if (stats.isFile()) {
                    // Verificar se é uma imagem
                    const ext = path.extname(item).toLowerCase();
                    if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)) {
                        // Calcular caminho relativo para manter estrutura
                        const relativePath = path.relative(dirPath, itemPath);
                        imageFiles.push({
                            fileName: item,
                            filePath: itemPath,
                            relativePath: relativePath,
                        });
                    }
                }
            }
        }
        await scanDirectory(dirPath);
        return imageFiles;
    }
    catch (error) {
        console.error(`❌ Erro ao ler pasta ${dirPath}:`, error.message);
        return [];
    }
}
/**
 * Adiciona delay entre requisições para evitar rate limiting
 */
export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Gera nome para pasta de destino baseado na configuração
 */
export function generateDestinationName(imageInfo, motherFolder) {
    if (KEEP_ORIGINAL_NAMES) {
        // Manter estrutura original de pastas
        return path.dirname(imageInfo.relativePath) || "root";
    }
    else {
        // Usar nome base do arquivo (comportamento original)
        return path.parse(imageInfo.fileName).name;
    }
}
/**
 * Obtém o embedding de uma imagem (via análise detalhada) com cache
 */
export async function getImageEmbedding(imagePath, cache = null) {
    // Importar dinamicamente para evitar dependência circular
    const { analyzeImage } = await import("./openaiAPI.js");
    const { getTextEmbedding } = await import("./openaiAPI.js");
    console.log(`  🔍 Analisando visualmente...`);
    // Tentar obter do cache primeiro
    if (cache) {
        const cached = await cache.get(imagePath);
        if (cached) {
            console.log(`  📝 Análise (cache): ${cached.analysis.substring(0, 100)}...`);
            console.log(`  ✅ Embedding recuperado do cache!`);
            return cached;
        }
    }
    // Se não estiver no cache, processar normalmente
    const analysis = await analyzeImage(imagePath);
    if (!analysis) {
        throw new Error("Análise da imagem retornou nulo");
    }
    console.log(`  📝 Análise: ${analysis.substring(0, 100)}...`);
    console.log(`  🧮 Gerando embedding...`);
    const embedding = await getTextEmbedding(analysis);
    console.log(`  ✅ Embedding gerado com sucesso!`);
    const result = { embedding, analysis };
    // Salvar no cache
    if (cache) {
        await cache.set(imagePath, analysis, embedding);
    }
    return result;
}
//# sourceMappingURL=utils.js.map