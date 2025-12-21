// config.js
// Configurações centralizadas do script

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Carrega configurações de arquivo .env se existir
function loadEnvConfig() {
  const config = {};

  // Tenta primeiro na raiz do projeto (2 níveis acima de utils/)
  const projectRoot = path.resolve(__dirname, "../..");
  const projectEnvPath = path.join(projectRoot, ".env");

  // Tenta depois em gen-images/ (1 nível acima de utils/)
  const genImagesRoot = path.resolve(__dirname, "..");
  const genImagesEnvPath = path.join(genImagesRoot, ".env");

  // Prioriza .env da raiz do projeto, depois gen-images/
  let envPath = null;
  if (fs.existsSync(projectEnvPath)) {
    envPath = projectEnvPath;
  } else if (fs.existsSync(genImagesEnvPath)) {
    envPath = genImagesEnvPath;
  }

  // Primeiro carrega variáveis de ambiente do sistema (têm prioridade)
  if (process.env.SEGMIND_API_URL) {
    config.SEGMIND_API_URL = process.env.SEGMIND_API_URL;
  }
  if (process.env.SEGMIND_API_KEY) {
    config.SEGMIND_API_KEY = process.env.SEGMIND_API_KEY;
  }
  if (process.env.UPLOADTHING_TOKEN) {
    config.UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN;
  }
  if (process.env.BATCH_SIZE) {
    config.BATCH_SIZE = process.env.BATCH_SIZE;
  }
  if (process.env.REQUEST_TIMEOUT) {
    config.REQUEST_TIMEOUT = process.env.REQUEST_TIMEOUT;
  }
  if (process.env.POLL_INTERVAL) {
    config.POLL_INTERVAL = process.env.POLL_INTERVAL;
  }
  if (process.env.MAX_POLL_ATTEMPTS) {
    config.MAX_POLL_ATTEMPTS = process.env.MAX_POLL_ATTEMPTS;
  }
  if (process.env.RATE_LIMIT_DELAY) {
    config.RATE_LIMIT_DELAY = process.env.RATE_LIMIT_DELAY;
  }
  if (process.env.RATE_LIMIT_MAX_CONCURRENT) {
    config.RATE_LIMIT_MAX_CONCURRENT = process.env.RATE_LIMIT_MAX_CONCURRENT;
  }
  if (process.env.CACHE_BACKUP_INTERVAL) {
    config.CACHE_BACKUP_INTERVAL = process.env.CACHE_BACKUP_INTERVAL;
  }
  if (process.env.MAX_CACHE_BACKUPS) {
    config.MAX_CACHE_BACKUPS = process.env.MAX_CACHE_BACKUPS;
  }

  // Carrega do arquivo .env se existir (variáveis de ambiente têm prioridade)
  if (envPath && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const keyTrimmed = key.trim();
          // Só sobrescreve se não foi definido por variável de ambiente
          if (!config[keyTrimmed]) {
            let value = valueParts.join("=").trim();
            // Remove aspas simples ou duplas do início e fim
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }
            config[keyTrimmed] = value;
          }
        }
      }
    });
    // Log apenas em modo debug (para não poluir output normal)
    if (process.env.DEBUG) {
      console.log(`📄 Arquivo .env carregado de: ${envPath}`);
    }
  }

  return config;
}

const envConfig = loadEnvConfig();

export const config = {
  // Diretórios
  inputDir: path.join(rootDir, "input"),
  outputDir: path.join(rootDir, "output"),
  cacheFilePath: path.join(rootDir, "processing-cache.json"),
  cacheBackupDir: path.join(rootDir, "cache-backups"),
  logDir: path.join(rootDir, "logs"),

  // API Segmind
  apiUrl: envConfig.SEGMIND_API_URL,
  apiKey: envConfig.SEGMIND_API_KEY,

  // UploadThing
  uploadthingToken: envConfig.UPLOADTHING_TOKEN,

  // Prompt padrão
  defaultPrompt:
    "A realistic photograph of a piece positioned in the center of two stacked stones. Both stones remain fully visible, with golden cracks. The lighting, shadows, and overall color tones blend perfectly. Warm atmosphere in shades of beige and gold, high realism, smooth integration.",

  // Imagens estáticas
  staticImageNames: ["static-1", "static-2"],

  // Processamento
  batchSize: parseInt(envConfig.BATCH_SIZE || "5", 10),
  requestTimeout: parseInt(envConfig.REQUEST_TIMEOUT || "30000", 10),
  pollInterval: parseInt(envConfig.POLL_INTERVAL || "5000", 10),
  maxPollAttempts: parseInt(envConfig.MAX_POLL_ATTEMPTS || "60", 10),

  // Rate limiting
  rateLimitDelay: parseInt(envConfig.RATE_LIMIT_DELAY || "1000", 10), // ms entre requisições
  rateLimitMaxConcurrent: parseInt(
    envConfig.RATE_LIMIT_MAX_CONCURRENT || "3",
    10
  ),

  // Cache
  cacheBackupInterval: parseInt(envConfig.CACHE_BACKUP_INTERVAL || "100", 10), // backups a cada N operações
  maxCacheBackups: parseInt(envConfig.MAX_CACHE_BACKUPS || "10", 10),
};

// Garante que diretórios necessários existam
export function ensureDirectories() {
  const dirs = [config.outputDir, config.cacheBackupDir, config.logDir];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
