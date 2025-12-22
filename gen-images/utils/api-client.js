// api-client.js
// Cliente para API do Segmind e UploadThing

import fs from "fs";
import path from "path";
import { UTApi } from "uploadthing/server";
import { config } from "./config.js";
import { logger } from "./logger.js";

// Inicializa o UTApi
const utapi = new UTApi({
  token: config.uploadthingToken,
});

// Rate limiting simples
let lastRequestTime = 0;
const requestQueue = [];
let activeRequests = 0;

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < config.rateLimitDelay) {
    const waitTime = config.rateLimitDelay - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  // Aguarda se há muitas requisições simultâneas
  while (activeRequests >= config.rateLimitMaxConcurrent) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  activeRequests++;
  lastRequestTime = Date.now();
}

function releaseRateLimit() {
  activeRequests = Math.max(0, activeRequests - 1);
}

// Faz upload de imagem para o UploadThing
export async function uploadToUploadThing(imagePath) {
  await waitForRateLimit();

  try {
    const fileName = path.basename(imagePath);
    const fileBuffer = fs.readFileSync(imagePath);

    // Detecta o tipo MIME baseado na extensão
    const ext = path.extname(imagePath).toLowerCase();
    let contentType = "image/jpeg";
    if (ext === ".png") {
      contentType = "image/png";
    } else if (ext === ".jpg" || ext === ".jpeg") {
      contentType = "image/jpeg";
    }

    logger.debug(
      `Fazendo upload: ${fileName} (${fileBuffer.length} bytes, ${contentType})`
    );

    // Cria um File object a partir do buffer
    const file = new File([fileBuffer], fileName, { type: contentType });

    // Faz o upload usando UTApi
    const response = await utapi.uploadFiles(file);

    // Verifica se houve erro
    if (response.error) {
      const errorMessage =
        response.error.message || JSON.stringify(response.error);

      // Detecta erro específico de cota de armazenamento excedida
      if (
        errorMessage.includes("Storage quota exceeded") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("quota")
      ) {
        throw new Error(
          `Cota de armazenamento do UploadThing excedida. ` +
            `Por favor, libere espaço ou atualize seu plano. ` +
            `Arquivo: ${fileName}`
        );
      }

      throw new Error(`Erro no upload: ${errorMessage}`);
    }

    // uploadFiles retorna um array, mesmo para um único arquivo
    const uploadedFile = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    // Pega a URL pública do arquivo
    const publicUrl = uploadedFile.ufsUrl || uploadedFile.url;

    if (!publicUrl) {
      throw new Error("URL não encontrada na resposta do upload");
    }

    logger.debug(`Upload concluído: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    const errorMsg = error.message || String(error);

    // Verifica se o erro contém informação sobre cota excedida
    if (
      errorMsg.includes("Storage quota exceeded") ||
      errorMsg.includes("quota exceeded") ||
      errorMsg.includes("quota")
    ) {
      logger.error(
        `❌ COTA DE ARMAZENAMENTO EXCEDIDA: ${path.basename(imagePath)}\n` +
          `   A conta do UploadThing atingiu o limite de armazenamento.\n` +
          `   Ação necessária: Libere espaço ou atualize o plano do UploadThing.`
      );
    } else {
      logger.error(
        `Erro ao fazer upload de ${path.basename(imagePath)}: ${errorMsg}`
      );
    }

    throw error;
  } finally {
    releaseRateLimit();
  }
}

// Baixa imagem de uma URL
export async function downloadImageFromUrl(imageUrl, outputPath) {
  logger.debug(`Baixando imagem de: ${imageUrl}`);

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(
      `Erro ao baixar imagem: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuf = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuf);

  logger.debug(`Imagem baixada: ${imageBuffer.length} bytes`);
  logger.debug(`Content-Type: ${response.headers.get("content-type")}`);

  // Verifica se é uma imagem válida pelos primeiros bytes
  const firstBytes = imageBuffer.slice(0, 4);
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
  }

  const finalPath =
    outputPath.endsWith(".png") || outputPath.endsWith(".jpg")
      ? outputPath
      : `${outputPath}.${ext}`;

  fs.writeFileSync(finalPath, imageBuffer);

  const savedFileSize = fs.statSync(finalPath).size;
  logger.debug(`Imagem salva: ${finalPath} (${savedFileSize} bytes)`);

  return finalPath;
}

// Faz polling do status da requisição
export async function pollRequestStatus(
  pollUrl,
  requestId,
  maxAttempts = null,
  intervalMs = null
) {
  maxAttempts = maxAttempts || config.maxPollAttempts;
  intervalMs = intervalMs || config.pollInterval;

  logger.debug(`Iniciando polling do request_id: ${requestId}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.debug(`Tentativa ${attempt}/${maxAttempts} - Verificando status...`);

    try {
      const response = await fetch(pollUrl, {
        method: "GET",
        headers: {
          "x-api-key": config.apiKey,
        },
      });

      if (!response.ok) {
        logger.warn(
          `Erro ao fazer polling (tentativa ${attempt}): ${response.status} ${response.statusText}`
        );
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      const result = await response.json();
      logger.debug(`Status recebido: ${result.status}`);

      if (result.status === "COMPLETED" || result.status === "completed") {
        logger.info("Processamento concluído!");

        const imageUrl =
          result.image_url || result.url || result.output || result.image;

        if (!imageUrl) {
          logger.error("Resposta completa:", JSON.stringify(result, null, 2));
          throw new Error("URL da imagem não encontrada na resposta da API");
        }

        return imageUrl;
      } else if (
        result.status === "FAILED" ||
        result.status === "failed" ||
        result.status === "ERROR"
      ) {
        const errorMsg = result.error || result.message || "Erro desconhecido";
        throw new Error(`Processamento falhou: ${errorMsg}`);
      } else if (
        result.status === "QUEUED" ||
        result.status === "queued" ||
        result.status === "PROCESSING" ||
        result.status === "processing"
      ) {
        logger.debug(
          `Status: ${result.status} - Aguardando ${intervalMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } else {
        logger.debug(
          `Status desconhecido: ${result.status} - Aguardando ${
            intervalMs / 1000
          }s...`
        );
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    } catch (error) {
      logger.warn(
        `Erro durante polling (tentativa ${attempt}): ${error.message}`
      );

      if (attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Timeout: Processamento não foi concluído após ${
      (maxAttempts * intervalMs) / 1000
    }s`
  );
}

// Faz requisição para a API do Segmind
export async function requestSegmindAPI(payload) {
  await waitForRateLimit();

  try {
    const TIMEOUT_MS = config.requestTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    logger.debug("Enviando requisição para a API...");

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let cleanError = text;
      if (text.includes("iVBORw0KGgo") || text.includes("data:image/")) {
        cleanError = "Erro contém dados de imagem (base64)";
      } else if (text.length > 100) {
        cleanError = text.substring(0, 100) + "...";
      }

      if (response.status === 406) {
        cleanError = "Créditos insuficientes na conta da API";
      }

      throw new Error(
        `API retorna erro: ${response.status} ${response.statusText} - ${cleanError}`
      );
    }

    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Timeout: A API não respondeu em ${
          config.requestTimeout / 1000
        }s na requisição inicial.`
      );
    }
    throw error;
  } finally {
    releaseRateLimit();
  }
}
