import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {
  INPUT_DIR,
  OUTPUT_DIR,
  RECURSIVE_SEARCH,
  COUNTERS,
  COPY_FILES,
  DRY_RUN,
  KEEP_MOTHER_FOLDER,
  SIMPLE_MODE,
} from "../src/rename-config.js";
import {
  log,
  extractCode,
  identifyImageType,
  generateNewFileName,
  listImageFiles,
  moveFile,
  createReport,
  saveReport,
} from "../src/rename-utils.js";
import { updateCacheWithNewNames } from "../src/rename-processor.js";
import { analyzeImageType } from "../src/image-analyzer.js";
import { ProcessedImage, ImageType } from "../src/types.js";
import { initDatabase, EmbeddingCache } from "../src/cache.js";
import { getImageEmbedding } from "../src/utils.js";
import { cosineSimilarity } from "../src/imageProcessor.js";

/**
 * Função principal para processar e renomear imagens
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log(
    `🔄 RENOMEANDO E ORGANIZANDO IMAGENS (${
      SIMPLE_MODE ? "MODO SIMPLES - SEM IA" : "MODO COMPLETO - COM IA"
    })`
  );
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório de entrada: ${INPUT_DIR}`);
  console.log(`   - Diretório de saída: ${OUTPUT_DIR}`);
  console.log(`   - Busca recursiva: ${RECURSIVE_SEARCH ? "Sim" : "Não"}`);
  console.log(`   - Modo de simulação: ${DRY_RUN ? "Sim" : "Não"}`);
  console.log(`   - Manter pasta mãe: ${KEEP_MOTHER_FOLDER ? "Sim" : "Não"}`);
  console.log(`   - Modo simples (sem IA): ${SIMPLE_MODE ? "Sim" : "Não"}`);
  console.log(
    `   - Atualizar cache: ${!DRY_RUN && !SIMPLE_MODE ? "Sim" : "Não"}`
  );
  console.log(`   - Análise visual com IA: ${SIMPLE_MODE ? "Não" : "Sim"}\n`);

  const processedFiles: ProcessedImage[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  // Inicializar cache apenas no modo completo
  let cache: EmbeddingCache | null = null;
  if (!SIMPLE_MODE) {
    try {
      const db = await initDatabase();
      cache = new EmbeddingCache(db);
      console.log("✅ Cache inicializado\n");
    } catch (error) {
      console.log(
        `⚠️ Aviso: Cache não disponível: ${(error as Error).message}\n`
      );
    }
  } else {
    console.log("ℹ️ Modo simples: cache não será utilizado\n");
  }

  try {
    // Verificar se o diretório de entrada existe
    if (!fsSync.existsSync(INPUT_DIR)) {
      throw new Error(`Diretório de entrada não encontrado: ${INPUT_DIR}`);
    }

    // Criar diretório de saída se não existir
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Listar todos os arquivos de imagem
    log("info", `Procurando imagens em ${INPUT_DIR}...`);
    const imageFiles = await listImageFiles(INPUT_DIR, RECURSIVE_SEARCH);

    if (imageFiles.length === 0) {
      log("warn", "Nenhuma imagem encontrada!");
      return;
    }

    log("info", `Encontradas ${imageFiles.length} imagens para processar\n`);

    // Processar cada imagem
    for (let i = 0; i < imageFiles.length; i++) {
      const imageInfo = imageFiles[i];
      log(
        "info",
        `[${i + 1}/${imageFiles.length}] Processando: ${imageInfo.fileName}`
      );

      try {
        // Extrair código do nome do arquivo
        const code = extractCode(imageInfo.fileName);

        if (!code) {
          const error = `Não foi possível extrair código do arquivo: ${imageInfo.fileName}`;
          log("error", error);
          errors.push({ file: imageInfo.fileName, error });
          processedFiles.push({ ...imageInfo, success: false, error });
          continue;
        }

        log("debug", `   Código extraído: ${code}`);

        // Verificar duplicata por hash de conteúdo (antes de qualquer processamento)
        if (cache) {
          try {
            const duplicateCheck = await cache.checkDuplicateByContentHash(
              imageInfo.filePath
            );
            if (duplicateCheck && duplicateCheck.isDuplicate) {
              log(
                "info",
                `   ⏭️ Arquivo duplicado (mesmo hash): já processado como ${path.basename(
                  duplicateCheck.finalFile || duplicateCheck.existingFile || ""
                )}`
              );
              processedFiles.push({
                ...imageInfo,
                success: false,
                error: "Arquivo duplicado (mesmo conteúdo)",
                code,
              });
              continue;
            }
          } catch (error) {
            log(
              "warn",
              `   ⚠️ Erro ao verificar duplicata: ${(error as Error).message}`
            );
          }
        }

        // Criar caminho base de destino
        const motherFolderName = path.dirname(imageInfo.relativePath);
        let destFolder: string;

        if (motherFolderName && motherFolderName !== ".") {
          destFolder = path.join(OUTPUT_DIR, motherFolderName, code);
        } else {
          destFolder = path.join(OUTPUT_DIR, code);
        }

        // Verificação rápida: se a pasta de destino já tem arquivos, verificar os tipos comuns
        // Isso evita análise de IA desnecessária para arquivos já processados
        if (fsSync.existsSync(destFolder)) {
          const existingFiles = await fs.readdir(destFolder);
          const fileName = imageInfo.fileName.toLowerCase();

          // Verificar padrões comuns que indicam que este arquivo já foi processado
          const possibleNames = [
            `${code}.png`,
            `${code}.jpg`,
            `${code}.jpeg`, // MAIN_IMAGE
            `${code} - P.png`,
            `${code} - P.jpg`, // PRODUCT_ON_STONE
            `${code} - 1.png`,
            `${code} - 2.png`, // MAIN_IMAGE duplicadas
            `${code} - P - 1.png`,
            `${code} - P - 2.png`, // PRODUCT_ON_STONE duplicadas
          ];

          // Se é um arquivo _generated ou _nano_banana, verificar se já existe versão processada
          const isGenerated = fileName.includes("generated");
          const isNano =
            fileName.includes("nano") || fileName.includes("banana");

          let skipProcessing = false;

          if (isGenerated && !isNano) {
            // Arquivo generated (fundo branco) -> verifica se já existe MAIN_IMAGE
            skipProcessing = existingFiles.some(
              (f) =>
                f.toLowerCase() === `${code}.png` ||
                f.toLowerCase() === `${code}.jpg` ||
                f.toLowerCase().startsWith(`${code} - 1`)
            );
          } else if (isNano) {
            // Arquivo nano (pedra) -> verifica se já existe PRODUCT_ON_STONE
            skipProcessing = existingFiles.some((f) =>
              f.toLowerCase().startsWith(`${code} - p`)
            );
          }

          if (skipProcessing) {
            log(
              "info",
              `   ⏭️ Arquivo similar já processado, pulando análise de IA`
            );
            processedFiles.push({
              ...imageInfo,
              success: false,
              error: "Arquivo similar já processado",
              code,
            });
            continue;
          }
        }

        // Verificar se é uma imagem adicional da mesma peça (mesmo código, ângulo diferente)
        let isAdditionalAngle = false;
        if (fsSync.existsSync(destFolder)) {
          const existingFiles = await fs.readdir(destFolder);

          // Se já existe arquivo principal na pasta, verificar similaridade
          if (existingFiles.length > 0 && cache) {
            try {
              // Buscar embeddings das imagens existentes na pasta
              for (const existingFile of existingFiles) {
                const existingFilePath = path.join(destFolder, existingFile);
                const stats = await fs.stat(existingFilePath);

                if (stats.isFile()) {
                  const ext = path.extname(existingFile).toLowerCase();
                  if (
                    [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(
                      ext
                    )
                  ) {
                    // Verificar similaridade com a imagem existente
                    const existingEmbedding = await getImageEmbedding(
                      existingFilePath
                    );
                    const newEmbedding = await getImageEmbedding(
                      imageInfo.filePath
                    );
                    const similarity = cosineSimilarity(
                      existingEmbedding.embedding,
                      newEmbedding.embedding
                    );

                    log(
                      "debug",
                      `   Similaridade com ${existingFile}: ${(
                        similarity * 100
                      ).toFixed(1)}%`
                    );

                    // Se similaridade for alta (> 85%), considerar como ângulo adicional
                    if (similarity > 0.85) {
                      isAdditionalAngle = true;
                      log(
                        "info",
                        `   ✅ Imagem similar detectada (ângulo adicional): ${(
                          similarity * 100
                        ).toFixed(1)}%`
                      );
                      break;
                    }
                  }
                }
              }
            } catch (error) {
              log(
                "warn",
                `   ⚠️ Erro ao verificar similaridade: ${
                  (error as Error).message
                }`
              );
            }
          }
        }

        // Identificar tipo de imagem usando IA
        let imageType: ImageType;
        try {
          log("debug", `   🔍 Analisando visualmente com IA...`);
          const aiAnalysis = await analyzeImageType(
            imageInfo.filePath,
            imageInfo.fileName,
            cache || undefined
          );

          // Se detectamos que é um ângulo adicional, forçar o tipo como ADDITIONAL_PHOTO
          if (isAdditionalAngle) {
            imageType = "ADDITIONAL_PHOTO";
            log(
              "info",
              `   📸 Tipo forçado para ADDITIONAL_PHOTO (ângulo adicional detectado)`
            );
          } else {
            imageType =
              aiAnalysis.type === "VARIANT" ? aiAnalysis : aiAnalysis.type;
          }

          log(
            "debug",
            `   Tipo identificado pela IA: ${JSON.stringify(
              imageType
            )} (confiança: ${(aiAnalysis.confidence * 100).toFixed(0)}%)`
          );
          log("debug", `   Justificativa: ${aiAnalysis.reasoning}`);
        } catch (error) {
          log(
            "warn",
            `   ⚠️ Erro na análise IA, usando fallback: ${
              (error as Error).message
            }`
          );

          // Se detectamos que é um ângulo adicional, forçar o tipo mesmo no fallback
          if (isAdditionalAngle) {
            imageType = "ADDITIONAL_PHOTO";
            log(
              "info",
              `   📸 Tipo fallback forçado para ADDITIONAL_PHOTO (ângulo adicional detectado)`
            );
          } else {
            imageType = identifyImageType(
              imageInfo.fileName,
              imageInfo.filePath
            );
          }

          log(
            "debug",
            `   Tipo identificado (fallback): ${JSON.stringify(imageType)}`
          );
        }

        // Gerar novo nome do arquivo
        const newFileName = generateNewFileName(
          imageInfo.fileName,
          imageInfo.filePath,
          code,
          imageType,
          COUNTERS
        );

        log("debug", `   Novo nome: ${newFileName}`);
        log("info", `   Caminho relativo: ${imageInfo.relativePath}`);
        log("info", `   Pasta mãe detectada: "${motherFolderName}"`);
        log("info", `   Caminho completo do arquivo: ${imageInfo.filePath}`);
        log("info", `   Destino: ${destFolder}`);

        const destPath = path.join(destFolder, newFileName);

        // Verificar se o arquivo de destino já existe
        try {
          await fs.access(destPath);
          log(
            "info",
            `   ⚠️ Arquivo de destino já existe, pulando: ${newFileName}`
          );
          processedFiles.push({
            ...imageInfo,
            success: false,
            error: "Arquivo de destino já existe",
            code,
            imageType,
            newFileName,
            destinationPath: destPath,
          });
          continue;
        } catch (error) {
          // Arquivo não existe, podemos prosseguir
        }

        // Mover/copiar arquivo
        await moveFile(imageInfo.filePath, destPath, COPY_FILES);

        processedFiles.push({
          ...imageInfo,
          success: true,
          code,
          imageType,
          newFileName,
          destinationPath: destPath,
        });
      } catch (error) {
        const errorMsg = `Erro ao processar ${imageInfo.fileName}: ${
          (error as Error).message
        }`;
        log("error", errorMsg);
        errors.push({ file: imageInfo.fileName, error: errorMsg });
        processedFiles.push({ ...imageInfo, success: false, error: errorMsg });
      }
    }

    // Criar e salvar relatório
    const report = createReport(processedFiles, errors);
    await saveReport(report, path.join(OUTPUT_DIR, "rename-reporton"));

    // Atualizar cache com novos nomes (se não for modo de simulação)
    if (!DRY_RUN && processedFiles.some((f) => f.success)) {
      const cacheResult = await updateCacheWithNewNames(processedFiles);
      report.cacheUpdate = cacheResult;

      // Atualizar relatório com informações do cache
      await saveReport(report, path.join(OUTPUT_DIR, "rename-reporton"));
    }

    // Exibir resumo final
    const skippedCount = processedFiles.filter(
      (f) =>
        !f.success &&
        (f.error?.includes("já processado") || f.error?.includes("já existe"))
    ).length;

    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO!");
    console.log("═══════════════════════════════════════════");
    console.log(`\n📊 Estatísticas:`);
    console.log(`   ✅ Processados com sucesso: ${report.summary.success}`);
    console.log(`   ⏭️ Pulados (já processados): ${skippedCount}`);
    console.log(`   ❌ Falhas: ${report.summary.failed - skippedCount}`);
    console.log(
      `   📁 Pastas criadas: ${
        new Set(processedFiles.filter((f) => f.success).map((f) => f.code)).size
      }`
    );
    console.log(`\n📂 Diretórios:`);
    console.log(`   📥 Entrada: ${INPUT_DIR}`);
    console.log(`   📤 Saída: ${OUTPUT_DIR}`);
    console.log(
      `\n📄 Relatório detalhado: ${path.join(OUTPUT_DIR, "rename-reporton")}`
    );

    if (errors.length > 0) {
      console.log(`\n⚠️ Erros encontrados:`);
      errors.slice(0, 5).forEach((err) => {
        console.log(`   - ${err.file}: ${err.error}`);
      });
      if (errors.length > 5) {
        console.log(
          `   ... e mais ${errors.length - 5} erros (veja o relatório completo)`
        );
      }
    }
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O PROCESSAMENTO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);

    if ((error as any).code === "ENOENT") {
      console.error(
        "💡 Verifique se o diretório de entrada existe e contém imagens."
      );
    }

    process.exit(1);
  } finally {
    // Fechar cache
    if (cache) {
      cache.close();
    }
  }
}

// Executar o script
main();
