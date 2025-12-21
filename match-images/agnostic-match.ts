import {
  PATH_BASE,
  PATH_JOIN,
  PATH_OUT,
  PATH_NOT_FOUND,
  MIN_SIMILARITY,
  MAX_CONCURRENT_REQUESTS,
  REQUEST_DELAY,
  CACHE_DB,
  COPY_FILES,
  RECURSIVE_SEARCH,
  NAMING_PATTERN,
} from "./match-config.js";
import { initDatabase, EmbeddingCache } from "../src/cache.js";
import { Database } from "sqlite3";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { cosineSimilarity } from "../src/imageProcessor.js";
import { verifySimilarity } from "../src/openaiAPI.js";
import { moveFile, listImageFiles, getImageEmbedding } from "../src/utils.js";
import { ImageInfo, EmbeddingData } from "../src/types.js";

interface FolderEmbedding {
  folderName: string;
  folderPath: string;
  images: Record<string, EmbeddingData>;
}

interface MatchResult {
  joinImage: EmbeddingData;
  bestFolder: FolderEmbedding;
  bestMatch: EmbeddingData;
  similarity: number;
  newFileName: string;
}

/**
 * Gera nome do arquivo baseado no padrão configurável
 */
function generateFileName(folderName: string, counter: number): string {
  return NAMING_PATTERN.replace("[folder_name]", folderName)
    .replace("[M]", "M")
    .replace("[number]", counter.toString().padStart(3, "0"));
}

/**
 * Processa todas as pastas em BASE e gera embeddings para suas imagens
 */
async function processBaseFolders(
  cache: EmbeddingCache
): Promise<FolderEmbedding[]> {
  console.log("═══════════════════════════════════════════");
  console.log("📁 PROCESSANDO PASTAS BASE");
  console.log("═══════════════════════════════════════════\n");

  const folders: FolderEmbedding[] = [];

  if (!fsSync.existsSync(PATH_BASE)) {
    throw new Error(`Pasta base não encontrada: ${PATH_BASE}`);
  }

  const entries = await fs.readdir(PATH_BASE, { withFileTypes: true });
  const folderEntries = entries.filter((entry) => entry.isDirectory());

  if (folderEntries.length === 0) {
    throw new Error(`Nenhuma pasta encontrada em ${PATH_BASE}`);
  }

  console.log(
    `Encontradas ${folderEntries.length} pastas base para processar\n`
  );

  for (const folderEntry of folderEntries) {
    const folderPath = path.join(PATH_BASE, folderEntry.name);
    console.log(`📂 Processando pasta: ${folderEntry.name}`);

    try {
      const images = await listImageFiles(folderPath, RECURSIVE_SEARCH);

      if (images.length === 0) {
        console.log(`   ⚠️  Nenhuma imagem encontrada, pulando...`);
        continue;
      }

      console.log(`   📸 ${images.length} imagens encontradas`);

      const folderEmbeddings: Record<string, EmbeddingData> = {};

      // Processar imagens da pasta em paralelo
      const imagePromises = images.map(async (imageInfo, index) => {
        console.log(
          `   [${index + 1}/${images.length}] Processando: ${
            imageInfo.fileName
          }`
        );

        try {
          const { embedding, analysis } = await getImageEmbedding(
            imageInfo.filePath,
            cache
          );

          return {
            success: true,
            imageInfo,
            embedding,
            analysis,
          };
        } catch (error: any) {
          console.error(
            `   ❌ Erro ao processar ${imageInfo.fileName}: ${error.message}`
          );
          return { success: false, imageInfo };
        }
      });

      const results = await Promise.all(imagePromises);

      // Organizar resultados
      results.forEach((result) => {
        if (result.success && result.embedding && result.analysis) {
          folderEmbeddings[result.imageInfo.fileName] = {
            embedding: result.embedding,
            analysis: result.analysis,
            imageInfo: result.imageInfo,
          };
        }
      });

      const successful = results.filter((r) => r.success).length;
      console.log(
        `   ✅ ${successful}/${images.length} imagens processadas com sucesso\n`
      );

      if (Object.keys(folderEmbeddings).length > 0) {
        folders.push({
          folderName: folderEntry.name,
          folderPath,
          images: folderEmbeddings,
        });
      }
    } catch (error: any) {
      console.error(
        `   ❌ Erro ao processar pasta ${folderEntry.name}: ${error.message}\n`
      );
    }
  }

  console.log(`📊 Total de pastas base processadas: ${folders.length}\n`);
  return folders;
}

/**
 * Processa imagens da pasta JOIN
 */
async function processJoinImages(
  cache: EmbeddingCache
): Promise<Record<string, EmbeddingData>> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 PROCESSANDO IMAGENS JOIN");
  console.log("═══════════════════════════════════════════\n");

  if (!fsSync.existsSync(PATH_JOIN)) {
    throw new Error(`Pasta join não encontrada: ${PATH_JOIN}`);
  }

  const images = await listImageFiles(PATH_JOIN, RECURSIVE_SEARCH);

  if (images.length === 0) {
    throw new Error(`Nenhuma imagem encontrada em ${PATH_JOIN}`);
  }

  console.log(`📸 ${images.length} imagens para classificar\n`);

  const embeddings: Record<string, EmbeddingData> = {};

  // Processar imagens em paralelo
  const imagePromises = images.map(async (imageInfo, index) => {
    console.log(
      `[${index + 1}/${images.length}] Processando: ${imageInfo.fileName}`
    );

    try {
      const { embedding, analysis } = await getImageEmbedding(
        imageInfo.filePath,
        cache
      );

      return {
        success: true,
        imageInfo,
        embedding,
        analysis,
      };
    } catch (error: any) {
      console.error(
        `❌ Erro ao processar ${imageInfo.fileName}: ${error.message}`
      );
      return { success: false, imageInfo };
    }
  });

  const results = await Promise.all(imagePromises);

  // Organizar resultados
  results.forEach((result) => {
    if (result.success && result.embedding && result.analysis) {
      embeddings[result.imageInfo.fileName] = {
        embedding: result.embedding,
        analysis: result.analysis,
        imageInfo: result.imageInfo,
      };
    }
  });

  const successful = results.filter((r) => r.success).length;
  console.log(
    `\n📊 ${successful}/${images.length} imagens JOIN processadas com sucesso\n`
  );

  return embeddings;
}

/**
 * Encontra a melhor correspondência para uma imagem JOIN
 */
async function findBestMatch(
  joinImage: EmbeddingData,
  baseFolders: FolderEmbedding[]
): Promise<MatchResult | null> {
  let bestMatch: MatchResult | null = null;
  let bestSimilarity = 0;

  // Comparar com todas as imagens de todas as pastas base
  for (const folder of baseFolders) {
    for (const [imageName, baseImage] of Object.entries(folder.images)) {
      const similarity = cosineSimilarity(
        joinImage.embedding,
        baseImage.embedding
      );

      if (similarity > bestSimilarity && similarity >= MIN_SIMILARITY) {
        // Contar quantas imagens já existem nesta pasta de destino
        const outputFolderPath = path.join(PATH_OUT, folder.folderName);
        let counter = 1;

        if (fsSync.existsSync(outputFolderPath)) {
          const existingFiles = await fs.readdir(outputFolderPath);
          const imageFiles = existingFiles.filter((file) =>
            /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
          );
          counter = imageFiles.length + 1;
        }

        const newFileName = generateFileName(folder.folderName, counter);
        const fileExtension = path.extname(joinImage.imageInfo.fileName);

        bestMatch = {
          joinImage,
          bestFolder: folder,
          bestMatch: baseImage,
          similarity,
          newFileName: newFileName + fileExtension,
        };
        bestSimilarity = similarity;
      }
    }
  }

  return bestMatch;
}

/**
 * Executa o matching e organização das imagens
 */
async function executeMatching(
  joinImages: Record<string, EmbeddingData>,
  baseFolders: FolderEmbedding[]
): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🎯 EXECUTANDO MATCHING E ORGANIZAÇÃO");
  console.log("═══════════════════════════════════════════\n");

  let successfulMatches = 0;
  let notFoundCount = 0;

  // Preparar pastas de saída
  await fs.mkdir(PATH_OUT, { recursive: true });
  await fs.mkdir(PATH_NOT_FOUND, { recursive: true });

  const joinImageEntries = Object.entries(joinImages);

  for (const [fileName, joinImage] of joinImageEntries) {
    console.log(`🔍 Analisando: ${fileName}`);
    console.log(`   Descrição: ${joinImage.analysis.substring(0, 100)}...`);

    try {
      const match = await findBestMatch(joinImage, baseFolders);

      if (match) {
        console.log(
          `   🎯 Match encontrado (${(match.similarity * 100).toFixed(1)}%): ${
            match.bestFolder.folderName
          }`
        );

        // Verificação visual adicional
        console.log(`   🔍 Verificação visual...`);
        const isVisuallyConfirmed = await verifySimilarity(
          joinImage.imageInfo.filePath,
          match.bestMatch.imageInfo.filePath,
          match.similarity
        );

        if (isVisuallyConfirmed) {
          console.log(`   ✅ Match confirmado visualmente!`);

          // Criar pasta de destino
          const outputFolderPath = path.join(
            PATH_OUT,
            match.bestFolder.folderName
          );
          await fs.mkdir(outputFolderPath, { recursive: true });

          // Copiar/mover imagem com novo nome
          const destinationPath = path.join(
            outputFolderPath,
            match.newFileName
          );
          await moveFile(
            joinImage.imageInfo.filePath,
            destinationPath,
            COPY_FILES
          );

          // Salvar informações detalhadas
          const matchInfo = {
            original_filename: fileName,
            new_filename: match.newFileName,
            matched_folder: match.bestFolder.folderName,
            similarity_score: match.similarity,
            similarity_percentage: `${(match.similarity * 100).toFixed(2)}%`,
            join_image_analysis: joinImage.analysis,
            matched_image: {
              filename: Object.keys(match.bestFolder.images).find(
                (key) => match.bestFolder.images[key] === match.bestMatch
              ),
              analysis: match.bestMatch.analysis,
            },
            verification: "visual_confirmed",
            operation: COPY_FILES ? "copy" : "move",
            timestamp: new Date().toISOString(),
          };

          await fs.writeFile(
            path.join(
              outputFolderPath,
              `${path.parse(match.newFileName).name}_info.json`
            ),
            JSON.stringify(matchInfo, null, 2)
          );

          successfulMatches++;
          console.log(
            `   📁 Salvo como: ${match.bestFolder.folderName}/${match.newFileName}\n`
          );
        } else {
          console.log(`   ❌ Verificação visual falhou`);
          await moveToNotFound(
            joinImage,
            fileName,
            "visual_verification_failed",
            match
          );
          notFoundCount++;
        }
      } else {
        console.log(
          `   ❌ Nenhum match encontrado (similaridade < ${(
            MIN_SIMILARITY * 100
          ).toFixed(0)}%)`
        );
        await moveToNotFound(joinImage, fileName, "no_match_found");
        notFoundCount++;
      }
    } catch (error: any) {
      console.error(`   ❌ Erro ao processar ${fileName}: ${error.message}`);
      await moveToNotFound(
        joinImage,
        fileName,
        "processing_error",
        undefined,
        error.message
      );
      notFoundCount++;
    }
  }

  // Exibir resumo final
  console.log("\n═══════════════════════════════════════════");
  console.log("✅ MATCHING CONCLUÍDO!");
  console.log("═══════════════════════════════════════════");
  console.log(`\n📊 Estatísticas:`);
  console.log(`   ✅ Matches bem-sucedidos: ${successfulMatches}`);
  console.log(`   ❌ Imagens sem match: ${notFoundCount}`);
  console.log(`   📁 Total processado: ${joinImageEntries.length}`);
  console.log(`\n📂 Resultados:`);
  console.log(`   ✅ Organizadas: ${PATH_OUT}/`);
  console.log(`   ❌ Não classificadas: ${PATH_NOT_FOUND}/`);
  console.log(`\n💡 Padrão de nomenclatura: ${NAMING_PATTERN}`);
}

/**
 * Move imagem para pasta not_found com informações detalhadas
 */
async function moveToNotFound(
  joinImage: EmbeddingData,
  fileName: string,
  reason: string,
  failedMatch?: MatchResult,
  errorMessage?: string
): Promise<void> {
  const notFoundPath = path.join(PATH_NOT_FOUND, fileName);
  await moveFile(joinImage.imageInfo.filePath, notFoundPath, COPY_FILES);

  const notFoundInfo = {
    original_filename: fileName,
    reason,
    join_image_analysis: joinImage.analysis,
    failed_match: failedMatch
      ? {
          folder: failedMatch.bestFolder.folderName,
          similarity: failedMatch.similarity,
          required_minimum: MIN_SIMILARITY,
        }
      : undefined,
    error_message: errorMessage,
    operation: COPY_FILES ? "copy" : "move",
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(PATH_NOT_FOUND, `${path.parse(fileName).name}_info.json`),
    JSON.stringify(notFoundInfo, null, 2)
  );
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  let db: Database | null = null;
  let cache: EmbeddingCache | null = null;

  try {
    console.log("🚀 INICIANDO MATCHING AGNÓSTICO DE IMAGENS\n");
    console.log(`⚙️  Configurações:`);
    console.log(`   - Pasta BASE (destinos): ${PATH_BASE}`);
    console.log(`   - Pasta JOIN (origem): ${PATH_JOIN}`);
    console.log(`   - Pasta saída: ${PATH_OUT}`);
    console.log(
      `   - Similaridade mínima: ${(MIN_SIMILARITY * 100).toFixed(0)}%`
    );
    console.log(`   - Padrão de nome: ${NAMING_PATTERN}`);
    console.log(`   - Requisições simultâneas: ${MAX_CONCURRENT_REQUESTS}`);
    console.log(`   - Cache SQLite: ${CACHE_DB}`);
    console.log(`   - Copiar arquivos: ${COPY_FILES ? "Sim" : "Não (mover)"}`);
    console.log(`   - Busca recursiva: ${RECURSIVE_SEARCH ? "Sim" : "Não"}\n`);

    // Inicializar cache
    console.log("💾 Inicializando cache...");
    db = await initDatabase();
    cache = new EmbeddingCache(db);

    // 1. Processar pastas base
    const baseFolders = await processBaseFolders(cache);

    if (baseFolders.length === 0) {
      throw new Error("Nenhuma pasta base válida encontrada");
    }

    // 2. Processar imagens join
    const joinImages = await processJoinImages(cache);

    if (Object.keys(joinImages).length === 0) {
      throw new Error("Nenhuma imagem join válida encontrada");
    }

    // 3. Executar matching
    await executeMatching(joinImages, baseFolders);
  } catch (error: any) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O PROCESSAMENTO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${error.message}\n`);

    if (error.code === "ENOENT") {
      console.error(
        "💡 Verifique se as pastas BASE e JOIN existem e contêm imagens."
      );
    }

    process.exit(1);
  } finally {
    // Fechar conexão com o banco de dados
    if (cache) {
      cache.close();
    }
  }
}

// Executar o script
main();
