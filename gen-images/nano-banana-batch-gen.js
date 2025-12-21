// nano-banana-batch-gen.js
// Node.js puro (COM dependência do UploadThing SDK para uploads corretos)
// Requer Node >= 18 para fetch + streams etc.
// Script para processar imagens usando a API Nano Banana do Segmind

import fs from "fs";
import path from "path";
import { config, ensureDirectories } from "./utils/config.js";
import { logger } from "./utils/logger.js";
import { parseArgs } from "./utils/args-parser.js";
import { getAllImageFiles, getExpectedOutputPath } from "./utils/file-utils.js";
import {
  loadCache,
  saveCache,
  backupCache,
  isAlreadyProcessed,
  markAsProcessed,
  markAsError,
  clearCache,
  getCacheStats,
} from "./utils/cache.js";
import { validateEnvironment } from "./utils/validators.js";
import { Metrics } from "./utils/metrics.js";
import {
  uploadToUploadThing,
  downloadImageFromUrl,
  pollRequestStatus,
  requestSegmindAPI,
} from "./utils/api-client.js";
import {
  loadStaticImages,
  loadStaticImagesFromDir,
} from "./utils/static-images.js";

// Variável global para controle de interrupção
let isShuttingDown = false;
let cacheSaveCounter = 0;

// Tratamento de sinais de interrupção
function setupSignalHandlers(cache) {
  const gracefulShutdown = async (signal) => {
    if (isShuttingDown) {
      logger.warn("Interrupção forçada, encerrando imediatamente...");
      process.exit(1);
    }

    isShuttingDown = true;
    logger.warn(
      `Recebido sinal ${signal}, salvando estado e encerrando graciosamente...`
    );

    try {
      saveCache(cache);
      backupCache();
      logger.info("Estado salvo com sucesso");
    } catch (error) {
      logger.error(`Erro ao salvar estado: ${error.message}`);
    }

    logger.close();
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  // Tratamento de erros não capturados
  process.on("unhandledRejection", (reason, promise) => {
    logger.error(`Unhandled Rejection: ${reason}`);
  });

  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    saveCache(cache);
    backupCache();
    logger.close();
    process.exit(1);
  });
}

// Função que processa uma imagem
async function processImage(
  fileInfo,
  globalStaticImages,
  cache,
  suffix,
  force,
  metrics
) {
  const { relativePath, fullPath, fileName } = fileInfo;

  if (isShuttingDown) {
    return;
  }

  if (!fs.existsSync(fullPath)) {
    logger.warn(
      `Arquivo ${relativePath} já foi processado ou removido, pulando...`
    );
    return;
  }

  // Verifica se já foi processado (cache + verificação de arquivo)
  if (isAlreadyProcessed(fileInfo, suffix, force, cache)) {
    logger.info(`Imagem ${relativePath} já foi processada, pulando...`);
    metrics.incrementSkipped();
    return;
  }

  try {
    metrics.incrementProcessed();

    // Busca imagens estáticas na subpasta específica desta imagem
    const imageDir = path.dirname(fullPath);
    const localStaticImages = await loadStaticImagesFromDir(imageDir, false);

    // Combina imagens estáticas: globais (raiz) + locais (subpasta) + imagem principal
    const allStaticImages = [...globalStaticImages, ...localStaticImages];

    logger.debug(
      `Estáticas para ${relativePath}: ${globalStaticImages.length} global(is) + ${localStaticImages.length} local(is) = ${allStaticImages.length} total`
    );

    // Faz upload da imagem principal para o UploadThing
    logger.info(`Fazendo upload de ${relativePath} para UploadThing...`);
    const mainImageUrl = await uploadToUploadThing(fullPath);
    logger.info(
      `Imagem principal carregada: ${relativePath} -> ${mainImageUrl}`
    );

    // Monta o array de imagens: imagens estáticas (globais + locais) + imagem principal
    const allImages = [...allStaticImages, mainImageUrl];

    // Verifica se todas as URLs são válidas
    for (const url of allImages) {
      if (!url || !url.startsWith("http")) {
        throw new Error(`URL inválida: ${url}`);
      }
    }

    // Monta o payload da requisição
    const payload = {
      prompt: config.defaultPrompt,
      image_urls: allImages,
    };

    logger.debug("Payload enviado:", {
      prompt: config.defaultPrompt,
      image_urls_count: allImages.length,
    });

    // Faz requisição para a API
    const response = await requestSegmindAPI(payload);

    // Tenta primeiro interpretar como JSON (resposta assíncrona)
    const contentType = response.headers.get("content-type") || "";
    let imageUrl;

    if (contentType.includes("application/json")) {
      logger.debug("Resposta da API é JSON (modo assíncrono)");
      const jsonResponse = await response.json();
      logger.debug("Resposta JSON:", jsonResponse);

      // Verifica se temos um poll_url (API assíncrona)
      if (jsonResponse.poll_url || jsonResponse.request_id) {
        const pollUrl = jsonResponse.poll_url;
        const requestId = jsonResponse.request_id;

        if (!pollUrl) {
          throw new Error("API retornou request_id mas não poll_url");
        }

        // Faz polling até obter a imagem
        imageUrl = await pollRequestStatus(pollUrl, requestId);
      } else {
        // Se não tem poll_url, pode ser que a imagem já esteja pronta
        imageUrl =
          jsonResponse.image_url ||
          jsonResponse.url ||
          jsonResponse.output ||
          jsonResponse.image;

        if (!imageUrl) {
          throw new Error(
            "Resposta JSON não contém poll_url nem URL da imagem"
          );
        }

        logger.info("Imagem já pronta (URL retornada diretamente)");
      }
    } else {
      // Se não for JSON, assume que é a imagem binária diretamente (modo síncrono - raro)
      logger.debug("Resposta da API é binária (modo síncrono)");
      const arrayBuf = await response.arrayBuffer();
      const resultBuffer = Buffer.from(arrayBuf);

      // Verifica se é uma imagem válida pelos primeiros bytes
      const firstBytes = resultBuffer.slice(0, 4);
      const isJPEG = firstBytes[0] === 0xff && firstBytes[1] === 0xd8;
      const isPNG =
        firstBytes[0] === 0x89 &&
        firstBytes[1] === 0x50 &&
        firstBytes[2] === 0x4e &&
        firstBytes[3] === 0x47;

      // Decide extensão baseada nos bytes da imagem
      let ext = "jpg";
      if (isPNG) {
        ext = "png";
      } else if (isJPEG) {
        ext = "jpg";
      } else {
        const ct = response.headers.get("content-type");
        if (ct) {
          if (ct.includes("jpeg") || ct.includes("jpg")) ext = "jpg";
          else if (ct.includes("png")) ext = "png";
        }
      }

      const baseName = path.parse(fileName).name;
      const suffixPart = suffix
        ? suffix.startsWith("-")
          ? ` - ${suffix.slice(1)}`
          : ` - ${suffix}`
        : "";

      // Cria a estrutura de pastas em output baseada no caminho relativo
      const relativeDir = path.dirname(relativePath);
      const outputSubDir =
        relativeDir !== "."
          ? path.join(config.outputDir, relativeDir)
          : config.outputDir;

      // Garante que a pasta de saída existe
      if (!fs.existsSync(outputSubDir)) {
        fs.mkdirSync(outputSubDir, { recursive: true });
      }

      let outputName = `${baseName}${suffixPart}.${ext}`;
      let outputPath = path.join(outputSubDir, outputName);

      // Verifica se já existe um arquivo com o mesmo nome
      let counter = 2;
      while (fs.existsSync(outputPath)) {
        outputName = `${baseName}${suffixPart}(${counter}).${ext}`;
        outputPath = path.join(outputSubDir, outputName);
        counter++;
      }

      fs.writeFileSync(outputPath, resultBuffer);

      const savedFileSize = fs.statSync(outputPath).size;
      logger.info(
        `Gerado: ${path.relative(
          config.outputDir,
          outputPath
        )} (${savedFileSize} bytes)`
      );

      // Marca como processado no cache
      markAsProcessed(fileInfo, outputPath, cache);
      cacheSaveCounter++;

      // Faz backup periódico do cache
      if (cacheSaveCounter >= config.cacheBackupInterval) {
        backupCache();
        cacheSaveCounter = 0;
      }

      metrics.incrementSuccessful();
      logger.info(`Imagem original mantida: ${relativePath}`);
      return;
    }

    // Processa URL retornada (modo assíncrono)
    const baseName = path.parse(fileName).name;
    const suffixPart = suffix
      ? suffix.startsWith("-")
        ? ` - ${suffix.slice(1)}`
        : ` - ${suffix}`
      : "";

    // Cria a estrutura de pastas em output baseada no caminho relativo
    const relativeDir = path.dirname(relativePath);
    const outputSubDir =
      relativeDir !== "."
        ? path.join(config.outputDir, relativeDir)
        : config.outputDir;

    // Garante que a pasta de saída existe
    if (!fs.existsSync(outputSubDir)) {
      fs.mkdirSync(outputSubDir, { recursive: true });
    }

    let outputName = `${baseName}${suffixPart}`;
    let outputPath = path.join(outputSubDir, outputName);

    await downloadImageFromUrl(imageUrl, outputPath);

    // Marca como processado no cache
    markAsProcessed(fileInfo, outputPath, cache);
    cacheSaveCounter++;

    // Faz backup periódico do cache
    if (cacheSaveCounter >= config.cacheBackupInterval) {
      backupCache();
      cacheSaveCounter = 0;
    }

    metrics.incrementSuccessful();
    logger.info(`Imagem original mantida: ${relativePath}`);
  } catch (error) {
    metrics.incrementError();
    const errorMessage = error?.message || error;
    let cleanError = errorMessage;
    if (typeof errorMessage === "string") {
      if (
        errorMessage.includes("iVBORw0KGgo") ||
        errorMessage.includes("data:image/")
      ) {
        cleanError = "Erro contém dados de imagem (base64)";
      } else if (errorMessage.length > 100) {
        cleanError = errorMessage.substring(0, 100) + "...";
      }
    }

    markAsError(fileInfo, cleanError, cache);
    logger.error(`Erro no arquivo ${relativePath}: ${cleanError}`);
    throw error;
  }
}

// Comando de status
function showStatus() {
  logger.info("📊 Status do processamento:");
  const cache = loadCache();
  const stats = getCacheStats(cache);

  logger.info(`  Total no cache: ${stats.total}`);
  logger.info(`  Concluídos: ${stats.completed}`);
  logger.info(`  Erros: ${stats.errors}`);
  logger.info(`  Processando: ${stats.processing}`);

  if (stats.total > 0) {
    const successRate = Math.round((stats.completed / stats.total) * 100);
    logger.info(`  Taxa de sucesso: ${successRate}%`);
  }
}

// Comando de limpeza
async function clean() {
  logger.info("🧹 Limpando cache e arquivos de saída...");

  // Limpa cache
  try {
    clearCache();
    logger.info("✅ Cache limpo");
  } catch (error) {
    logger.error(`❌ Erro ao limpar cache: ${error.message}`);
  }

  // Opcional: limpar arquivos de saída
  logger.warn(
    "⚠️  Arquivos de saída não foram removidos. Use com cuidado se necessário."
  );
}

// Função de execução principal
async function run() {
  // Parseia argumentos
  const args = parseArgs();

  // Configura nível de log
  if (args.debug) {
    logger.setLevel("DEBUG");
  }

  // Comandos especiais
  if (args.status) {
    showStatus();
    return;
  }

  if (args.clean) {
    await clean();
    return;
  }

  // Garante diretórios necessários
  ensureDirectories();

  // Valida ambiente
  const envValid = await validateEnvironment();
  if (!envValid) {
    logger.warn("Algumas validações falharam, mas continuando...");
  }

  // Inicializa métricas
  const metrics = new Metrics();

  // Carrega cache
  logger.info("Carregando cache de processamento...");
  const cache = loadCache();
  const cacheStats = getCacheStats(cache);
  logger.info(
    `Cache carregado: ${cacheStats.completed} imagem(ns) já processada(s)`
  );

  // Configura handlers de interrupção
  setupSignalHandlers(cache);

  if (args.force) {
    logger.warn("Modo --force ativado: todas as imagens serão reprocessadas");
  }

  // Carrega imagens estáticas globais (raiz)
  logger.info("Carregando imagens estáticas globais (raiz)...");
  const globalStaticImages = await loadStaticImages();
  logger.info(
    `${globalStaticImages.length} imagem(ns) estática(s) global(is) carregada(s)`
  );

  // Busca recursivamente todas as imagens nas subpastas
  logger.info("Buscando imagens recursivamente em todas as subpastas...");
  const allImageFiles = getAllImageFiles(config.inputDir, config.inputDir);
  const totalFiles = allImageFiles.length;

  if (totalFiles === 0) {
    logger.info(
      "Nenhuma imagem encontrada na pasta input e subpastas (excluindo imagens estáticas)."
    );
    return;
  }

  metrics.setTotalFiles(totalFiles);
  logger.info(`Total de arquivos para processar: ${totalFiles}`);

  // Processa em lotes até não haver mais arquivos
  while (true) {
    if (isShuttingDown) {
      logger.warn("Interrupção detectada, parando processamento...");
      break;
    }

    // Busca novamente para pegar arquivos atualizados
    const currentImageFiles = getAllImageFiles(
      config.inputDir,
      config.inputDir
    );

    if (currentImageFiles.length === 0) {
      break;
    }

    const batch = currentImageFiles.slice(0, config.batchSize);
    const batchNumber = Math.floor(metrics.processed / config.batchSize) + 1;

    logger.info(
      `Processando batch ${batchNumber} (${batch.length} arquivos)...`
    );

    const results = await Promise.allSettled(
      batch.map((fileInfo) =>
        processImage(
          fileInfo,
          globalStaticImages,
          cache,
          args.suffix,
          args.force,
          metrics
        )
      )
    );

    let successCount = 0;
    let errorCount = 0;

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        successCount++;
      } else {
        errorCount++;
      }
    });

    logger.info(
      `Batch ${batchNumber} concluído: ${successCount} sucessos, ${errorCount} erros`
    );

    // Log de progresso com métricas
    metrics.logProgress();

    // Faz backup periódico do cache
    if (cacheSaveCounter >= config.cacheBackupInterval) {
      backupCache();
      cacheSaveCounter = 0;
    }
  }

  // Salva cache final e faz backup
  saveCache(cache);
  backupCache();

  // Mostra resumo final
  metrics.logSummary();

  logger.info("🎉 Processamento concluído!");
  logger.info("Imagens estáticas permanecem na pasta input para uso futuro.");

  logger.close();
}

// Executa o script
run().catch((err) => {
  logger.error(`Erro geral: ${err.message}`);
  logger.error(err.stack);
  logger.close();
  process.exit(1);
});
