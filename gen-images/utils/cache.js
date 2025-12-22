// cache.js
// Gerenciamento de cache de processamento

import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { calculateFileHash, getExpectedOutputPath } from "./file-utils.js";

// Carrega cache de processamento
export function loadCache() {
  if (!fs.existsSync(config.cacheFilePath)) {
    return {};
  }

  try {
    const cacheData = fs.readFileSync(config.cacheFilePath, "utf-8");
    return JSON.parse(cacheData);
  } catch (error) {
    logger.warn(`Erro ao carregar cache: ${error.message}. Iniciando cache vazio.`);
    return {};
  }
}

// Salva cache de processamento
export function saveCache(cache) {
  try {
    fs.writeFileSync(
      config.cacheFilePath,
      JSON.stringify(cache, null, 2),
      "utf-8"
    );
  } catch (error) {
    logger.error(`Erro ao salvar cache: ${error.message}`);
  }
}

// Faz backup do cache
export function backupCache() {
  try {
    if (!fs.existsSync(config.cacheFilePath)) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFileName = `cache-backup-${timestamp}.json`;
    const backupPath = path.join(config.cacheBackupDir, backupFileName);

    fs.copyFileSync(config.cacheFilePath, backupPath);

    // Remove backups antigos (mantém apenas os mais recentes)
    const backups = fs
      .readdirSync(config.cacheBackupDir)
      .filter((f) => f.startsWith("cache-backup-"))
      .map((f) => ({
        name: f,
        path: path.join(config.cacheBackupDir, f),
        time: fs.statSync(path.join(config.cacheBackupDir, f)).mtime,
      }))
      .sort((a, b) => b.time - a.time);

    // Remove backups além do limite
    if (backups.length > config.maxCacheBackups) {
      backups.slice(config.maxCacheBackups).forEach((backup) => {
        fs.unlinkSync(backup.path);
      });
    }

    logger.debug(`Backup do cache criado: ${backupFileName}`);
  } catch (error) {
    logger.warn(`Erro ao fazer backup do cache: ${error.message}`);
  }
}

// Busca qualquer arquivo de saída existente para um arquivo original, independente do sufixo
function findAnyOutputFile(fileInfo) {
  const { relativePath, fileName } = fileInfo;
  const baseName = path.parse(fileName).name;
  const relativeDir = path.dirname(relativePath);
  const outputSubDir =
    relativeDir !== "." ? path.join(config.outputDir, relativeDir) : config.outputDir;

  // Se a pasta de saída não existe, não há arquivo de saída
  if (!fs.existsSync(outputSubDir)) {
    return null;
  }

  // Lista todos os arquivos na pasta de saída
  const files = fs.readdirSync(outputSubDir);

  // Procura por arquivos que começam com o nome base seguido de " - " (padrão do sufixo)
  // Exemplos: "123 - P.png", "123 - M.png", "123 - P(2).png"
  const extensions = [".png", ".jpg", ".jpeg"];

  for (const file of files) {
    // Verifica se o arquivo começa com o nome base seguido de " - "
    if (file.startsWith(baseName + " - ")) {
      // Verifica se tem uma extensão válida
      const ext = path.extname(file).toLowerCase();
      if (extensions.includes(ext)) {
        const outputPath = path.join(outputSubDir, file);
        if (fs.existsSync(outputPath)) {
          return outputPath;
        }
      }
    }
  }

  return null;
}

// Verifica se imagem já foi processada
export function isAlreadyProcessed(fileInfo, suffix, force, cache) {
  if (force) {
    return false; // Força reprocessamento
  }

  const { relativePath, fullPath } = fileInfo;
  const cacheKey = relativePath;

  // Verifica no cache
  if (cache[cacheKey]) {
    const cacheEntry = cache[cacheKey];

    // Se está marcado como concluído
    if (cacheEntry.status === "completed") {
      // Verifica se existe QUALQUER arquivo de saída (independente do sufixo)
      const anyOutputFile = findAnyOutputFile(fileInfo);
      if (anyOutputFile && fs.existsSync(anyOutputFile)) {
        // Verifica se a imagem original não mudou (comparando hash)
        try {
          const currentHash = calculateFileHash(fullPath);
          if (cacheEntry.fileHash === currentHash) {
            return true; // Já processado e arquivo ainda existe
          } else {
            logger.info(
              `Imagem ${relativePath} foi modificada, será reprocessada.`
            );
            return false; // Arquivo mudou, precisa reprocessar
          }
        } catch (error) {
          // Se não conseguir calcular hash, assume que precisa reprocessar
          return false;
        }
      } else {
        // Arquivo de saída não existe mais, remove do cache
        delete cache[cacheKey];
        saveCache(cache);
        return false;
      }
    }
  }

  // Verifica se existe QUALQUER arquivo de saída (independente do sufixo atual)
  const anyOutputFile = findAnyOutputFile(fileInfo);
  if (anyOutputFile) {
    // Arquivo existe, marca no cache apenas se não estiver já marcado
    // (evita salvar cache desnecessariamente)
    if (!cache[cacheKey] || cache[cacheKey].status !== "completed") {
      const fileHash = calculateFileHash(fullPath);
      cache[cacheKey] = {
        status: "completed",
        outputPath: anyOutputFile,
        fileHash: fileHash,
        timestamp: new Date().toISOString(),
      };
      saveCache(cache);
    }
    return true;
  }

  return false; // Não foi processado ainda
}

// Marca imagem como processada no cache
export function markAsProcessed(fileInfo, outputPath, cache) {
  const { relativePath, fullPath } = fileInfo;
  const cacheKey = relativePath;
  const fileHash = calculateFileHash(fullPath);

  cache[cacheKey] = {
    status: "completed",
    outputPath: outputPath,
    fileHash: fileHash,
    timestamp: new Date().toISOString(),
  };

  saveCache(cache);
}

// Marca imagem com erro no cache
export function markAsError(fileInfo, errorMessage, cache) {
  const { relativePath } = fileInfo;
  const cacheKey = relativePath;

  cache[cacheKey] = {
    status: "error",
    error: errorMessage,
    timestamp: new Date().toISOString(),
  };

  saveCache(cache);
}

// Limpa cache
export function clearCache() {
  try {
    if (fs.existsSync(config.cacheFilePath)) {
      fs.unlinkSync(config.cacheFilePath);
      logger.info("Cache limpo com sucesso");
    }
  } catch (error) {
    logger.error(`Erro ao limpar cache: ${error.message}`);
    throw error;
  }
}

// Remove entradas do cache para imagens estáticas (que não devem ser processadas)
export function removeStaticImagesFromCache(cache) {
  let removedCount = 0;
  const keysToRemove = [];

  Object.keys(cache).forEach((key) => {
    const fileName = path.basename(key);
    const nameWithoutExt = path.parse(fileName).name.toLowerCase();

    if (config.staticImageNames.includes(nameWithoutExt)) {
      keysToRemove.push(key);
    }
  });

  keysToRemove.forEach((key) => {
    delete cache[key];
    removedCount++;
  });

  if (removedCount > 0) {
    saveCache(cache);
    logger.info(`Removidas ${removedCount} entrada(s) de imagens estáticas do cache`);
  }

  return removedCount;
}

// Obtém estatísticas do cache
export function getCacheStats(cache) {
  const stats = {
    total: Object.keys(cache).length,
    completed: 0,
    errors: 0,
    processing: 0,
  };

  Object.values(cache).forEach((entry) => {
    if (entry.status === "completed") {
      stats.completed++;
    } else if (entry.status === "error") {
      stats.errors++;
    } else if (entry.status === "processing") {
      stats.processing++;
    }
  });

  return stats;
}


