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
      // Verifica se o arquivo de saída ainda existe
      const expectedOutputPath = getExpectedOutputPath(fileInfo, suffix);
      if (fs.existsSync(expectedOutputPath)) {
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

  // Verifica se arquivo de saída já existe (verificação rápida)
  const expectedOutputPath = getExpectedOutputPath(fileInfo, suffix);
  if (fs.existsSync(expectedOutputPath)) {
    // Arquivo existe, marca no cache
    const fileHash = calculateFileHash(fullPath);
    cache[cacheKey] = {
      status: "completed",
      outputPath: expectedOutputPath,
      fileHash: fileHash,
      timestamp: new Date().toISOString(),
    };
    saveCache(cache);
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


