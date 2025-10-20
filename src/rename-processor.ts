import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { CACHE_DB } from "./config.js";
import { initDatabase, EmbeddingCache, getFileHash } from "./cache.js";
import { getImageEmbedding } from "./utils.js";
import { ProcessedImage } from "./types.js";

/**
 * Atualiza o cache de embeddings com os novos nomes dos arquivos
 */
export async function updateCacheWithNewNames(
  processedFiles: ProcessedImage[]
): Promise<{ updatedCount: number; errorCount: number }> {
  console.log("\n═══════════════════════════════════════════");
  console.log("🔄 ATUALIZANDO CACHE COM NOVOS NOMES");
  console.log("═══════════════════════════════════════════\n");

  try {
    // Inicializar banco de dados e cache
    const db = await initDatabase();
    const cache = new EmbeddingCache(db);

    let updatedCount = 0;
    let errorCount = 0;

    for (const file of processedFiles) {
      if (!file.success) continue;

      try {
        // Verificar se existe entrada no cache para o arquivo original
        const oldPath = file.filePath;
        const newPath = file.destinationPath;

        if (!newPath) continue;

        console.log(
          `🔄 Atualizando: ${path.basename(oldPath)} → ${path.basename(
            newPath
          )}`
        );

        // Buscar entrada existente no cache
        const cached = await cache.get(oldPath);

        if (cached) {
          // Salvar no cache com o novo nome
          await cache.set(newPath, cached.analysis, cached.embedding);
          console.log(`   ✅ Cache atualizado para: ${path.basename(newPath)}`);
          updatedCount++;
        } else {
          // Se não existe no cache, tentar gerar embedding
          console.log(
            `   📝 Gerando embedding para: ${path.basename(newPath)}`
          );
          try {
            const { embedding, analysis } = await getImageEmbedding(
              newPath,
              cache
            );
            console.log(
              `   ✅ Embedding gerado e cacheado para: ${path.basename(
                newPath
              )}`
            );
            updatedCount++;
          } catch (error) {
            console.log(
              `   ⚠️ Erro ao gerar embedding: ${(error as Error).message}`
            );
            errorCount++;
          }
        }
      } catch (error) {
        console.error(
          `   ❌ Erro ao atualizar cache para ${file.fileName}: ${
            (error as Error).message
          }`
        );
        errorCount++;
      }
    }

    console.log(
      `\n📊 Atualização de cache: ${updatedCount} atualizados, ${errorCount} erros`
    );

    // Fechar conexão com o banco de dados
    cache.close();

    return { updatedCount, errorCount };
  } catch (error) {
    console.error(`❌ Erro ao inicializar cache: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Verifica se um arquivo tem embedding no cache
 */
export async function checkCacheStatus(filePath: string): Promise<boolean> {
  try {
    const db = await initDatabase();
    const cache = new EmbeddingCache(db);

    const cached = await cache.get(filePath);
    cache.close();

    return !!cached;
  } catch (error) {
    console.error(`❌ Erro ao verificar cache: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Gera embeddings para todos os arquivos em um diretório
 */
export async function generateEmbeddingsForDirectory(
  dirPath: string,
  recursive: boolean = true
): Promise<{ processed: number; errors: number }> {
  console.log("\n═══════════════════════════════════════════");
  console.log("🧮 GERANDO EMBEDDINGS PARA DIRETÓRIO");
  console.log("═══════════════════════════════════════════\n");

  try {
    const db = await initDatabase();
    const cache = new EmbeddingCache(db);

    // Listar arquivos de imagem
    const imageFiles: string[] = [];

    async function scanDirectory(currentPath: string): Promise<void> {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory() && recursive) {
          await scanDirectory(itemPath);
        } else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (
            [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)
          ) {
            imageFiles.push(itemPath);
          }
        }
      }
    }

    await scanDirectory(dirPath);

    if (imageFiles.length === 0) {
      console.log("Nenhuma imagem encontrada no diretório.");
      cache.close();
      return { processed: 0, errors: 0 };
    }

    console.log(`Encontradas ${imageFiles.length} imagens para processar.\n`);

    let processed = 0;
    let errors = 0;

    // Processar cada imagem
    for (let i = 0; i < imageFiles.length; i++) {
      const imagePath = imageFiles[i];
      console.log(
        `[${i + 1}/${imageFiles.length}] 📸 ${path.basename(imagePath)}`
      );

      try {
        // Verificar se já está no cache
        const cached = await cache.get(imagePath);

        if (cached) {
          console.log(`   ✅ Já está no cache`);
          processed++;
        } else {
          // Gerar embedding
          const { embedding, analysis } = await getImageEmbedding(
            imagePath,
            cache
          );
          console.log(`   ✅ Embedding gerado e cacheado`);
          processed++;
        }
      } catch (error) {
        console.error(`   ❌ Erro: ${(error as Error).message}`);
        errors++;
      }
    }

    console.log(
      `\n📊 Processamento concluído: ${processed} sucesso, ${errors} erros`
    );

    cache.close();
    return { processed, errors };
  } catch (error) {
    console.error(`❌ Erro ao gerar embeddings: ${(error as Error).message}`);
    throw error;
  }
}
