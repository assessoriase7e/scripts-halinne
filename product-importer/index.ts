#!/usr/bin/env tsx
/**
 * Script para importação de produtos
 * - Lê imagens de pastas estruturadas
 * - Carrega dados dos CSVs
 * - Gera descrições via OpenAI (OBRIGATÓRIO)
 * - Faz upload de imagens via Uploadthing (OBRIGATÓRIO)
 * - Cria produtos no banco de dados
 *
 * SEM FALLBACKS - todas as dependências são obrigatórias
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import { markdownToHtml } from "./markdown-to-html";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const CONFIG = {
  STORE_ID: 1,
  DATABASE_URL: process.env.PRODUCT_IMPORTER_DATABASE_URL || "",
  UPLOADTHING_TOKEN: process.env.PRODUCT_IMPORTER_UPLOADTHING_TOKEN || "",
  OPENAI_API_KEY: process.env.PRODUCT_IMPORTER_OPENAI_API_KEY || "",
  OPENAI_MODEL: "gpt-4.1-mini",
  NCM: "71131900",
  CFOP: "5102",
  FREIGHT_MODE: "1",
  ICMS_ORIGIN: "0",
  ICMS_TAX: "102",
  STATUS: "active",
  CACHE_FILE: path.join(SCRIPT_DIR, ".cache/product-descriptions.json"),
  CATEGORY_CACHE_FILE: path.join(SCRIPT_DIR, ".cache/product-categories.json"),
  CATEGORY_SIMILARITY_CACHE_FILE: path.join(
    SCRIPT_DIR,
    ".cache/category-similarities.json"
  ),
  IMAGE_UPLOAD_CACHE_FILE: path.join(SCRIPT_DIR, ".cache/image-uploads.json"),
  INPUT_FOLDER: path.join(SCRIPT_DIR, "data/input"),
  CSV_FOLDER: path.join(SCRIPT_DIR, "data/table"),
  // Regex para identificar a imagem principal (case insensitive)
  // Exemplos: "1054-p.png", "1054-P.jpg", "1054_p.png"
  MAIN_IMAGE_REGEX: /-p\.(jpg|jpeg|png|gif|webp)$/i,
};

// Prisma client com DATABASE_URL customizada
let prisma: PrismaClient;

// Flag global para controlar parada por falta de armazenamento
let storageQuotaExceeded = false;

// ============================================================================
// TIPOS
// ============================================================================

interface CSVRecord {
  ID: string;
  Código: string;
  Descrição: string;
  Preço: string;
  [key: string]: string;
}

interface ProductData {
  code: string;
  name: string;
  barcode: string;
  price: number;
  category: string;
  subcategory: string;
  imagePaths: string[];
  csvData: CSVRecord;
}

interface CacheEntry {
  code: string;
  productName: string;
  shortDescription: string;
  longDescription: string;
  generatedAt: string;
}

interface CacheFile {
  version: string;
  lastUpdated: string;
  entries: Record<string, CacheEntry>;
}

interface CategoryCacheEntry {
  id: number;
  name: string;
  slug: string;
  storeId: number;
  parentId?: number;
  createdAt: string;
}

interface CategoryCacheFile {
  version: string;
  lastUpdated: string;
  entries: Record<string, CategoryCacheEntry>;
}

interface CategorySimilarityCacheEntry {
  newName: string;
  parentId?: number;
  matchedCategoryId: number;
  matchedCategoryName: string;
  checkedAt: string;
}

interface CategorySimilarityCacheFile {
  version: string;
  lastUpdated: string;
  entries: Record<string, CategorySimilarityCacheEntry>;
}

interface ImageUploadCacheEntry {
  hash: string;
  url: string;
  fileKey: string;
  uploadedAt: string;
  fileSize: number;
  fileName: string;
}

interface ImageUploadCacheFile {
  version: string;
  lastUpdated: string;
  entries: Record<string, ImageUploadCacheEntry>; // hash -> entry
  urlToHash: Record<string, string>; // url -> hash (para busca reversa)
}

interface CLIArgs {
  refreshCache: boolean;
  refreshCodes?: string[];
  skipCache: boolean;
  dryRun: boolean;
  openaiModel?: string;
  folderPath?: string;
  force: boolean;
  help: boolean;
  limit?: number;
  yes: boolean;
  cleanupOrphans: boolean;
  buildImageCache: boolean;
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

function log(message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

function logError(message: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error(`[${timestamp}] ERROR: ${message} - ${errorMsg}`);
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    refreshCache: false,
    skipCache: false,
    dryRun: false,
    force: false,
    help: false,
    yes: false,
    cleanupOrphans: false,
    buildImageCache: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--refresh-cache") {
      result.refreshCache = true;
      if (
        i + 1 < args.length &&
        !args[i + 1].startsWith("--") &&
        args[i + 1].match(/^\d/)
      ) {
        result.refreshCodes = args[i + 1].split(",");
        i++;
      }
    } else if (arg === "--skip-cache") {
      result.skipCache = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--force") {
      result.force = true;
    } else if (arg.startsWith("--openai-model=")) {
      result.openaiModel = arg.split("=")[1];
    } else if (arg.startsWith("--folder-path=")) {
      result.folderPath = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      result.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--yes" || arg === "-y") {
      result.yes = true;
    } else if (arg === "--cleanup-orphans") {
      result.cleanupOrphans = true;
    } else if (arg === "--build-image-cache") {
      result.buildImageCache = true;
    }
  }

  return result;
}

function displayHelp(): void {
  console.log(`
PRODUCT IMPORTER - Importação de Produtos

REQUISITOS OBRIGATÓRIOS:
  - PRODUCT_IMPORTER_DATABASE_URL: URL do banco PostgreSQL
  - PRODUCT_IMPORTER_UPLOADTHING_TOKEN: Token do Uploadthing
  - PRODUCT_IMPORTER_OPENAI_API_KEY: Chave da API OpenAI

USO:
  npx tsx scripts/product-importer/index.ts [OPTIONS]

OPÇÕES:
  --help, -h              Mostra ajuda
  --yes, -y               Modo automático (não pede confirmação)
  --refresh-cache         Regenera descrições em cache
  --refresh-cache=CODES   Regenera apenas códigos específicos (ex: 1798,1799)
  --skip-cache            Não salva novo cache
  --dry-run               Simula sem salvar no banco
  --force                 Força criação mesmo se existir
  --openai-model=MODEL    Define modelo OpenAI (padrão: gpt-4o-mini)
  --folder-path=PATH      Caminho customizado para imagens
  --limit=N               Limita quantidade de produtos a processar
  --cleanup-orphans       Remove arquivos órfãos do Uploadthing
  --build-image-cache     Constrói cache inicial das imagens do banco

ESTRUTURA DE PASTA:
  data/input/imagens-separadas-01/
  ├── [categoria][subcategoria]/
  │   ├── código_1/
  │   │   └── imagem.jpg
  `);
}

/**
 * Formata nome de categoria: substitui traços por espaços e aplica capitalize em cada palavra
 * Ex: "aneis-ouro" → "Aneis Ouro", "colares-e-brincos-prata" → "Colares E Brincos Prata"
 */
function formatCategoryName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractCategoryInfo(
  folderName: string
): { category: string; subcategory: string } | null {
  const match = folderName.match(/\[([^\]]+)\]\[([^\]]+)\]/);
  if (!match) return null;
  return {
    category: formatCategoryName(match[1]),
    subcategory: formatCategoryName(match[2]),
  };
}

async function parseCSV(filePath: string): Promise<CSVRecord[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");

  if (lines.length < 2) return [];

  const header = lines[0]
    .split(";")
    .map((h) => h.replace(/^["﻿]+|["]+$/g, "").trim());
  const records: CSVRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ";" && !inQuotes) {
        values.push(current.replace(/^"(.+)"$/, "$1").trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.replace(/^"(.+)"$/, "$1").trim());

    const record: CSVRecord = { ID: "", Código: "", Descrição: "", Preço: "" };
    for (let j = 0; j < header.length && j < values.length; j++) {
      record[header[j]] = values[j];
    }

    // Limpar código (remover tabs e espaços)
    if (record.Código) {
      record.Código = record.Código.replace(/[\t\s]+/g, "").trim();
    }

    // Validação: código e descrição são obrigatórios
    if (!record.Código || record.Código.length === 0) {
      continue; // Pular registro sem código
    }

    if (!record.Descrição || record.Descrição.trim().length === 0) {
      continue; // Pular registro sem descrição
    }

    // Validação: código deve ser alfanumérico (permite hífen e underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(record.Código)) {
      log(`Código inválido no CSV, pulando: ${record.Código}`);
      continue;
    }

    records.push(record);
  }

  return records;
}

async function loadCSVData(
  csvFolder: string
): Promise<Record<string, CSVRecord>> {
  const csvMap: Record<string, CSVRecord> = {};

  try {
    const files = await fs.readdir(csvFolder);
    for (const file of files) {
      if (!file.endsWith(".csv")) continue;

      const filePath = path.join(csvFolder, file);
      const records = await parseCSV(filePath);

      for (const record of records) {
        const code = record.Código;
        if (code) {
          csvMap[code] = record;
        }
      }
    }
  } catch (error) {
    logError("Erro ao carregar CSVs", error);
    throw error;
  }

  return csvMap;
}

async function loadDescriptionCache(): Promise<CacheFile> {
  try {
    const content = await fs.readFile(CONFIG.CACHE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      entries: {},
    };
  }
}

async function saveDescriptionCache(cache: CacheFile): Promise<void> {
  const dir = path.dirname(CONFIG.CACHE_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    CONFIG.CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf-8"
  );
  log("Cache de descrições salvo");
}

async function loadCategoryCache(): Promise<CategoryCacheFile> {
  try {
    const content = await fs.readFile(CONFIG.CATEGORY_CACHE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      entries: {},
    };
  }
}

async function saveCategoryCache(cache: CategoryCacheFile): Promise<void> {
  const dir = path.dirname(CONFIG.CATEGORY_CACHE_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    CONFIG.CATEGORY_CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf-8"
  );
  log("Cache de categorias salvo");
}

async function loadSimilarityCache(): Promise<CategorySimilarityCacheFile> {
  try {
    const content = await fs.readFile(
      CONFIG.CATEGORY_SIMILARITY_CACHE_FILE,
      "utf-8"
    );
    return JSON.parse(content);
  } catch {
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      entries: {},
    };
  }
}

async function saveSimilarityCache(
  cache: CategorySimilarityCacheFile
): Promise<void> {
  const dir = path.dirname(CONFIG.CATEGORY_SIMILARITY_CACHE_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    CONFIG.CATEGORY_SIMILARITY_CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf-8"
  );
  log("Cache de similaridades de categorias salvo");
}

async function loadImageUploadCache(): Promise<ImageUploadCacheFile> {
  try {
    const content = await fs.readFile(CONFIG.IMAGE_UPLOAD_CACHE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      entries: {},
      urlToHash: {},
    };
  }
}

async function saveImageUploadCache(
  cache: ImageUploadCacheFile
): Promise<void> {
  const dir = path.dirname(CONFIG.IMAGE_UPLOAD_CACHE_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    CONFIG.IMAGE_UPLOAD_CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf-8"
  );
  log("Cache de uploads de imagens salvo");
}

/**
 * Calcula o hash MD5 do conteúdo de um arquivo
 */
async function calculateFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("md5").update(buffer).digest("hex");
}

/**
 * Extrai o fileKey de uma URL do Uploadthing
 * Exemplos:
 * - https://utfs.io/f/abc123 -> abc123
 * - https://uploadthing.com/f/abc123 -> abc123
 * - https://uploadthing-prod.s3.us-west-2.amazonaws.com/abc123 -> abc123
 */
function extractFileKeyFromUrl(url: string): string | null {
  // Padrões comuns de URLs do Uploadthing
  const patterns = [
    /\/f\/([a-zA-Z0-9_-]+)/, // /f/fileKey
    /utfs\.io\/f\/([a-zA-Z0-9_-]+)/, // utfs.io/f/fileKey
    /uploadthing.*\/([a-zA-Z0-9_-]+)(?:\?|$)/, // uploadthing.com/path/fileKey ou uploadthing-prod.s3.../fileKey
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Tentar extrair da última parte do path se não encontrou padrão
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter((p) => p);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      // Se parece com um fileKey (alphanumeric + underscore/hyphen, sem extensão comum)
      if (
        /^[a-zA-Z0-9_-]+$/.test(lastPart) &&
        !lastPart.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      ) {
        return lastPart;
      }
    }
  } catch {
    // URL inválida, ignorar
  }

  return null;
}

/**
 * Constrói cache inicial de imagens consultando o banco de dados
 * Mapeia URLs já cadastradas para evitar uploads duplicados
 */
async function buildImageCacheFromDatabase(): Promise<void> {
  log("Construindo cache inicial de imagens do banco de dados...");

  const cache = await loadImageUploadCache();
  let addedCount = 0;
  let skippedCount = 0;

  // Buscar todas as imagens do banco
  const images = await prisma.image.findMany({
    where: {
      isDeleted: false,
      product: {
        isDeleted: false,
        storeId: CONFIG.STORE_ID,
      },
    },
    select: {
      url: true,
      createdAt: true,
    },
  });

  log(`Encontradas ${images.length} imagens no banco de dados`);

  for (const image of images) {
    // Se a URL já está no cache, pular
    if (cache.urlToHash[image.url]) {
      skippedCount++;
      continue;
    }

    // Extrair fileKey da URL
    const fileKey = extractFileKeyFromUrl(image.url);
    if (!fileKey) {
      log(`Não foi possível extrair fileKey da URL: ${image.url}`);
      skippedCount++;
      continue;
    }

    // Criar hash baseado na URL (já que não temos o arquivo original)
    // Usaremos o fileKey como identificador único
    const hash = crypto.createHash("md5").update(image.url).digest("hex");

    cache.entries[hash] = {
      hash,
      url: image.url,
      fileKey,
      uploadedAt: image.createdAt.toISOString(),
      fileSize: 0, // Não temos o tamanho original
      fileName: `cached-${fileKey}`,
    };

    cache.urlToHash[image.url] = hash;
    addedCount++;
  }

  cache.lastUpdated = new Date().toISOString();
  await saveImageUploadCache(cache);

  log(
    `Cache de imagens atualizado: ${addedCount} novas entradas, ${skippedCount} já existentes`
  );
}

/**
 * Identifica e remove arquivos órfãos do Uploadthing
 * Arquivos órfãos são aqueles que não estão mais referenciados no banco de dados
 */
async function cleanupOrphanedFiles(dryRun: boolean = false): Promise<void> {
  if (!CONFIG.UPLOADTHING_TOKEN) {
    throw new Error(
      "PRODUCT_IMPORTER_UPLOADTHING_TOKEN não configurado - obrigatório para limpeza"
    );
  }

  log("Identificando arquivos órfãos no Uploadthing...");

  const { apiKey } = decodeUploadthingToken(CONFIG.UPLOADTHING_TOKEN);

  // Buscar todas as URLs de imagens do banco de dados
  const images = await prisma.image.findMany({
    where: {
      isDeleted: false,
      product: {
        isDeleted: false,
        storeId: CONFIG.STORE_ID,
      },
    },
    select: {
      url: true,
    },
  });

  const validUrls = new Set(images.map((img) => img.url));
  log(`Encontradas ${validUrls.size} imagens válidas no banco de dados`);

  // Carregar cache de uploads
  const cache = await loadImageUploadCache();
  const orphanedEntries: ImageUploadCacheEntry[] = [];

  // Verificar cada entrada do cache
  for (const [hash, entry] of Object.entries(cache.entries)) {
    if (!validUrls.has(entry.url)) {
      orphanedEntries.push(entry);
    }
  }

  log(`Encontrados ${orphanedEntries.length} arquivos órfãos no cache`);

  if (orphanedEntries.length === 0) {
    log("Nenhum arquivo órfão encontrado!");
    return;
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Arquivos órfãos que seriam deletados:");
    orphanedEntries.forEach((entry, index) => {
      console.log(
        `${index + 1}. ${entry.fileName} (${entry.fileKey}) - ${entry.url}`
      );
    });
    return;
  }

  // Tentar deletar arquivos órfãos do Uploadthing
  let deletedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const entry of orphanedEntries) {
    try {
      // Tentar deletar via API do Uploadthing
      // Nota: A API pode não ter endpoint público para deletar, mas tentamos diferentes endpoints
      const endpoints = [
        "https://api.uploadthing.com/v6/deleteFile",
        "https://api.uploadthing.com/v6/files/delete",
        "https://api.uploadthing.com/v6/delete",
      ];

      let deleted = false;
      for (const endpoint of endpoints) {
        try {
          const deleteResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-uploadthing-api-key": apiKey,
              "x-uploadthing-version": "7.0.0",
            },
            body: JSON.stringify({
              fileKey: entry.fileKey,
            }),
          });

          if (deleteResponse.ok) {
            // Remover do cache
            delete cache.entries[entry.hash];
            delete cache.urlToHash[entry.url];
            deletedCount++;
            log(`Arquivo deletado: ${entry.fileKey}`);
            deleted = true;
            break;
          } else if (deleteResponse.status === 404) {
            // Arquivo já não existe, remover do cache mesmo assim
            delete cache.entries[entry.hash];
            delete cache.urlToHash[entry.url];
            deletedCount++;
            log(`Arquivo já não existe (removido do cache): ${entry.fileKey}`);
            deleted = true;
            break;
          }
        } catch (endpointError) {
          // Tentar próximo endpoint
          continue;
        }
      }

      if (!deleted) {
        // Se nenhum endpoint funcionou, apenas remover do cache local
        // (o arquivo pode continuar no Uploadthing, mas não será mais referenciado)
        delete cache.entries[entry.hash];
        delete cache.urlToHash[entry.url];
        skippedCount++;
        log(
          `Não foi possível deletar ${entry.fileKey} via API (removido do cache local apenas)`
        );
      }
    } catch (error) {
      logError(`Erro ao processar arquivo órfão ${entry.fileKey}`, error);
      failedCount++;
    }
  }

  // Salvar cache atualizado
  cache.lastUpdated = new Date().toISOString();
  await saveImageUploadCache(cache);

  log(
    `Limpeza concluída: ${deletedCount} deletados/removidos do cache, ${skippedCount} removidos apenas do cache local, ${failedCount} falhas`
  );

  if (skippedCount > 0) {
    console.log(
      "\n⚠️  Nota: Alguns arquivos não puderam ser deletados via API do Uploadthing."
    );
    console.log(
      "   Eles foram removidos do cache local, mas podem ainda existir no Uploadthing."
    );
    console.log(
      "   Considere deletá-los manualmente pelo painel do Uploadthing se necessário.\n"
    );
  }
}

/**
 * Gera uma chave única para o cache de similaridade baseada no nome e parentId
 */
function getSimilarityCacheKey(name: string, parentId?: number): string {
  const normalizedName = name.toLowerCase().trim();
  const parentKey = parentId !== undefined ? `_parent_${parentId}` : "_root";
  return `${normalizedName}${parentKey}`;
}

async function scanProductFolders(
  inputFolder: string
): Promise<Array<{ category: string; subcategory: string; folder: string }>> {
  const result: Array<{
    category: string;
    subcategory: string;
    folder: string;
  }> = [];

  // Validação: pasta de entrada deve existir
  try {
    const inputStat = await fs.stat(inputFolder);
    if (!inputStat.isDirectory()) {
      throw new Error(`Caminho de entrada não é uma pasta: ${inputFolder}`);
    }
  } catch (error) {
    throw new Error(
      `Erro ao acessar pasta de entrada ${inputFolder}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const categoryFolders = await fs.readdir(inputFolder);

  for (const catFolder of categoryFolders) {
    // Ignorar arquivos ocultos e arquivos de sistema
    if (catFolder.startsWith(".")) continue;

    const categoryPath = path.join(inputFolder, catFolder);

    try {
      const stat = await fs.stat(categoryPath);
      if (!stat.isDirectory()) {
        log(`Item não é uma pasta, pulando: ${catFolder}`);
        continue;
      }

      // Validação: formato da pasta deve ser [categoria][subcategoria]
      const catInfo = extractCategoryInfo(catFolder);
      if (!catInfo) {
        log(
          `Pasta mal formatada (deve ser [categoria][subcategoria]), pulando: ${catFolder}`
        );
        continue;
      }

      // Validação: categoria e subcategoria não podem ser vazias
      if (!catInfo.category || catInfo.category.trim().length === 0) {
        log(`Categoria vazia na pasta ${catFolder}, pulando`);
        continue;
      }

      if (!catInfo.subcategory || catInfo.subcategory.trim().length === 0) {
        log(`Subcategoria vazia na pasta ${catFolder}, pulando`);
        continue;
      }

      result.push({
        category: catInfo.category,
        subcategory: catInfo.subcategory,
        folder: categoryPath,
      });
    } catch (error) {
      logError(`Erro ao processar pasta ${catFolder}`, error);
      continue;
    }
  }

  return result;
}

async function getProductFolders(
  categoryPath: string
): Promise<Array<{ code: string; path: string; imageCount: number }>> {
  const products: Array<{ code: string; path: string; imageCount: number }> =
    [];

  // Validação: categoria deve existir
  try {
    const catStat = await fs.stat(categoryPath);
    if (!catStat.isDirectory()) {
      log(`Caminho de categoria não é uma pasta: ${categoryPath}`);
      return products;
    }
  } catch (error) {
    logError(`Erro ao acessar pasta de categoria ${categoryPath}`, error);
    return products;
  }

  const items = await fs.readdir(categoryPath);

  for (const item of items) {
    // Ignorar arquivos ocultos e arquivos de sistema
    if (item.startsWith(".")) continue;

    const itemPath = path.join(categoryPath, item);

    try {
      const stat = await fs.stat(itemPath);
      if (!stat.isDirectory()) {
        log(`Item não é uma pasta, pulando: ${item}`);
        continue;
      }

      // Validação: código do produto não pode ser vazio
      const code = item.trim();
      if (!code || code.length === 0) {
        log(`Código vazio na pasta ${itemPath}, pulando`);
        continue;
      }

      const images = await fs.readdir(itemPath);
      const imageCount = images.filter((img) =>
        /\.(jpg|jpeg|png|gif|webp)$/i.test(img)
      ).length;

      if (imageCount > 0) {
        products.push({ code, path: itemPath, imageCount });
      } else {
        log(`Pasta de produto sem imagens válidas: ${code}`);
      }
    } catch (error) {
      logError(`Erro ao processar pasta de produto ${item}`, error);
      continue;
    }
  }

  return products;
}

/**
 * Calcula a prioridade de uma imagem para ordenação.
 * Retorna um número menor para maior prioridade.
 *
 * Prioridades (menor = maior prioridade):
 * 1. Arquivos com padrão -p (ex: "1054-p.png")
 * 2. Arquivo base sem variações (ex: "1287.png")
 * 3. Variações sem sufixos adicionais (ex: "1287-V1-PRETO.png")
 * 4. Variações com sufixos adicionais (ex: "1287-V1-PRETO-AD1.png")
 * 5. Outros arquivos
 */
function getImagePriority(fileName: string, productCode: string): number {
  const baseName = path.basename(fileName, path.extname(fileName));

  // Prioridade 1: Arquivos com padrão -p (case insensitive)
  if (CONFIG.MAIN_IMAGE_REGEX.test(fileName)) {
    return 1;
  }

  // Prioridade 2: Arquivo base sem variações (ex: "1287.png")
  // Verifica se o nome do arquivo é exatamente o código do produto
  if (baseName === productCode) {
    return 2;
  }

  // Prioridade 3: Variações sem sufixos adicionais
  // Padrão: código-V[numero]-[cor] (ex: "1287-V1-PRETO.png")
  // Não deve ter sufixos como -AD1, -AD2, etc.
  const variationPattern = new RegExp(`^${productCode}-V\\d+-[A-Z]+$`, "i");
  if (variationPattern.test(baseName)) {
    return 3;
  }

  // Prioridade 4: Variações com sufixos adicionais (ex: "1287-V1-PRETO-AD1.png")
  const variationWithSuffixPattern = new RegExp(
    `^${productCode}-V\\d+-[A-Z]+-`,
    "i"
  );
  if (variationWithSuffixPattern.test(baseName)) {
    return 4;
  }

  // Prioridade 5: Outros arquivos
  return 5;
}

/**
 * Ordena as imagens colocando a principal primeiro.
 *
 * Estratégia de ordenação:
 * 1. Primeiro: arquivos com padrão -p (ex: "1054-p.png")
 * 2. Segundo: arquivo base sem variações (ex: "1287.png")
 * 3. Terceiro: variações sem sufixos (ex: "1287-V1-PRETO.png")
 * 4. Quarto: variações com sufixos (ex: "1287-V1-PRETO-AD1.png")
 * 5. Último: outros arquivos
 *
 * Dentro de cada grupo, ordena alfabeticamente para consistência.
 */
function sortImagesWithMainFirst(
  imagePaths: string[],
  productCode: string
): string[] {
  if (imagePaths.length === 0) {
    return imagePaths;
  }

  const sorted = [...imagePaths].sort((a, b) => {
    const fileNameA = path.basename(a);
    const fileNameB = path.basename(b);

    // Obter prioridades
    const priorityA = getImagePriority(fileNameA, productCode);
    const priorityB = getImagePriority(fileNameB, productCode);

    // Ordenar por prioridade primeiro
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Se mesma prioridade, ordenar alfabeticamente para consistência
    return fileNameA.localeCompare(fileNameB);
  });

  // Log sobre qual é a imagem principal
  const mainImage = sorted[0];
  const mainFileName = path.basename(mainImage);
  const mainPriority = getImagePriority(mainFileName, productCode);

  let priorityDescription = "";
  switch (mainPriority) {
    case 1:
      priorityDescription = "padrão -p";
      break;
    case 2:
      priorityDescription = "arquivo base sem variações";
      break;
    case 3:
      priorityDescription = "variação sem sufixos adicionais";
      break;
    case 4:
      priorityDescription = "variação com sufixos adicionais";
      break;
    default:
      priorityDescription = "outro arquivo";
  }

  log(
    `Imagem principal identificada: ${mainFileName} (${priorityDescription})`
  );

  return sorted;
}

async function validateProductNotExists(
  barcode: string,
  force: boolean = false
): Promise<boolean> {
  if (force) return true;

  const existing = await prisma.product.findFirst({
    where: { gtin: barcode, storeId: CONFIG.STORE_ID },
  });
  return !existing;
}

function extractProductInfo(productName: string): {
  material: string;
  type: string;
  weight?: string;
} {
  const upperName = productName.toUpperCase();

  let material = "Semijoia";
  if (upperName.includes("OURO")) material = "Ouro";
  else if (upperName.includes("PRATA")) material = "Prata";
  else if (upperName.includes("BANHADO")) material = "Banhado";

  let type = "Joia";
  if (upperName.includes("ANEL")) type = "Anel";
  else if (upperName.includes("BRINCO")) type = "Brinco";
  else if (upperName.includes("PULSEIRA")) type = "Pulseira";
  else if (upperName.includes("PINGENTE")) type = "Pingente";
  else if (upperName.includes("COLAR")) type = "Colar";
  else if (upperName.includes("TORNOZELEIRA")) type = "Tornozeleira";
  else if (upperName.includes("GARGANTILHA")) type = "Gargantilha";

  const weightMatch = productName.match(/(\d+(?:[.,]\d+)?)\s*g/i);
  const weight = weightMatch ? weightMatch[1].replace(",", ".") : undefined;

  return { material, type, weight };
}

// ============================================================================
// UTILITÁRIOS DE PROCESSAMENTO PARALELO
// ============================================================================

const BATCH_SIZE = 3; // Reduzido para evitar rate limit da OpenAI
const BATCH_DELAY_MS = 2000; // Delay entre batches para evitar rate limit

/**
 * Capitaliza cada palavra de uma string (Title Case)
 */
function capitalizeWords(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Divide um array em chunks de tamanho específico
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// OPENAI - OBRIGATÓRIO (sem fallback)
// ============================================================================

/**
 * Executa uma função com retry automático e backoff exponencial
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        log(
          `Tentativa ${attempt}/${maxAttempts} falhou. Aguardando ${delayMs}ms antes da próxima tentativa...`,
          {
            error: lastError.message,
          }
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `Falha após ${maxAttempts} tentativas: ${lastError?.message}`
  );
}

/**
 * Converte imagem para base64 para envio à API de visão
 */
async function imageToBase64(
  imagePath: string
): Promise<{ base64: string; mimeType: string }> {
  const buffer = await fs.readFile(imagePath);
  const base64 = buffer.toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return { base64, mimeType: mimeTypes[ext] || "image/jpeg" };
}

/**
 * Extrai o material (ouro/prata/rodio) da subcategoria
 */
function extractMaterialFromSubcategory(
  subcategory: string
): "ouro" | "prata" | "rodio" {
  const lower = subcategory.toLowerCase();
  if (lower.includes("prata")) return "prata";
  if (lower.includes("rodio") || lower.includes("ródio")) return "rodio";
  return "ouro"; // default é ouro (banhado)
}

async function generateDescriptions(
  productName: string,
  csvData: Partial<CSVRecord>,
  imagePaths: string[],
  subcategory: string,
  model: string = CONFIG.OPENAI_MODEL
): Promise<{ short: string; long: string }> {
  if (!CONFIG.OPENAI_API_KEY) {
    throw new Error(
      "PRODUCT_IMPORTER_OPENAI_API_KEY não configurada - obrigatório para gerar descrições"
    );
  }

  const productInfo = extractProductInfo(productName);
  const materialType = extractMaterialFromSubcategory(subcategory);

  // Preparar imagens para análise (máximo 3 para não exceder limites)
  const imagesToAnalyze = imagePaths.slice(0, 3);
  log(`Analisando ${imagesToAnalyze.length} imagem(ns) com IA`, {
    images: imagesToAnalyze.map((p) => path.basename(p)),
  });

  // Converter imagens para base64
  const imageContents: Array<{
    type: "image_url";
    image_url: { url: string };
  }> = [];
  for (const imgPath of imagesToAnalyze) {
    try {
      const { base64, mimeType } = await imageToBase64(imgPath);
      imageContents.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
      log(`Imagem carregada: ${path.basename(imgPath)}`);
    } catch (error) {
      log(
        `Erro ao carregar imagem ${path.basename(imgPath)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Definir instrução de material baseado na subcategoria (pasta)
  const materialConfig: Record<
    "ouro" | "prata" | "rodio",
    { info: string; label: string }
  > = {
    prata: {
      info: "Esta peça é de PRATA. Mencione 'prata' ou 'prata 925' na descrição.",
      label: "Prata",
    },
    rodio: {
      info: "Esta peça é SEMIJOIA COM BANHO DE RÓDIO, não é ouro nem prata maciça. Mencione 'banho de ródio' ou 'banhado a ródio' na descrição.",
      label: "Semijoia banhada a ródio",
    },
    ouro: {
      info: "Esta peça é SEMIJOIA BANHADA A OURO, não é ouro maciço. Mencione 'banho de ouro' ou 'banhado a ouro' na descrição.",
      label: "Semijoia banhada a ouro",
    },
  };

  const { info: materialInfo, label: materialLabel } =
    materialConfig[materialType];

  const prompt = `Você é o proprietário de uma loja de semijoias escrevendo descrições para seu catálogo online.

IMPORTANTE SOBRE O MATERIAL: ${materialInfo}

PRODUTO: "${productName}"
- Tipo: ${productInfo.type}
- Material: ${materialLabel}
${productInfo.weight ? `- Peso: ${productInfo.weight}g` : ""}

INSTRUÇÕES:
Analise as imagens do produto "${productName}" e escreva descrições com conhecimento e autoridade. Você conhece bem seu produto.

GERE 2 DESCRIÇÕES EM JSON:

1. "short": Máximo 100 caracteres. Descrição objetiva e elegante da peça.

2. "long": Máximo 550 caracteres em MARKDOWN. Estrutura:
   - Um parágrafo descritivo sobre a peça (2-3 frases)
   - Lista de características com bullets (-)
   - Uma frase final com DICA DE USO: sugira uma ocasião ou como usar no dia a dia (ex: "Combina bem com looks casuais e sociais", "Ótima opção para presentear", "Versátil para uso diário ou eventos especiais")

REGRAS OBRIGATÓRIAS:
- Escreva com CERTEZA e AUTORIDADE - você conhece o produto
- NUNCA use: "talvez", "provavelmente", "parece", "pode ser", "aparenta", "sugere"
- NUNCA use frases de marketing exagerado: "Descubra", "Apresentamos", "Perfeito para", "Ideal para"
- Descreva materiais, acabamentos, pedras e detalhes que você vê na imagem
- Use linguagem profissional de joalheria
- Seja descritivo mas natural, como se estivesse apresentando a peça a uma cliente
- A dica de uso deve ser prática e relacionada ao cotidiano

EXEMPLO DE DESCRIÇÃO LONGA:
"Este brinco argola possui design clássico com acabamento polido em banho de ouro 18k.

- Formato circular elegante
- Zircônias brancas cravejadas
- Fecho tipo tarraxa

Versátil para compor looks do dia a dia ou ocasiões especiais."

Retorne apenas o JSON:
{
  "short": "descrição curta",
  "long": "descrição longa em markdown com dica de uso"
}`;

  // Montar mensagem com imagens
  const messageContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: prompt }, ...imageContents];

  log("Enviando imagens para análise da OpenAI...");

  const { content } = await retryWithBackoff(
    async () => {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: messageContent }],
            max_completion_tokens: 500,
          }),
        }
      );

      if (!response.ok) {
        const error = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          `OpenAI API error: ${error.error?.message || response.statusText}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const responseContent = data.choices?.[0]?.message?.content || "";

      // Validar que temos conteúdo na resposta
      if (!responseContent || responseContent.trim() === "") {
        throw new Error("OpenAI retornou resposta vazia");
      }

      return { content: responseContent };
    },
    3, // máximo de tentativas
    1000 // delay inicial em ms
  );

  // Extrair JSON da resposta (pode estar entre ``` ou direto)
  let jsonString: string | null = null;

  // Tenta extrair de markdown code blocks primeiro
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  } else {
    // Tenta extrair JSON direto com regex mais robusto
    // Procura por { até o } final
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
  }

  if (!jsonString) {
    throw new Error(
      `Resposta da OpenAI não contém JSON válido. Resposta recebida: ${content.substring(
        0,
        300
      )}`
    );
  }

  let parsed;
  try {
    // Tenta fazer parse do JSON
    parsed = JSON.parse(jsonString);
  } catch (e) {
    // Se falhar, tenta limpar caracteres de controle e espaços extras
    try {
      const cleaned = jsonString
        .replace(/[\x00-\x1F\x7F]/g, "") // Remove caracteres de controle
        .replace(/,\s*}/g, "}") // Remove vírgulas antes de }
        .replace(/,\s*]/g, "]"); // Remove vírgulas antes de ]
      parsed = JSON.parse(cleaned);
    } catch (cleanError) {
      throw new Error(
        `Erro ao fazer parse do JSON (original: ${jsonString.substring(
          0,
          150
        )}): ${String(e)}`
      );
    }
  }
  const shortDesc = (parsed.short || "").substring(0, 120).trim();
  const longMarkdown = (parsed.long || "").substring(0, 500).trim();

  if (!shortDesc || !longMarkdown) {
    throw new Error("Descrições vazias retornadas pela API");
  }

  log("Análise de imagem concluída - descrição gerada com sucesso");

  const longDesc = markdownToHtml(longMarkdown);

  return { short: shortDesc, long: longDesc };
}

async function getOrGenerateDescriptions(
  cache: CacheFile,
  code: string,
  productName: string,
  csvData: Partial<CSVRecord>,
  imagePaths: string[],
  subcategory: string,
  refreshCache: boolean,
  model: string = CONFIG.OPENAI_MODEL
): Promise<{ short: string; long: string; fromCache: boolean }> {
  if (!refreshCache && cache.entries[code]) {
    log(`Usando descrição do cache para ${code}`);
    return {
      short: cache.entries[code].shortDescription,
      long: cache.entries[code].longDescription,
      fromCache: true,
    };
  }

  const { short, long } = await generateDescriptions(
    productName,
    csvData,
    imagePaths,
    subcategory,
    model
  );

  cache.entries[code] = {
    code,
    productName,
    shortDescription: short,
    longDescription: long,
    generatedAt: new Date().toISOString(),
  };

  return { short, long, fromCache: false };
}

// ============================================================================
// UPLOADTHING - OBRIGATÓRIO (sem fallback)
// ============================================================================

/**
 * Classe de erro customizada para indicar falta de armazenamento
 */
class StorageQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageQuotaExceededError";
  }
}

/**
 * Verifica se um erro da API do Uploadthing indica falta de armazenamento/quota
 */
function isStorageQuotaError(
  errorResponse: string,
  statusCode: number
): boolean {
  const errorLower = errorResponse.toLowerCase();

  // Códigos HTTP que podem indicar problemas de quota
  if (statusCode === 403 || statusCode === 413 || statusCode === 507) {
    return true;
  }

  // Palavras-chave que indicam problemas de armazenamento
  const quotaKeywords = [
    "quota",
    "storage",
    "limit",
    "exceeded",
    "insufficient",
    "full",
    "capacity",
    "space",
    "storage limit",
    "quota exceeded",
    "storage quota",
    "no space",
    "out of storage",
  ];

  return quotaKeywords.some((keyword) => errorLower.includes(keyword));
}

/**
 * Verifica o status de armazenamento do Uploadthing antes de fazer uploads
 * Faz uma requisição de teste para detectar problemas de quota antecipadamente
 */
async function checkStorageAvailability(apiKey: string): Promise<void> {
  try {
    // Faz uma requisição de teste com um arquivo mínimo (1 byte)
    const testResponse = await fetch(
      "https://api.uploadthing.com/v6/uploadFiles",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-uploadthing-api-key": apiKey,
          "x-uploadthing-be-adapter": "express",
          "x-uploadthing-version": "7.0.0",
        },
        body: JSON.stringify({
          files: [
            {
              name: ".storage-check",
              size: 1,
              type: "text/plain",
            },
          ],
          acl: "public-read",
          contentDisposition: "inline",
        }),
      }
    );

    if (!testResponse.ok) {
      const errorText = await testResponse.text();

      if (isStorageQuotaError(errorText, testResponse.status)) {
        throw new StorageQuotaExceededError(
          `Armazenamento do Uploadthing sem espaço disponível. Status: ${testResponse.status}, Erro: ${errorText}`
        );
      }

      // Outros erros não relacionados a quota são ignorados na verificação
      // (podem ser problemas temporários, etc)
      log(
        `Aviso: Verificação de armazenamento retornou status ${testResponse.status}, mas não parece ser problema de quota`
      );
    }
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) {
      throw error;
    }
    // Erros de rede ou outros problemas não relacionados a quota são ignorados
    // na verificação preventiva (serão detectados no upload real)
    log(
      `Aviso: Erro ao verificar armazenamento (não crítico): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Decodifica o token do Uploadthing para extrair a API key
 * O token pode ser um JWT ou um Base64 string direto
 */
function decodeUploadthingToken(token: string): {
  apiKey: string;
  appId: string;
} {
  try {
    // Remove aspas se existirem
    const cleanToken = token.replace(/^["']|["']$/g, "");

    let payload: string;

    // Verifica se é formato JWT (tem 3 partes separadas por ponto)
    if (cleanToken.includes(".")) {
      const parts = cleanToken.split(".");
      if (parts.length === 3) {
        // JWT format: header.payload.signature
        payload = Buffer.from(parts[1], "base64").toString("utf-8");
      } else {
        throw new Error("Formato de token inválido");
      }
    } else {
      // É um Base64 string direto
      payload = Buffer.from(cleanToken, "base64").toString("utf-8");
    }

    const data = JSON.parse(payload);

    if (!data.apiKey || !data.appId) {
      throw new Error("Token não contém apiKey ou appId");
    }

    return { apiKey: data.apiKey, appId: data.appId };
  } catch (error) {
    throw new Error(
      `Erro ao decodificar token do Uploadthing: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function uploadImages(imagePaths: string[]): Promise<string[]> {
  if (!CONFIG.UPLOADTHING_TOKEN) {
    throw new Error(
      "PRODUCT_IMPORTER_UPLOADTHING_TOKEN não configurado - obrigatório para upload de imagens"
    );
  }

  // Verificar se já detectamos falta de armazenamento
  if (storageQuotaExceeded) {
    throw new StorageQuotaExceededError(
      "Armazenamento do Uploadthing sem espaço disponível. Script interrompido."
    );
  }

  // Carregar cache de uploads
  const uploadCache = await loadImageUploadCache();

  // Decodifica o token para obter a API key real
  const { apiKey } = decodeUploadthingToken(CONFIG.UPLOADTHING_TOKEN);

  // Verificar disponibilidade de armazenamento antes de iniciar uploads
  await checkStorageAvailability(apiKey);

  const urls: string[] = [];

  for (const imagePath of imagePaths) {
    // Verificar novamente antes de cada upload (pode ter mudado durante o processamento)
    if (storageQuotaExceeded) {
      throw new StorageQuotaExceededError(
        "Armazenamento do Uploadthing sem espaço disponível. Script interrompido."
      );
    }

    const fileName = path.basename(imagePath);

    // Calcular hash do arquivo para verificar se já foi enviado
    const fileHash = await calculateFileHash(imagePath);

    // Verificar se já existe no cache
    if (uploadCache.entries[fileHash]) {
      const cached = uploadCache.entries[fileHash];
      log(
        `Usando imagem do cache: ${fileName} -> ${
          cached.url
        } (hash: ${fileHash.substring(0, 8)}...)`
      );
      urls.push(cached.url);
      continue;
    }

    // Arquivo não está no cache, fazer upload
    const fileBuffer = await fs.readFile(imagePath);
    const mimeType = getMimeType(imagePath);
    const fileSize = fileBuffer.length;

    log(`Fazendo upload: ${fileName} (${fileSize} bytes)`);

    // Passo 1: Solicitar presigned URL do Uploadthing
    const presignedResponse = await fetch(
      "https://api.uploadthing.com/v6/uploadFiles",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-uploadthing-api-key": apiKey,
          "x-uploadthing-be-adapter": "express",
          "x-uploadthing-version": "7.0.0",
        },
        body: JSON.stringify({
          files: [
            {
              name: fileName,
              size: fileSize,
              type: mimeType,
            },
          ],
          acl: "public-read",
          contentDisposition: "inline",
        }),
      }
    );

    if (!presignedResponse.ok) {
      const errorText = await presignedResponse.text();

      // Verificar se é erro de quota/armazenamento
      if (isStorageQuotaError(errorText, presignedResponse.status)) {
        storageQuotaExceeded = true;
        throw new StorageQuotaExceededError(
          `Armazenamento do Uploadthing sem espaço disponível. Erro ao obter presigned URL para ${fileName}: ${errorText}`
        );
      }

      throw new Error(
        `Erro ao obter presigned URL para ${fileName}: ${errorText}`
      );
    }

    const presignedData = (await presignedResponse.json()) as {
      data: Array<{
        key: string;
        url: string;
        fields: Record<string, string>;
        fileUrl: string;
        appUrl: string;
        ufsUrl: string;
      }>;
    };

    if (!presignedData.data || presignedData.data.length === 0) {
      throw new Error(`Resposta inválida do Uploadthing para ${fileName}`);
    }

    const fileData = presignedData.data[0];
    const { url: uploadUrl, fields, key: fileKey } = fileData;

    // Log da resposta para debug
    log(`Presigned URL obtida`, {
      fileKey,
      hasUfsUrl: !!fileData.ufsUrl,
      hasAppUrl: !!fileData.appUrl,
      hasFileUrl: !!fileData.fileUrl,
    });

    // Passo 2: Upload do arquivo para o presigned URL
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }
    // Converter Buffer para Uint8Array para compatibilidade com Blob
    const uint8Array = new Uint8Array(fileBuffer);
    formData.append(
      "file",
      new Blob([uint8Array], { type: mimeType }),
      fileName
    );

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();

      // Verificar se é erro de quota/armazenamento
      if (isStorageQuotaError(errorText, uploadResponse.status)) {
        storageQuotaExceeded = true;
        throw new StorageQuotaExceededError(
          `Armazenamento do Uploadthing sem espaço disponível. Erro ao fazer upload de ${fileName}: ${errorText}`
        );
      }

      throw new Error(`Erro ao fazer upload de ${fileName}: ${errorText}`);
    }

    // Usar a URL correta - preferência: ufsUrl > appUrl > fileUrl > construída
    const finalUrl =
      fileData.ufsUrl ||
      fileData.appUrl ||
      fileData.fileUrl ||
      `https://utfs.io/f/${fileKey}`;

    // Salvar no cache
    uploadCache.entries[fileHash] = {
      hash: fileHash,
      url: finalUrl,
      fileKey,
      uploadedAt: new Date().toISOString(),
      fileSize,
      fileName,
    };
    uploadCache.urlToHash[finalUrl] = fileHash;

    urls.push(finalUrl);
    log(`Upload concluído: ${finalUrl}`);
  }

  // Salvar cache atualizado
  uploadCache.lastUpdated = new Date().toISOString();
  await saveImageUploadCache(uploadCache);

  return urls;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return mimeTypes[ext] || "image/jpeg";
}

// ============================================================================
// CATEGORIAS
// ============================================================================

/**
 * Verifica se existe uma categoria similar usando IA (com cache)
 */
async function findSimilarCategory(
  name: string,
  parentId: number | undefined,
  similarityCache: CategorySimilarityCacheFile,
  refreshCache: boolean = false
): Promise<{ id: number; name: string } | null> {
  const cacheKey = getSimilarityCacheKey(name, parentId);

  // Verificar cache primeiro
  if (!refreshCache && similarityCache.entries[cacheKey]) {
    const cached = similarityCache.entries[cacheKey];
    log(
      `Cache de similaridade encontrado: "${name}" → "${cached.matchedCategoryName}" (ID: ${cached.matchedCategoryId})`
    );

    // Verificar se a categoria ainda existe no banco
    const category = await prisma.category.findUnique({
      where: { id: cached.matchedCategoryId },
    });

    if (category && !category.isDeleted) {
      return { id: category.id, name: category.name };
    } else {
      // Categoria foi deletada, remover do cache
      delete similarityCache.entries[cacheKey];
      log(`Categoria do cache foi deletada, removendo entrada: ${cacheKey}`);
    }
  }

  // Buscar todas as categorias do mesmo nível (mesmo parentId)
  const existingCategories = await prisma.category.findMany({
    where: {
      storeId: CONFIG.STORE_ID,
      parentId: parentId ?? null,
      isDeleted: false,
    },
    select: { id: true, name: true },
  });

  if (existingCategories.length === 0) {
    log(
      `Nenhuma categoria existente no nível ${parentId ?? "raiz"} para comparar`
    );
    return null;
  }

  // Se houver apenas uma categoria, fazer comparação simples primeiro
  if (existingCategories.length === 1) {
    const existing = existingCategories[0];
    const normalizedNew = name.toLowerCase().trim();
    const normalizedExisting = existing.name.toLowerCase().trim();

    // Comparação simples: se os nomes normalizados forem muito similares
    if (normalizedNew === normalizedExisting) {
      log(`Categoria exata encontrada: "${name}" = "${existing.name}"`);
      similarityCache.entries[cacheKey] = {
        newName: name,
        parentId,
        matchedCategoryId: existing.id,
        matchedCategoryName: existing.name,
        checkedAt: new Date().toISOString(),
      };
      return { id: existing.id, name: existing.name };
    }
  }

  // Usar IA para verificar similaridade semântica
  const categoryNames = existingCategories.map((c) => c.name).join(", ");

  const prompt = `Você é um assistente que verifica se nomes de categorias são similares ou equivalentes.

NOVA CATEGORIA: "${name}"
CATEGORIAS EXISTENTES: ${categoryNames}

INSTRUÇÕES:
- Verifique se a nova categoria é similar ou equivalente a alguma existente
- Considere variações: singular/plural, acentos, sinônimos, abreviações
- Exemplos: "Aneis" = "Anéis", "Brincos" = "Brinco", "Colares" = "Colar", "Acessorios" = "Acessórios"
- Retorne APENAS o nome EXATO da categoria existente mais similar (copie exatamente como está na lista)
- Se nenhuma for similar, retorne "null"

Resposta (apenas o nome exato ou "null"):`;

  try {
    log(`Verificando similaridade com IA para: "${name}"`);

    const response = await retryWithBackoff(
      async () => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: CONFIG.OPENAI_MODEL,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 100,
            temperature: 0.3,
          }),
        });

        if (!res.ok) {
          const error = (await res.json()) as {
            error?: { message?: string };
          };
          throw new Error(
            `OpenAI API error: ${error.error?.message || res.statusText}`
          );
        }

        return res;
      },
      3,
      1000
    );

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const similarName = data.choices?.[0]?.message?.content?.trim();

    if (similarName && similarName.toLowerCase() !== "null") {
      // Buscar categoria com nome exato (case-insensitive)
      const found = existingCategories.find(
        (c) => c.name.toLowerCase() === similarName.toLowerCase()
      );

      if (found) {
        log(
          `✅ Categoria similar encontrada via IA: "${name}" → "${found.name}" (ID: ${found.id})`
        );

        // Salvar no cache
        similarityCache.entries[cacheKey] = {
          newName: name,
          parentId,
          matchedCategoryId: found.id,
          matchedCategoryName: found.name,
          checkedAt: new Date().toISOString(),
        };

        return { id: found.id, name: found.name };
      } else {
        log(
          `⚠️ IA retornou "${similarName}" mas não foi encontrada nas categorias existentes`
        );
      }
    } else {
      log(`Nenhuma categoria similar encontrada para: "${name}"`);
    }
  } catch (error) {
    logError("Erro ao verificar categoria similar com IA", error);
    // Em caso de erro, continuar sem verificação (comportamento atual)
  }

  return null;
}

async function getOrCreateCategory(
  name: string,
  parentId: number | undefined,
  cache: CategoryCacheFile | undefined,
  similarityCache: CategorySimilarityCacheFile,
  refreshCache: boolean = false
): Promise<{
  id: number;
  cache: CategoryCacheFile;
  similarityCache: CategorySimilarityCacheFile;
}> {
  // Validação: nome da categoria não pode ser vazio
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length === 0) {
    throw new Error("Nome da categoria não pode ser vazio");
  }

  // Validação: nome da categoria não pode ser muito longo (limite de 100 caracteres)
  if (trimmedName.length > 100) {
    throw new Error(
      `Nome da categoria muito longo (${trimmedName.length} caracteres, máximo: 100)`
    );
  }

  const slug = trimmedName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  // Validação: slug não pode ser vazio após processamento
  if (!slug || slug.length === 0) {
    throw new Error(
      `Não foi possível gerar slug válido para categoria: ${trimmedName}`
    );
  }

  let categoryCache = cache || (await loadCategoryCache());

  if (!refreshCache && categoryCache.entries[slug]) {
    return {
      id: categoryCache.entries[slug].id,
      cache: categoryCache,
      similarityCache,
    };
  }

  // Verificar por slug exato primeiro
  let category = await prisma.category.findUnique({ where: { slug } });

  // Se não encontrou, verificar por similaridade com IA (com cache)
  if (!category) {
    const similar = await findSimilarCategory(
      trimmedName,
      parentId,
      similarityCache,
      refreshCache
    );
    if (similar) {
      category = await prisma.category.findUnique({
        where: { id: similar.id },
      });
      if (category) {
        log(
          `✅ Usando categoria similar existente: "${trimmedName}" → "${category.name}" (ID: ${category.id})`
        );
        // Atualizar o slug no cache para futuras buscas
        const matchedSlug = category.slug;
        categoryCache.entries[matchedSlug] = {
          id: category.id,
          name: category.name,
          slug: category.slug,
          storeId: category.storeId,
          parentId: category.parentId ?? undefined,
          createdAt: new Date().toISOString(),
        };
      }
    }
  }

  // Criar nova categoria apenas se não encontrou nenhuma similar
  if (!category) {
    category = await prisma.category.create({
      data: {
        name: trimmedName,
        slug,
        storeId: CONFIG.STORE_ID,
        cashbackValue: 0,
        cashbackPercent: 0,
        status: "active",
        parentId,
      },
    });
    if (parentId) {
      log(
        `Subcategoria criada: ${trimmedName} (ID: ${category.id}, parentId: ${parentId})`
      );
    } else {
      log(`Categoria pai criada: ${trimmedName} (ID: ${category.id})`);
    }
  } else {
    if (parentId) {
      log(`Subcategoria encontrada: ${trimmedName} (ID: ${category.id})`);
    } else {
      log(`Categoria pai encontrada: ${trimmedName} (ID: ${category.id})`);
    }
  }

  categoryCache.entries[slug] = {
    id: category.id,
    name: category.name,
    slug: category.slug,
    storeId: category.storeId,
    parentId: category.parentId ?? undefined,
    createdAt: new Date().toISOString(),
  };

  return { id: category.id, cache: categoryCache, similarityCache };
}

// ============================================================================
// CRIAR PRODUTO
// ============================================================================

async function createProduct(
  data: ProductData,
  categoryId: number,
  imageUrls: string[],
  descriptions: { short: string; long: string },
  force: boolean = false
): Promise<number> {
  // Validações de entrada
  if (!data.code || data.code.trim().length === 0) {
    throw new Error("Código do produto não pode ser vazio");
  }

  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Nome do produto não pode ser vazio");
  }

  if (!data.barcode || data.barcode.trim().length === 0) {
    throw new Error("Barcode do produto não pode ser vazio");
  }

  if (!data.price || data.price <= 0) {
    throw new Error(
      `Preço do produto deve ser maior que zero (recebido: ${data.price})`
    );
  }

  if (!imageUrls || imageUrls.length === 0) {
    throw new Error("Produto deve ter pelo menos uma imagem");
  }

  if (!descriptions.short || descriptions.short.trim().length === 0) {
    throw new Error("Descrição curta não pode ser vazia");
  }

  if (!descriptions.long || descriptions.long.trim().length === 0) {
    throw new Error("Descrição longa não pode ser vazia");
  }

  // Validação: verificar se categoria existe
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      isDeleted: false,
    },
  });
  if (!category) {
    throw new Error(
      `Categoria com ID ${categoryId} não encontrada ou deletada`
    );
  }

  const sku = `HLN-${data.code}`;

  if (force) {
    const existingBySku = await prisma.product.findUnique({ where: { sku } });
    if (existingBySku) {
      log(`Deletando produto existente (force mode): ${sku}`);
      await prisma.image.deleteMany({ where: { productId: existingBySku.id } });
      await prisma.product.delete({ where: { id: existingBySku.id } });
    }
  }

  let slug = data.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  // Validação: slug não pode ser vazio
  if (!slug || slug.length === 0) {
    throw new Error(
      `Não foi possível gerar slug válido para produto: ${data.name}`
    );
  }

  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    const existing = await prisma.product.findUnique({
      where: { slug: uniqueSlug },
    });
    if (!existing) break;
    uniqueSlug = `${slug}-${counter}`;
    counter++;

    // Proteção contra loop infinito (máximo 1000 tentativas)
    if (counter > 1000) {
      throw new Error(
        `Não foi possível gerar slug único após 1000 tentativas para: ${data.name}`
      );
    }
  }

  const product = await prisma.product.create({
    data: {
      name: data.name,
      publicName: data.name,
      slug: uniqueSlug,
      description: descriptions.long,
      shortDescription: descriptions.short,
      price: data.price,
      stock: 0,
      categoryId: categoryId,
      storeId: CONFIG.STORE_ID,
      sku,
      gtin: data.barcode,
      ncmCode: CONFIG.NCM,
      cfopCode: CONFIG.CFOP,
      freightMode: CONFIG.FREIGHT_MODE,
      icmsOrigin: CONFIG.ICMS_ORIGIN,
      icmsTax: CONFIG.ICMS_TAX,
      pisTax: null,
      cofinsTax: null,
      ibsCbsClassificacaoTributaria: null,
      ibsCbsSituacaoTributaria: null,
      status: CONFIG.STATUS,
      isActive: true,
    },
  });

  for (let i = 0; i < imageUrls.length; i++) {
    await prisma.image.create({
      data: {
        url: imageUrls[i],
        sortOrder: i,
        productId: product.id,
      },
    });
  }

  log(`Produto criado: ${data.name} (ID: ${product.id}, SKU: ${sku})`);
  return product.id;
}

// ============================================================================
// INTERFACE CLI
// ============================================================================

async function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

function displayProductReview(
  data: ProductData,
  descriptions: { short: string; long: string },
  fromCache: boolean = false
): void {
  console.log("\n" + "=".repeat(80));
  console.log("REVISAO DO PRODUTO");
  console.log("=".repeat(80));
  console.log(`Nome: ${data.name}`);
  console.log(`Codigo: ${data.code}`);
  console.log(`SKU: HLN-${data.code}`);
  console.log(`Barcode: ${data.barcode}`);
  console.log(`Preco: R$ ${data.price.toFixed(2)}`);
  console.log(`Categoria: ${data.category} > ${data.subcategory}`);
  console.log(`Imagens: ${data.imagePaths.length} encontradas`);
  console.log(
    `\nDescricao Curta ${fromCache ? "(cache)" : "(gerada)"} (${
      descriptions.short.length
    } chars):`
  );
  console.log(`   ${descriptions.short}\n`);
  console.log(
    `Descricao Longa ${fromCache ? "(cache)" : "(gerada)"} (${
      descriptions.long.length
    } chars):`
  );
  console.log(`   ${descriptions.long.substring(0, 300)}...`);
  console.log("\n" + "=".repeat(80));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    displayHelp();
    process.exit(0);
  }

  console.log("\n========================================");
  console.log("   IMPORTADOR DE PRODUTOS");
  console.log("========================================\n");

  // Validar configurações obrigatórias
  if (!CONFIG.DATABASE_URL) {
    console.error("ERRO: PRODUCT_IMPORTER_DATABASE_URL não configurada");
    process.exit(1);
  }

  if (!CONFIG.UPLOADTHING_TOKEN && !args.dryRun) {
    console.error("ERRO: PRODUCT_IMPORTER_UPLOADTHING_TOKEN não configurado");
    process.exit(1);
  }

  if (!CONFIG.OPENAI_API_KEY) {
    console.error("ERRO: PRODUCT_IMPORTER_OPENAI_API_KEY não configurada");
    process.exit(1);
  }

  // Inicializar Prisma com adapter Pg
  const adapter = new PrismaPg({ connectionString: CONFIG.DATABASE_URL });
  prisma = new PrismaClient({ adapter });

  const startTime = Date.now();
  const inputFolder = args.folderPath || CONFIG.INPUT_FOLDER;
  const openaiModel = args.openaiModel || CONFIG.OPENAI_MODEL;
  const limit = args.limit;

  log("Configuracoes", {
    inputFolder,
    openaiModel,
    dryRun: args.dryRun,
    force: args.force,
    yes: args.yes,
    limit,
  });

  try {
    // Testar conexão com banco
    await prisma.$connect();
    log("Conectado ao banco de dados");

    // Construir cache inicial de imagens se solicitado
    if (args.buildImageCache) {
      console.log("\nConstruindo cache inicial de imagens...");
      await buildImageCacheFromDatabase();
      console.log("Cache de imagens construído com sucesso!\n");
      if (!args.cleanupOrphans) {
        // Se só quer construir cache, sair aqui
        await prisma.$disconnect();
        process.exit(0);
      }
    }

    // Limpar arquivos órfãos se solicitado
    if (args.cleanupOrphans) {
      console.log("\nLimpando arquivos órfãos do Uploadthing...");
      await cleanupOrphanedFiles(args.dryRun);
      console.log("Limpeza concluída!\n");
    }

    // Se apenas buildImageCache ou cleanupOrphans foram executados, sair
    if ((args.buildImageCache || args.cleanupOrphans) && !inputFolder) {
      await prisma.$disconnect();
      process.exit(0);
    }

    // Carregar dados CSV
    console.log("\nCarregando CSVs...");
    const csvData = await loadCSVData(CONFIG.CSV_FOLDER);
    console.log(`${Object.keys(csvData).length} registros carregados\n`);

    // Carregar caches
    let cache = await loadDescriptionCache();
    let categoryCache = await loadCategoryCache();
    let similarityCache = await loadSimilarityCache();
    const uploadCache = await loadImageUploadCache();
    console.log(
      `Cache de descricoes: ${Object.keys(cache.entries).length} entradas`
    );
    console.log(
      `Cache de categorias: ${
        Object.keys(categoryCache.entries).length
      } entradas`
    );
    console.log(
      `Cache de similaridades: ${
        Object.keys(similarityCache.entries).length
      } entradas`
    );
    console.log(
      `Cache de uploads: ${Object.keys(uploadCache.entries).length} entradas\n`
    );

    // Escanear pastas
    console.log("Escaneando pastas...");
    const categoryFolders = await scanProductFolders(inputFolder);
    console.log(`${categoryFolders.length} categorias encontradas\n`);

    let totalProducts = 0;
    let processedProducts = 0;
    let skippedProducts = 0;
    const failedProducts: Array<{
      code: string;
      name: string;
      error: string;
      timestamp: string;
    }> = [];

    // Processar cada categoria
    for (const catInfo of categoryFolders) {
      // Verificar se armazenamento foi excedido antes de processar nova categoria
      if (storageQuotaExceeded) {
        console.log("\n⚠️  ARMAZENAMENTO DO UPLOADTHING SEM ESPAÇO DISPONÍVEL");
        console.log("   Interrompendo processamento de novas categorias.\n");
        break;
      }

      if (limit && processedProducts >= limit) break;

      console.log(
        `\nProcessando: [${catInfo.category}][${catInfo.subcategory}]`
      );

      const productFolders = await getProductFolders(catInfo.folder);
      console.log(`   ${productFolders.length} produtos encontrados`);

      // Criar categorias
      const parentResult = await getOrCreateCategory(
        catInfo.category,
        undefined,
        categoryCache,
        similarityCache,
        args.refreshCache
      );
      categoryCache = parentResult.cache;
      similarityCache = parentResult.similarityCache;

      const subcategoryResult = await getOrCreateCategory(
        catInfo.subcategory,
        parentResult.id,
        categoryCache,
        similarityCache,
        args.refreshCache
      );
      categoryCache = subcategoryResult.cache;
      similarityCache = subcategoryResult.similarityCache;

      // Preparar lista de produtos válidos para processamento
      const validProducts: Array<{
        code: string;
        productData: ProductData;
        images: string[];
      }> = [];

      for (const prodFolder of productFolders) {
        totalProducts++;
        const code = prodFolder.code.trim();

        // Validação: código não pode ser vazio
        if (!code || code.length === 0) {
          console.log(`   [SKIP] Código vazio na pasta: ${prodFolder.path}`);
          skippedProducts++;
          continue;
        }

        // Validação: código deve ser alfanumérico (permite hífen e underscore)
        if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
          console.log(`   [SKIP] ${code}: código contém caracteres inválidos`);
          skippedProducts++;
          continue;
        }

        const barcode = code;

        // Verificar se já existe
        const isNew = await validateProductNotExists(barcode, args.force);
        if (!isNew) {
          console.log(`   [SKIP] ${code}: ja existe no banco`);
          skippedProducts++;
          continue;
        }

        // Buscar dados no CSV
        const csv = csvData[code];
        if (!csv) {
          console.log(`   [SKIP] ${code}: nao encontrado no CSV`);
          skippedProducts++;
          continue;
        }

        // Validação: descrição não pode ser vazia
        if (!csv.Descrição || csv.Descrição.trim().length === 0) {
          console.log(`   [SKIP] ${code}: descrição vazia no CSV`);
          skippedProducts++;
          continue;
        }

        // Validação: preço deve existir e ser válido
        if (!csv.Preço || csv.Preço.trim().length === 0) {
          console.log(`   [SKIP] ${code}: preço não informado no CSV`);
          skippedProducts++;
          continue;
        }

        // Parse do preço
        const priceStr = csv.Preço.replace(",", ".").trim();
        const price = parseFloat(priceStr);

        // Validação: preço deve ser um número válido
        if (isNaN(price)) {
          console.log(`   [SKIP] ${code}: preco invalido (${csv.Preço})`);
          skippedProducts++;
          continue;
        }

        // Validação: preço deve ser positivo
        if (price <= 0) {
          console.log(
            `   [SKIP] ${code}: preco deve ser maior que zero (${price})`
          );
          skippedProducts++;
          continue;
        }

        // Validação: preço não pode ser muito alto (proteção contra erros)
        if (price > 1000000) {
          console.log(
            `   [SKIP] ${code}: preco muito alto (${price}), possível erro`
          );
          skippedProducts++;
          continue;
        }

        // Obter imagens
        const rawImages = (await fs.readdir(prodFolder.path))
          .filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
          .map((f) => path.join(prodFolder.path, f));

        if (rawImages.length === 0) {
          console.log(`   [SKIP] ${code}: sem imagens`);
          skippedProducts++;
          continue;
        }

        // Validação: verificar se os arquivos de imagem realmente existem e são válidos
        const validImages: string[] = [];
        for (const imgPath of rawImages) {
          try {
            const stats = await fs.stat(imgPath);
            // Validação: arquivo deve existir e não ser vazio
            if (!stats.isFile()) {
              console.log(
                `   [WARN] ${code}: ${path.basename(
                  imgPath
                )} não é um arquivo válido`
              );
              continue;
            }
            // Validação: arquivo deve ter tamanho mínimo (1KB)
            if (stats.size < 1024) {
              console.log(
                `   [WARN] ${code}: ${path.basename(imgPath)} muito pequeno (${
                  stats.size
                } bytes), possível arquivo corrompido`
              );
              continue;
            }
            // Validação: arquivo não deve ser muito grande (50MB)
            if (stats.size > 50 * 1024 * 1024) {
              console.log(
                `   [WARN] ${code}: ${path.basename(imgPath)} muito grande (${(
                  stats.size /
                  1024 /
                  1024
                ).toFixed(2)}MB), pulando`
              );
              continue;
            }
            validImages.push(imgPath);
          } catch (error) {
            console.log(
              `   [WARN] ${code}: erro ao verificar ${path.basename(
                imgPath
              )}: ${error instanceof Error ? error.message : String(error)}`
            );
            continue;
          }
        }

        if (validImages.length === 0) {
          console.log(
            `   [SKIP] ${code}: nenhuma imagem válida após validação`
          );
          skippedProducts++;
          continue;
        }

        // Ordenar imagens com a principal primeiro (passando o código do produto)
        const images = sortImagesWithMainFirst(validImages, code);

        // Preparar dados do produto
        const productName = capitalizeWords(csv.Descrição).trim();

        // Validação: nome do produto não pode ser vazio após processamento
        if (!productName || productName.length === 0) {
          console.log(
            `   [SKIP] ${code}: nome do produto vazio após processamento`
          );
          skippedProducts++;
          continue;
        }

        // Validação: nome do produto não pode ser muito longo (limite de 200 caracteres)
        if (productName.length > 200) {
          console.log(
            `   [SKIP] ${code}: nome do produto muito longo (${productName.length} caracteres)`
          );
          skippedProducts++;
          continue;
        }

        const productData: ProductData = {
          code,
          name: productName,
          barcode,
          price,
          category: catInfo.category,
          subcategory: catInfo.subcategory,
          imagePaths: images,
          csvData: csv,
        };

        validProducts.push({ code, productData, images });

        // Verificar limite
        if (
          limit &&
          processedProducts + validProducts.length + failedProducts.length >=
            limit
        ) {
          break;
        }
      }

      // Processar em batches de BATCH_SIZE produtos em paralelo
      const batches = chunkArray(validProducts, BATCH_SIZE);
      console.log(
        `   ${validProducts.length} produtos para processar em ${batches.length} batch(es)`
      );

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(
          `\n   [Batch ${batchIndex + 1}/${batches.length}] Processando ${
            batch.length
          } produtos...`
        );

        // Verificar se armazenamento foi excedido antes de processar batch
        if (storageQuotaExceeded) {
          console.log(
            "\n   ⚠️  ARMAZENAMENTO DO UPLOADTHING SEM ESPAÇO DISPONÍVEL"
          );
          console.log("   Script interrompido para evitar mais falhas.\n");
          break;
        }

        // Função para processar um único produto
        const processProduct = async (
          item: (typeof batch)[0]
        ): Promise<{
          success: boolean;
          code: string;
          name: string;
          error?: string;
        }> => {
          const { code, productData, images } = item;

          try {
            // Verificar novamente antes de processar
            if (storageQuotaExceeded) {
              return {
                success: false,
                code,
                name: productData.name,
                error: "Armazenamento sem espaço (detectado anteriormente)",
              };
            }

            // Gerar descrições (com análise de imagem)
            const shouldRefresh =
              args.refreshCache &&
              (!args.refreshCodes || args.refreshCodes.includes(code));
            const descriptions = await getOrGenerateDescriptions(
              cache,
              code,
              productData.name,
              productData.csvData as CSVRecord,
              images,
              productData.subcategory,
              shouldRefresh,
              openaiModel
            );

            // Mostrar revisão (apenas se não for modo automático)
            if (!args.yes) {
              displayProductReview(
                productData,
                descriptions,
                descriptions.fromCache
              );
              const confirmation = await promptUser(
                "Cadastrar este produto? (y/n): "
              );
              if (confirmation !== "y" && confirmation !== "s") {
                console.log("Produto ignorado pelo usuario\n");
                return {
                  success: false,
                  code,
                  name: productData.name,
                  error: "Ignorado pelo usuário",
                };
              }
            }

            if (!args.dryRun) {
              // Upload de imagens
              const imageUrls = await uploadImages(productData.imagePaths);

              // Criar produto
              await createProduct(
                productData,
                subcategoryResult.id,
                imageUrls,
                descriptions,
                args.force
              );
              console.log(
                `   [OK] ${code}: ${productData.name.substring(0, 40)}...`
              );
              return { success: true, code, name: productData.name };
            } else {
              console.log(
                `   [DRY] ${code}: ${productData.name.substring(0, 40)}...`
              );
              return { success: true, code, name: productData.name };
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);

            // Se for erro de quota, marcar flag global e propagar
            if (error instanceof StorageQuotaExceededError) {
              storageQuotaExceeded = true;
              logError(
                `Armazenamento sem espaço detectado ao processar produto ${code}`,
                error
              );
              console.log(`   [QUOTA] ${code}: Armazenamento sem espaço!`);
              return {
                success: false,
                code,
                name: productData.name,
                error: errorMsg,
              };
            }

            logError(`Erro ao processar produto ${code}`, error);
            console.log(`   [ERRO] ${code}: ${errorMsg.substring(0, 60)}...`);
            return {
              success: false,
              code,
              name: productData.name,
              error: errorMsg,
            };
          }
        };

        // Processar batch em paralelo
        const results = await Promise.allSettled(batch.map(processProduct));

        // Contabilizar resultados
        for (const result of results) {
          if (result.status === "fulfilled") {
            if (result.value.success) {
              processedProducts++;
            } else if (
              result.value.error &&
              result.value.error !== "Ignorado pelo usuário"
            ) {
              // Verificar se o erro indica falta de armazenamento
              const isQuotaError =
                result.value.error.toLowerCase().includes("armazenamento") ||
                result.value.error.toLowerCase().includes("quota") ||
                result.value.error.toLowerCase().includes("storage");

              if (isQuotaError) {
                storageQuotaExceeded = true;
              }

              failedProducts.push({
                code: result.value.code,
                name: result.value.name,
                error: result.value.error,
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            // Promise rejeitada (não deveria acontecer pois tratamos erros internamente)
            const errorMsg = result.reason?.message || String(result.reason);
            const isQuotaError =
              errorMsg.toLowerCase().includes("armazenamento") ||
              errorMsg.toLowerCase().includes("quota") ||
              errorMsg.toLowerCase().includes("storage");

            if (isQuotaError) {
              storageQuotaExceeded = true;
            }

            failedProducts.push({
              code: "unknown",
              name: "unknown",
              error: errorMsg,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Verificar se armazenamento foi excedido após processar batch
        if (storageQuotaExceeded) {
          console.log(
            "\n   ⚠️  ARMAZENAMENTO DO UPLOADTHING SEM ESPAÇO DISPONÍVEL"
          );
          console.log(
            "   Interrompendo processamento para evitar mais falhas.\n"
          );
          break;
        }

        // Verificar limite após cada batch
        if (limit && processedProducts >= limit) {
          console.log(`\n   Limite de ${limit} produtos atingido.`);
          break;
        }

        // Delay entre batches para evitar rate limit
        if (batchIndex < batches.length - 1) {
          console.log(
            `   Aguardando ${BATCH_DELAY_MS}ms antes do próximo batch...`
          );
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
    }

    // Salvar caches
    if (!args.skipCache) {
      cache.lastUpdated = new Date().toISOString();
      await saveDescriptionCache(cache);

      categoryCache.lastUpdated = new Date().toISOString();
      await saveCategoryCache(categoryCache);

      similarityCache.lastUpdated = new Date().toISOString();
      await saveSimilarityCache(similarityCache);

      // Cache de uploads já é salvo dentro de uploadImages, mas garantimos que está atualizado
      const finalUploadCache = await loadImageUploadCache();
      finalUploadCache.lastUpdated = new Date().toISOString();
      await saveImageUploadCache(finalUploadCache);
    }

    // Resumo
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n" + "=".repeat(60));
    console.log("RESUMO DA IMPORTAÇÃO");
    console.log("=".repeat(60));
    console.log(`Produtos encontrados:  ${totalProducts}`);
    console.log(`Produtos cadastrados:  ${processedProducts}`);
    console.log(`Produtos pulados:      ${skippedProducts}`);
    console.log(`Produtos com erro:     ${failedProducts.length}`);
    console.log(`Tempo total:           ${duration}s`);
    if (storageQuotaExceeded) {
      console.log(
        `\n⚠️  ATENÇÃO: Script interrompido por falta de armazenamento no Uploadthing`
      );
      console.log(`   Verifique sua conta e libere espaço antes de continuar.`);
    }
    console.log("=".repeat(60));

    // Relatório de falhas
    if (failedProducts.length > 0) {
      console.log("\nPRODUTOS QUE FALHARAM:");
      console.log("-".repeat(60));
      failedProducts.forEach((failed, index) => {
        console.log(`\n${index + 1}. Código: ${failed.code}`);
        console.log(`   Nome: ${failed.name}`);
        console.log(`   Erro: ${failed.error}`);
        console.log(`   Hora: ${failed.timestamp}`);
      });
      console.log("-".repeat(60) + "\n");

      // Salvar relatório de falhas em arquivo
      const reportPath = path.join(
        SCRIPT_DIR,
        `.cache/failed-products-${new Date().toISOString().split("T")[0]}.json`
      );
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(failedProducts, null, 2));
      console.log(`Relatório de falhas salvo em: ${reportPath}\n`);
    } else {
      console.log("\n✓ Nenhum erro detectado!\n");
    }
  } catch (error) {
    logError("Erro durante importacao", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
