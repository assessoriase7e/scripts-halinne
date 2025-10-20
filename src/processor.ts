import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {
  PATH_BRANCO,
  PATH_MODELO,
  PATH_OUT,
  PATH_NOT_FOUND,
  RECURSIVE_SEARCH,
  COPY_FILES,
  MOTHER_FOLDER,
  MIN_SIMILARITY,
  MAX_CONCURRENT_REQUESTS,
  KEEP_ORIGINAL_NAMES,
} from "../match-images/match-config.js";
import { cosineSimilarity } from "./imageProcessor.js";
import { verifySimilarity } from "./openaiAPI.js";
import {
  moveFile,
  listImageFiles,
  generateDestinationName,
  getImageEmbedding,
} from "./utils.js";
import {
  ImageInfo,
  EmbeddingData,
  ComparisonResult,
  ProcessingStats,
} from "./types.js";

/**
 * Processa imagens de uma pasta e gera embeddings
 */
export async function processImages(
  folderPath: string,
  cache: any,
  folderName: string
): Promise<Record<string, EmbeddingData>> {
  console.log(`═══════════════════════════════════════════`);
  console.log(
    `📸 PROCESSANDO IMAGENS ${folderName.toUpperCase()} (PARALELO COM CACHE)`
  );
  console.log(`═══════════════════════════════════════════\n`);

  const embeddings: Record<string, EmbeddingData> = {};
  const files = await listImageFiles(folderPath, RECURSIVE_SEARCH);

  if (files.length === 0) {
    throw new Error(`Nenhuma imagem encontrada em ${folderPath}`);
  }

  console.log(`Total de imagens: ${files.length}`);
  if (RECURSIVE_SEARCH) {
    console.log(`Busca recursiva em subpastas: ATIVADA`);
  }
  console.log(
    `Processamento paralelo com até ${MAX_CONCURRENT_REQUESTS} requisições simultâneas\n`
  );

  // Processar imagens em paralelo com controle de concorrência
  const processImagePromises = files.map(async (imageInfo, index) => {
    console.log(
      `[INÍCIO] 📍 ${imageInfo.fileName} (${index + 1}/${files.length})`
    );
    if (imageInfo.relativePath !== imageInfo.fileName) {
      console.log(`    📂 Subpasta: ${path.dirname(imageInfo.relativePath)}`);
    }

    try {
      const { embedding, analysis } = await getImageEmbedding(
        imageInfo.filePath,
        cache
      );
      console.log(`[FIM] ✅ ${imageInfo.fileName} - Embedding gerado`);
      return { imageInfo, embedding, analysis, success: true };
    } catch (error: any) {
      console.error(`[FIM] ❌ ${imageInfo.fileName} - Erro: ${error.message}`);
      return { imageInfo, error, success: false };
    }
  });

  // Aguardar todas as promessas serem resolvidas
  const results = await Promise.all(processImagePromises);

  // Organizar resultados
  results.forEach((result) => {
    if (result.success && result.embedding && result.analysis) {
      embeddings[result.imageInfo.fileName] = {
        embedding: result.embedding,
        analysis: result.analysis,
        imageInfo: result.imageInfo, // Guardar informações completas do arquivo
      };
    }
  });

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `\n📊 Processamento ${folderName}: ${successful} sucesso, ${failed} falhas\n`
  );

  return embeddings;
}

/**
 * Compara imagens brancas com modelos e cria agrupamentos
 */
export async function compareAndGroup(
  embBranco: Record<string, EmbeddingData>,
  embModelo: Record<string, EmbeddingData>
): Promise<ProcessingStats> {
  console.log("\n═══════════════════════════════════════════");
  console.log("🔍 COMPARANDO E AGRUPANDO IMAGENS (PARALELO)");
  console.log("═══════════════════════════════════════════\n");

  const matchedModelo = new Set<string>(); // Rastrear imagens de modelo que foram pareadas
  const matchedModeloLock = new Set<string>(); // Lock para evitar concorrência na movimentação
  let notFoundCount = 0;
  let successfulMatches = 0;

  // Função para processar uma imagem branca com controle de concorrência
  const processImageComparison = async (
    fnameWhite: string,
    dataW: EmbeddingData,
    index: number,
    total: number
  ): Promise<ComparisonResult> => {
    console.log(
      `[${index + 1}/${total}] ✨ Iniciando comparação: ${fnameWhite}`
    );
    console.log(`   Análise: ${dataW.analysis.substring(0, 100)}...`);

    const sims = [];
    type SimilarityResult = {
      filename: string;
      score: number;
      analysis: string;
      imageInfo: ImageInfo;
    };

    // Calcular similaridade com todas as imagens de modelo
    for (const [fnameMod, dataM] of Object.entries(embModelo)) {
      // Pular imagens já pareadas ou em processamento
      if (matchedModelo.has(fnameMod) || matchedModeloLock.has(fnameMod))
        continue;

      const sim = cosineSimilarity(dataW.embedding, dataM.embedding);
      sims.push({
        filename: fnameMod,
        score: sim,
        analysis: dataM.analysis,
        imageInfo: dataM.imageInfo,
      });
    }

    // Ordenar por similaridade (maior primeiro)
    sims.sort((a, b) => b.score - a.score);
    const bestMatch = sims[0]; // pegar apenas o mais parecido
    const bestScore = bestMatch?.score || 0;

    if (bestScore >= MIN_SIMILARITY && bestMatch) {
      console.log(
        `   🎯 Candidato encontrado (${(bestScore * 100).toFixed(1)}%): ${
          bestMatch.filename
        }`
      );

      // Adicionar lock para evitar que outras imagens usem esta imagem de modelo
      matchedModeloLock.add(bestMatch.filename);

      try {
        // Verificação adicional usando comparação visual direta
        console.log(`   🔍 Verificação visual adicional...`);
        const isActuallySimilar = await verifySimilarity(
          dataW.imageInfo.filePath,
          bestMatch.imageInfo.filePath,
          bestScore
        );

        if (isActuallySimilar) {
          console.log(`   ✅ Match confirmado!`);
          const bar = "█".repeat(Math.round(bestScore * 20));
          console.log(
            `   [${bar.padEnd(20, "░")}] ${(bestScore * 100).toFixed(1)}% - ${
              bestMatch.filename
            }`
          );

          // Marcar como pareada permanentemente
          matchedModelo.add(bestMatch.filename);

          // Gerar nome da pasta de destino
          const destinationName = generateDestinationName(
            dataW.imageInfo,
            MOTHER_FOLDER,
            KEEP_ORIGINAL_NAMES
          );
          const folderPath = path.join(PATH_OUT, destinationName);
          await fs.mkdir(folderPath, { recursive: true });

          // COPIAR ou MOVER imagem branca
          await moveFile(
            dataW.imageInfo.filePath,
            path.join(folderPath, fnameWhite),
            COPY_FILES
          );

          // COPIAR ou MOVER apenas o melhor match
          await moveFile(
            bestMatch.imageInfo.filePath,
            path.join(folderPath, bestMatch.filename),
            COPY_FILES
          );

          // Salvar informações detalhadas
          const detailedData = {
            white_image: {
              filename: fnameWhite,
              relative_path: dataW.imageInfo.relativePath,
              analysis: dataW.analysis,
            },
            best_match: {
              filename: bestMatch.filename,
              relative_path: bestMatch.imageInfo.relativePath,
              similarity_score: bestScore,
              similarity_percentage: `${(bestScore * 100).toFixed(2)}%`,
              analysis: bestMatch.analysis,
            },
            verification: "visual_confirmed",
            destination_folder: destinationName,
            operation: COPY_FILES ? "copy" : "move",
          };

          await fs.writeFile(
            path.join(folderPath, "analysison"),
            JSON.stringify(detailedData, null, 2)
          );

          return { success: true, type: "match", filename: fnameWhite };
        } else {
          console.log(
            `   ❌ Verificação visual falhou - não são similares o suficiente`
          );
          console.log(`   📦 Movendo para not_found/${PATH_BRANCO}/`);

          // COPIAR ou MOVER para not_found
          await moveFile(
            dataW.imageInfo.filePath,
            path.join(PATH_NOT_FOUND, PATH_BRANCO, fnameWhite),
            COPY_FILES
          );

          // Salvar informações sobre por que não foi encontrado match
          const notFoundData = {
            filename: fnameWhite,
            relative_path: dataW.imageInfo.relativePath,
            analysis: dataW.analysis,
            reason: "visual_verification_failed",
            best_candidate: {
              filename: bestMatch.filename,
              relative_path: bestMatch.imageInfo.relativePath,
              score: bestScore,
              required_minimum: MIN_SIMILARITY,
            },
            operation: COPY_FILES ? "copy" : "move",
          };

          await fs.writeFile(
            path.join(
              PATH_NOT_FOUND,
              PATH_BRANCO,
              `${path.parse(fnameWhite).name}on`
            ),
            JSON.stringify(notFoundData, null, 2)
          );

          return {
            success: false,
            type: "verification_failed",
            filename: fnameWhite,
          };
        }
      } finally {
        // Remover lock após processamento
        matchedModeloLock.delete(bestMatch.filename);
      }
    } else {
      console.log(
        `   ❌ Nenhum match válido (melhor: ${(bestScore * 100).toFixed(
          1
        )}% < ${(MIN_SIMILARITY * 100).toFixed(0)}%)`
      );
      console.log(`   📦 Movendo para not_found/${PATH_BRANCO}/`);

      // COPIAR ou MOVER para not_found
      await moveFile(
        dataW.imageInfo.filePath,
        path.join(PATH_NOT_FOUND, PATH_BRANCO, fnameWhite),
        COPY_FILES
      );

      // Salvar informações sobre por que não foi encontrado match
      const notFoundData = {
        filename: fnameWhite,
        relative_path: dataW.imageInfo.relativePath,
        analysis: dataW.analysis,
        reason: "similarity_too_low",
        best_match: {
          filename: bestMatch?.filename || "none",
          score: bestScore,
          required_minimum: MIN_SIMILARITY,
        },
        operation: COPY_FILES ? "copy" : "move",
      };

      await fs.writeFile(
        path.join(
          PATH_NOT_FOUND,
          PATH_BRANCO,
          `${path.parse(fnameWhite).name}on`
        ),
        JSON.stringify(notFoundData, null, 2)
      );

      return {
        success: false,
        type: "similarity_too_low",
        filename: fnameWhite,
      };
    }
  };

  // Processar comparações em paralelo com controle de concorrência
  const comparisonPromises = Object.entries(embBranco).map(
    ([fnameWhite, dataW], index) =>
      processImageComparison(
        fnameWhite,
        dataW,
        index,
        Object.entries(embBranco).length
      )
  );

  // Aguardar todas as comparações
  const comparisonResults = await Promise.all(comparisonPromises);

  // Contabilizar resultados
  comparisonResults.forEach((result) => {
    if (result.success) {
      successfulMatches++;
    } else {
      notFoundCount++;
    }
  });

  console.log(
    `\n📊 Comparação finalizada: ${successfulMatches} matches, ${notFoundCount} sem match\n`
  );

  // Mover imagens de modelo não pareadas para not_found
  console.log("\n═══════════════════════════════════════════");
  console.log("🔍 VERIFICANDO IMAGENS NÃO PAREADAS");
  console.log("═══════════════════════════════════════════\n");

  let unpairedModelo = 0;
  for (const [fnameMod, dataM] of Object.entries(embModelo)) {
    if (!matchedModelo.has(fnameMod)) {
      console.log(`📦 ${fnameMod} - não pareada, movendo para not_found/`);

      // COPIAR ou MOVER para not_found
      await moveFile(
        dataM.imageInfo.filePath,
        path.join(PATH_NOT_FOUND, PATH_MODELO, fnameMod),
        COPY_FILES
      );

      // Salvar informação sobre a imagem não pareada
      const unpairedData = {
        filename: fnameMod,
        relative_path: dataM.imageInfo.relativePath,
        analysis: dataM.analysis,
        reason: "no_match_found",
        operation: COPY_FILES ? "copy" : "move",
      };

      await fs.writeFile(
        path.join(
          PATH_NOT_FOUND,
          PATH_MODELO,
          `${path.parse(fnameMod).name}on`
        ),
        JSON.stringify(unpairedData, null, 2)
      );

      unpairedModelo++;
    }
  }

  return {
    successfulMatches,
    notFoundCount,
    unpairedModelo,
  };
}

/**
 * Prepara as pastas de saída
 */
export async function prepareOutputFolders(): Promise<void> {
  // Verificar se as pastas de entrada existem
  if (!fsSync.existsSync(PATH_BRANCO)) {
    throw new Error(`Pasta não encontrada: ${PATH_BRANCO}`);
  }
  if (!fsSync.existsSync(PATH_MODELO)) {
    throw new Error(`Pasta não encontrada: ${PATH_MODELO}`);
  }

  // Criar pastas de saída
  if (!fsSync.existsSync(PATH_OUT)) {
    await fs.mkdir(PATH_OUT, { recursive: true });
  }
  if (!fsSync.existsSync(PATH_NOT_FOUND)) {
    await fs.mkdir(PATH_NOT_FOUND, { recursive: true });
    await fs.mkdir(path.join(PATH_NOT_FOUND, PATH_BRANCO), {
      recursive: true,
    });
    await fs.mkdir(path.join(PATH_NOT_FOUND, PATH_MODELO), {
      recursive: true,
    });
  }
}

/**
 * Exibe o resumo final do processamento
 */
export function displayFinalSummary(
  successfulMatches: number,
  notFoundCount: number,
  unpairedModelo: number
): void {
  console.log("\n═══════════════════════════════════════════");
  console.log("✅ PROCESSAMENTO CONCLUÍDO!");
  console.log("═══════════════════════════════════════════");
  console.log(`\n📊 Estatísticas:`);
  console.log(`   ✅ Matches bem-sucedidos: ${successfulMatches}`);
  console.log(`   ❌ Imagens brancas sem match: ${notFoundCount}`);
  console.log(`   📦 Imagens modelo não pareadas: ${unpairedModelo}`);
  console.log(`   📁 Total de grupos criados: ${successfulMatches}`);
  console.log(`\n📂 Pastas:`);
  console.log(`   ✅ Agrupamentos: ${PATH_OUT}/`);
  console.log(`   ❌ Não encontrados: ${PATH_NOT_FOUND}/`);
  console.log(`\n💡 Dicas:`);
  console.log(`   - Verifique 'analysison' em cada pasta para detalhes`);
  console.log(`   - Imagens em not_found/ possuem arquivos on explicativos`);
  console.log(
    `   - Ajuste MIN_SIMILARITY no código se necessário (atual: ${(
      MIN_SIMILARITY * 100
    ).toFixed(0)}%)\n`
  );
}
