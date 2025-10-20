import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {
  INPUT_DIR,
  OUTPUT_DIR,
  RECURSIVE_SEARCH,
  COPY_FILES,
  DRY_RUN,
} from "../src/rename-config.js";
import { log, listImageFiles, moveFile } from "../src/rename-utils.js";
import { getImageEmbedding } from "../src/utils.js";
import { cosineSimilarity } from "../src/imageProcessor.js";
import { initDatabase } from "../src/cache.js";
import { ImageInfo } from "../src/types.js";

interface OrganizedImage {
  code: string;
  filePath: string;
  fileName: string;
  embedding?: number[];
}

interface MatchResult {
  inputImage: ImageInfo;
  bestMatch?: OrganizedImage;
  similarity: number;
  suggestedCode?: string;
  suggestedPath?: string;
}

/**
 * Lista todas as imagens já organizadas por código
 */
async function listOrganizedImages(): Promise<OrganizedImage[]> {
  const organized: OrganizedImage[] = [];

  try {
    if (!fsSync.existsSync(OUTPUT_DIR)) {
      log("warn", `Diretório de saída não existe: ${OUTPUT_DIR}`);
      return [];
    }

    // Listar pastas mãe (ex: ANEIS - Ouro)
    const motherFolders = await fs.readdir(OUTPUT_DIR);

    for (const motherFolder of motherFolders) {
      const motherPath = path.join(OUTPUT_DIR, motherFolder);
      const stats = await fs.stat(motherPath);

      if (!stats.isDirectory()) continue;

      // Listar pastas de código dentro da pasta mãe
      const codeFolders = await fs.readdir(motherPath);

      for (const codeFolder of codeFolders) {
        const codePath = path.join(motherPath, codeFolder);
        const codeStats = await fs.stat(codePath);

        if (!codeStats.isDirectory()) continue;

        // Listar imagens dentro da pasta do código
        const files = await fs.readdir(codePath);

        for (const file of files) {
          const filePath = path.join(codePath, file);
          const fileStats = await fs.stat(filePath);

          if (fileStats.isFile()) {
            const ext = path.extname(file).toLowerCase();
            if (
              [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)
            ) {
              organized.push({
                code: codeFolder,
                filePath,
                fileName: file,
              });
            }
          }
        }
      }
    }

    return organized;
  } catch (error) {
    log(
      "error",
      `Erro ao listar imagens organizadas: ${(error as Error).message}`
    );
    return [];
  }
}

/**
 * Encontra a melhor correspondência para uma imagem de entrada
 */
async function findBestMatch(
  inputImage: ImageInfo,
  organizedImages: OrganizedImage[],
  minSimilarity: number = 0.75
): Promise<MatchResult> {
  try {
    log("debug", `   Gerando embedding para: ${inputImage.fileName}`);
    const inputCache = await getImageEmbedding(inputImage.filePath);
    const inputEmbedding = inputCache.embedding;

    let bestMatch: OrganizedImage | undefined;
    let bestSimilarity = 0;

    // Comparar com cada imagem organizada
    for (const organized of organizedImages) {
      // Gerar embedding se ainda não tiver
      if (!organized.embedding) {
        const organizedCache = await getImageEmbedding(organized.filePath);
        organized.embedding = organizedCache.embedding;
      }

      if (!organized.embedding) {
        log("warn", `   Embedding não disponível para ${organized.fileName}`);
        continue;
      }

      const similarity = cosineSimilarity(inputEmbedding, organized.embedding);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = organized;
      }
    }

    const result: MatchResult = {
      inputImage,
      similarity: bestSimilarity,
    };

    if (bestMatch && bestSimilarity >= minSimilarity) {
      result.bestMatch = bestMatch;
      result.suggestedCode = bestMatch.code;

      // Determinar pasta mãe do match
      const matchDir = path.dirname(bestMatch.filePath);
      const motherFolder = path.basename(path.dirname(matchDir));

      // Sugerir caminho de destino
      result.suggestedPath = path.join(
        OUTPUT_DIR,
        motherFolder,
        bestMatch.code,
        inputImage.fileName
      );
    }

    return result;
  } catch (error) {
    log(
      "error",
      `Erro ao encontrar match para ${inputImage.fileName}: ${
        (error as Error).message
      }`
    );
    return {
      inputImage,
      similarity: 0,
    };
  }
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔍 MATCH E MOVER IMAGENS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório de entrada: ${INPUT_DIR}`);
  console.log(`   - Diretório de saída: ${OUTPUT_DIR}`);
  console.log(`   - Similaridade mínima: 75%`);
  console.log(`   - Modo de simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  // Inicializar cache
  const cache = await initDatabase();

  try {
    // Verificar se os diretórios existem
    if (!fsSync.existsSync(INPUT_DIR)) {
      throw new Error(`Diretório de entrada não encontrado: ${INPUT_DIR}`);
    }

    if (!fsSync.existsSync(OUTPUT_DIR)) {
      throw new Error(`Diretório de saída não encontrado: ${OUTPUT_DIR}`);
    }

    // Listar imagens de entrada
    log("info", `Procurando imagens em ${INPUT_DIR}...`);
    const inputImages = await listImageFiles(INPUT_DIR, RECURSIVE_SEARCH);

    if (inputImages.length === 0) {
      log("warn", "Nenhuma imagem encontrada para processar!");
      return;
    }

    log("info", `Encontradas ${inputImages.length} imagens para processar\n`);

    // Listar imagens já organizadas
    log("info", `Carregando imagens organizadas de ${OUTPUT_DIR}...`);
    const organizedImages = await listOrganizedImages();

    if (organizedImages.length === 0) {
      log(
        "warn",
        "Nenhuma imagem organizada encontrada! Execute o script de rename primeiro."
      );
      return;
    }

    log(
      "info",
      `Encontradas ${organizedImages.length} imagens organizadas\n`
    );

    // Processar cada imagem de entrada
    const results: MatchResult[] = [];
    let movedCount = 0;
    let notFoundCount = 0;

    for (let i = 0; i < inputImages.length; i++) {
      const inputImage = inputImages[i];
      log(
        "info",
        `[${i + 1}/${inputImages.length}] Processando: ${inputImage.fileName}`
      );

      const result = await findBestMatch(inputImage, organizedImages);
      results.push(result);

      if (result.bestMatch && result.suggestedPath) {
        log(
          "info",
          `   ✅ Match encontrado: ${result.bestMatch.code} (similaridade: ${(
            result.similarity * 100
          ).toFixed(1)}%)`
        );
        log("info", `   📁 Arquivo similar: ${result.bestMatch.fileName}`);

        // Verificar se o arquivo de destino já existe
        try {
          await fs.access(result.suggestedPath);
          log(
            "warn",
            `   ⚠️ Arquivo de destino já existe, pulando: ${path.basename(
              result.suggestedPath
            )}`
          );
          continue;
        } catch {
          // Arquivo não existe, podemos prosseguir
        }

        // Mover/copiar arquivo
        await moveFile(inputImage.filePath, result.suggestedPath, COPY_FILES);
        movedCount++;
      } else {
        log(
          "warn",
          `   ❌ Nenhum match encontrado (melhor similaridade: ${(
            result.similarity * 100
          ).toFixed(1)}%)`
        );
        notFoundCount++;
      }

      console.log(""); // Linha em branco
    }

    // Salvar relatório
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: inputImages.length,
        moved: movedCount,
        notFound: notFoundCount,
      },
      results: results.map((r) => ({
        fileName: r.inputImage.fileName,
        matchedCode: r.suggestedCode,
        matchedFile: r.bestMatch?.fileName,
        similarity: r.similarity,
        moved: !!r.suggestedPath,
      })),
    };

    const reportPath = path.join(OUTPUT_DIR, "match-and-move-report.json");
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Exibir resumo final
    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO!");
    console.log("═══════════════════════════════════════════");
    console.log(`\n📊 Estatísticas:`);
    console.log(`   📥 Total de imagens: ${inputImages.length}`);
    console.log(`   ✅ Movidas: ${movedCount}`);
    console.log(`   ❌ Sem match: ${notFoundCount}`);
    console.log(`\n📄 Relatório: ${reportPath}`);
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O PROCESSAMENTO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();
