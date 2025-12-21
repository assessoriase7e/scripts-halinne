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
  INPUT_FOLDER: path.join(SCRIPT_DIR, "data/input/imagens-separadas-01"),
  CSV_FOLDER: path.join(SCRIPT_DIR, "data/table"),
  // Regex para identificar a imagem principal (case insensitive)
  // Exemplos: "1054-p.png", "1054-P.jpg", "1054_p.png"
  MAIN_IMAGE_REGEX: /-p\.(jpg|jpeg|png|gif|webp)$/i,
};

// Prisma client com DATABASE_URL customizada
let prisma: PrismaClient;

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

    if (record.Código && record.Descrição) {
      records.push(record);
    }
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

async function scanProductFolders(
  inputFolder: string
): Promise<Array<{ category: string; subcategory: string; folder: string }>> {
  const result: Array<{
    category: string;
    subcategory: string;
    folder: string;
  }> = [];

  const categoryFolders = await fs.readdir(inputFolder);

  for (const catFolder of categoryFolders) {
    const categoryPath = path.join(inputFolder, catFolder);
    const stat = await fs.stat(categoryPath);

    if (!stat.isDirectory()) continue;

    const catInfo = extractCategoryInfo(catFolder);
    if (!catInfo) {
      log(`Pasta mal formatada, pulando: ${catFolder}`);
      continue;
    }

    result.push({
      category: catInfo.category,
      subcategory: catInfo.subcategory,
      folder: categoryPath,
    });
  }

  return result;
}

async function getProductFolders(
  categoryPath: string
): Promise<Array<{ code: string; path: string; imageCount: number }>> {
  const products: Array<{ code: string; path: string; imageCount: number }> =
    [];

  const items = await fs.readdir(categoryPath);

  for (const item of items) {
    const itemPath = path.join(categoryPath, item);
    const stat = await fs.stat(itemPath);

    if (!stat.isDirectory()) continue;

    const images = await fs.readdir(itemPath);
    const imageCount = images.filter((img) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(img)
    ).length;

    if (imageCount > 0) {
      products.push({ code: item, path: itemPath, imageCount });
    }
  }

  return products;
}

/**
 * Ordena as imagens colocando a principal primeiro.
 * A imagem principal é identificada pela regex CONFIG.MAIN_IMAGE_REGEX
 * Por padrão: arquivos terminando em "-p" (ex: "1054-p.png", "1054-P.jpg")
 */
function sortImagesWithMainFirst(imagePaths: string[]): string[] {
  const sorted = [...imagePaths].sort((a, b) => {
    const fileNameA = path.basename(a);
    const fileNameB = path.basename(b);

    // A imagem principal é a que corresponde à regex configurada
    const isMainA = CONFIG.MAIN_IMAGE_REGEX.test(fileNameA);
    const isMainB = CONFIG.MAIN_IMAGE_REGEX.test(fileNameB);

    if (isMainA && !isMainB) return -1; // A vem primeiro
    if (!isMainA && isMainB) return 1; // B vem primeiro
    return 0; // Mantém ordem original
  });

  // Log sobre qual é a imagem principal
  const mainImage = sorted[0];
  const mainFileName = path.basename(mainImage);
  if (CONFIG.MAIN_IMAGE_REGEX.test(mainFileName)) {
    log(`Imagem principal identificada: ${mainFileName}`);
  } else {
    log(
      `Nenhuma imagem principal encontrada (regex: ${CONFIG.MAIN_IMAGE_REGEX}), usando: ${mainFileName}`
    );
  }

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
        const error = await response.json();
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

  // Decodifica o token para obter a API key real
  const { apiKey } = decodeUploadthingToken(CONFIG.UPLOADTHING_TOKEN);

  const urls: string[] = [];

  for (const imagePath of imagePaths) {
    const fileBuffer = await fs.readFile(imagePath);
    const fileName = path.basename(imagePath);
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
    formData.append(
      "file",
      new Blob([fileBuffer], { type: mimeType }),
      fileName
    );

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Erro ao fazer upload de ${fileName}: ${errorText}`);
    }

    // Usar a URL correta - preferência: ufsUrl > appUrl > fileUrl > construída
    const finalUrl =
      fileData.ufsUrl ||
      fileData.appUrl ||
      fileData.fileUrl ||
      `https://utfs.io/f/${fileKey}`;

    urls.push(finalUrl);
    log(`Upload concluído: ${finalUrl}`);
  }

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

async function getOrCreateCategory(
  name: string,
  parentId?: number,
  cache?: CategoryCacheFile,
  refreshCache: boolean = false
): Promise<{ id: number; cache: CategoryCacheFile }> {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
  let categoryCache = cache || (await loadCategoryCache());

  if (!refreshCache && categoryCache.entries[slug]) {
    return { id: categoryCache.entries[slug].id, cache: categoryCache };
  }

  let category = await prisma.category.findUnique({ where: { slug } });

  if (!category) {
    category = await prisma.category.create({
      data: {
        name,
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
        `Subcategoria criada: ${name} (ID: ${category.id}, parentId: ${parentId})`
      );
    } else {
      log(`Categoria pai criada: ${name} (ID: ${category.id})`);
    }
  } else {
    if (parentId) {
      log(`Subcategoria encontrada: ${name} (ID: ${category.id})`);
    } else {
      log(`Categoria pai encontrada: ${name} (ID: ${category.id})`);
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

  return { id: category.id, cache: categoryCache };
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
  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    const existing = await prisma.product.findUnique({
      where: { slug: uniqueSlug },
    });
    if (!existing) break;
    uniqueSlug = `${slug}-${counter}`;
    counter++;
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

    // Carregar dados CSV
    console.log("\nCarregando CSVs...");
    const csvData = await loadCSVData(CONFIG.CSV_FOLDER);
    console.log(`${Object.keys(csvData).length} registros carregados\n`);

    // Carregar caches
    let cache = await loadDescriptionCache();
    let categoryCache = await loadCategoryCache();
    console.log(
      `Cache de descricoes: ${Object.keys(cache.entries).length} entradas`
    );
    console.log(
      `Cache de categorias: ${
        Object.keys(categoryCache.entries).length
      } entradas\n`
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
        args.refreshCache
      );
      categoryCache = parentResult.cache;

      const subcategoryResult = await getOrCreateCategory(
        catInfo.subcategory,
        parentResult.id,
        categoryCache,
        args.refreshCache
      );
      categoryCache = subcategoryResult.cache;

      // Preparar lista de produtos válidos para processamento
      const validProducts: Array<{
        code: string;
        productData: ProductData;
        images: string[];
      }> = [];

      for (const prodFolder of productFolders) {
        totalProducts++;
        const code = prodFolder.code;
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

        // Parse do preço
        const priceStr = csv.Preço.replace(",", ".");
        const price = parseFloat(priceStr);
        if (isNaN(price)) {
          console.log(`   [SKIP] ${code}: preco invalido`);
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

        // Ordenar imagens com a principal primeiro
        const images = sortImagesWithMainFirst(rawImages);

        // Preparar dados do produto
        const productData: ProductData = {
          code,
          name: capitalizeWords(csv.Descrição),
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
              failedProducts.push({
                code: result.value.code,
                name: result.value.name,
                error: result.value.error,
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            // Promise rejeitada (não deveria acontecer pois tratamos erros internamente)
            failedProducts.push({
              code: "unknown",
              name: "unknown",
              error: result.reason?.message || String(result.reason),
              timestamp: new Date().toISOString(),
            });
          }
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
