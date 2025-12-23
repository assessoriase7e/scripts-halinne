#!/usr/bin/env tsx
"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var client_1 = require("@prisma/client");
var adapter_pg_1 = require("@prisma/adapter-pg");
var fs = require("fs/promises");
var path = require("path");
var readline = require("readline");
var url_1 = require("url");
var markdown_to_html_1 = require("./markdown-to-html");
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var SCRIPT_DIR = path.dirname(__filename);
// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
var CONFIG = {
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
    CATEGORY_SIMILARITY_CACHE_FILE: path.join(SCRIPT_DIR, ".cache/category-similarities.json"),
    INPUT_FOLDER: path.join(SCRIPT_DIR, "data/input/imagens-separadas-01"),
    CSV_FOLDER: path.join(SCRIPT_DIR, "data/table"),
    // Regex para identificar a imagem principal (case insensitive)
    // Exemplos: "1054-p.png", "1054-P.jpg", "1054_p.png"
    MAIN_IMAGE_REGEX: /-p\.(jpg|jpeg|png|gif|webp)$/i,
};
// Prisma client com DATABASE_URL customizada
var prisma;
// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================
function log(message, data) {
    var timestamp = new Date().toISOString();
    if (data) {
        console.log("[".concat(timestamp, "] ").concat(message), JSON.stringify(data, null, 2));
    }
    else {
        console.log("[".concat(timestamp, "] ").concat(message));
    }
}
function logError(message, error) {
    var timestamp = new Date().toISOString();
    var errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[".concat(timestamp, "] ERROR: ").concat(message, " - ").concat(errorMsg));
}
function parseArgs() {
    var args = process.argv.slice(2);
    var result = {
        refreshCache: false,
        skipCache: false,
        dryRun: false,
        force: false,
        help: false,
        yes: false,
    };
    for (var i = 0; i < args.length; i++) {
        var arg = args[i];
        if (arg === "--help" || arg === "-h") {
            result.help = true;
        }
        else if (arg === "--refresh-cache") {
            result.refreshCache = true;
            if (i + 1 < args.length &&
                !args[i + 1].startsWith("--") &&
                args[i + 1].match(/^\d/)) {
                result.refreshCodes = args[i + 1].split(",");
                i++;
            }
        }
        else if (arg === "--skip-cache") {
            result.skipCache = true;
        }
        else if (arg === "--dry-run") {
            result.dryRun = true;
        }
        else if (arg === "--force") {
            result.force = true;
        }
        else if (arg.startsWith("--openai-model=")) {
            result.openaiModel = arg.split("=")[1];
        }
        else if (arg.startsWith("--folder-path=")) {
            result.folderPath = arg.split("=")[1];
        }
        else if (arg.startsWith("--limit=")) {
            result.limit = parseInt(arg.split("=")[1], 10);
        }
        else if (arg === "--yes" || arg === "-y") {
            result.yes = true;
        }
    }
    return result;
}
function displayHelp() {
    console.log("\nPRODUCT IMPORTER - Importa\u00E7\u00E3o de Produtos\n\nREQUISITOS OBRIGAT\u00D3RIOS:\n  - PRODUCT_IMPORTER_DATABASE_URL: URL do banco PostgreSQL\n  - PRODUCT_IMPORTER_UPLOADTHING_TOKEN: Token do Uploadthing\n  - PRODUCT_IMPORTER_OPENAI_API_KEY: Chave da API OpenAI\n\nUSO:\n  npx tsx scripts/product-importer/index.ts [OPTIONS]\n\nOP\u00C7\u00D5ES:\n  --help, -h              Mostra ajuda\n  --yes, -y               Modo autom\u00E1tico (n\u00E3o pede confirma\u00E7\u00E3o)\n  --refresh-cache         Regenera descri\u00E7\u00F5es em cache\n  --refresh-cache=CODES   Regenera apenas c\u00F3digos espec\u00EDficos (ex: 1798,1799)\n  --skip-cache            N\u00E3o salva novo cache\n  --dry-run               Simula sem salvar no banco\n  --force                 For\u00E7a cria\u00E7\u00E3o mesmo se existir\n  --openai-model=MODEL    Define modelo OpenAI (padr\u00E3o: gpt-4o-mini)\n  --folder-path=PATH      Caminho customizado para imagens\n  --limit=N               Limita quantidade de produtos a processar\n\nESTRUTURA DE PASTA:\n  data/input/imagens-separadas-01/\n  \u251C\u2500\u2500 [categoria][subcategoria]/\n  \u2502   \u251C\u2500\u2500 c\u00F3digo_1/\n  \u2502   \u2502   \u2514\u2500\u2500 imagem.jpg\n  ");
}
/**
 * Formata nome de categoria: substitui traços por espaços e aplica capitalize em cada palavra
 * Ex: "aneis-ouro" → "Aneis Ouro", "colares-e-brincos-prata" → "Colares E Brincos Prata"
 */
function formatCategoryName(name) {
    return name
        .split("-")
        .map(function (word) { return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); })
        .join(" ");
}
function extractCategoryInfo(folderName) {
    var match = folderName.match(/\[([^\]]+)\]\[([^\]]+)\]/);
    if (!match)
        return null;
    return {
        category: formatCategoryName(match[1]),
        subcategory: formatCategoryName(match[2]),
    };
}
function parseCSV(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var content, lines, header, records, i, line, values, current, inQuotes, j, char, record, j;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs.readFile(filePath, "utf-8")];
                case 1:
                    content = _a.sent();
                    lines = content.split("\n");
                    if (lines.length < 2)
                        return [2 /*return*/, []];
                    header = lines[0]
                        .split(";")
                        .map(function (h) { return h.replace(/^["﻿]+|["]+$/g, "").trim(); });
                    records = [];
                    for (i = 1; i < lines.length; i++) {
                        line = lines[i].trim();
                        if (!line)
                            continue;
                        values = [];
                        current = "";
                        inQuotes = false;
                        for (j = 0; j < line.length; j++) {
                            char = line[j];
                            if (char === '"') {
                                inQuotes = !inQuotes;
                            }
                            else if (char === ";" && !inQuotes) {
                                values.push(current.replace(/^"(.+)"$/, "$1").trim());
                                current = "";
                            }
                            else {
                                current += char;
                            }
                        }
                        values.push(current.replace(/^"(.+)"$/, "$1").trim());
                        record = { ID: "", Código: "", Descrição: "", Preço: "" };
                        for (j = 0; j < header.length && j < values.length; j++) {
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
                    return [2 /*return*/, records];
            }
        });
    });
}
function loadCSVData(csvFolder) {
    return __awaiter(this, void 0, void 0, function () {
        var csvMap, files, _i, files_1, file, filePath, records, _a, records_1, record, code, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    csvMap = {};
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, fs.readdir(csvFolder)];
                case 2:
                    files = _b.sent();
                    _i = 0, files_1 = files;
                    _b.label = 3;
                case 3:
                    if (!(_i < files_1.length)) return [3 /*break*/, 6];
                    file = files_1[_i];
                    if (!file.endsWith(".csv"))
                        return [3 /*break*/, 5];
                    filePath = path.join(csvFolder, file);
                    return [4 /*yield*/, parseCSV(filePath)];
                case 4:
                    records = _b.sent();
                    for (_a = 0, records_1 = records; _a < records_1.length; _a++) {
                        record = records_1[_a];
                        code = record.Código;
                        if (code) {
                            csvMap[code] = record;
                        }
                    }
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_1 = _b.sent();
                    logError("Erro ao carregar CSVs", error_1);
                    throw error_1;
                case 8: return [2 /*return*/, csvMap];
            }
        });
    });
}
function loadDescriptionCache() {
    return __awaiter(this, void 0, void 0, function () {
        var content, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs.readFile(CONFIG.CACHE_FILE, "utf-8")];
                case 1:
                    content = _b.sent();
                    return [2 /*return*/, JSON.parse(content)];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, {
                            version: "1.0",
                            lastUpdated: new Date().toISOString(),
                            entries: {},
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function saveDescriptionCache(cache) {
    return __awaiter(this, void 0, void 0, function () {
        var dir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    dir = path.dirname(CONFIG.CACHE_FILE);
                    return [4 /*yield*/, fs.mkdir(dir, { recursive: true })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fs.writeFile(CONFIG.CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8")];
                case 2:
                    _a.sent();
                    log("Cache de descrições salvo");
                    return [2 /*return*/];
            }
        });
    });
}
function loadCategoryCache() {
    return __awaiter(this, void 0, void 0, function () {
        var content, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs.readFile(CONFIG.CATEGORY_CACHE_FILE, "utf-8")];
                case 1:
                    content = _b.sent();
                    return [2 /*return*/, JSON.parse(content)];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, {
                            version: "1.0",
                            lastUpdated: new Date().toISOString(),
                            entries: {},
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function saveCategoryCache(cache) {
    return __awaiter(this, void 0, void 0, function () {
        var dir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    dir = path.dirname(CONFIG.CATEGORY_CACHE_FILE);
                    return [4 /*yield*/, fs.mkdir(dir, { recursive: true })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fs.writeFile(CONFIG.CATEGORY_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8")];
                case 2:
                    _a.sent();
                    log("Cache de categorias salvo");
                    return [2 /*return*/];
            }
        });
    });
}
function loadSimilarityCache() {
    return __awaiter(this, void 0, void 0, function () {
        var content, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs.readFile(CONFIG.CATEGORY_SIMILARITY_CACHE_FILE, "utf-8")];
                case 1:
                    content = _b.sent();
                    return [2 /*return*/, JSON.parse(content)];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, {
                            version: "1.0",
                            lastUpdated: new Date().toISOString(),
                            entries: {},
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function saveSimilarityCache(cache) {
    return __awaiter(this, void 0, void 0, function () {
        var dir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    dir = path.dirname(CONFIG.CATEGORY_SIMILARITY_CACHE_FILE);
                    return [4 /*yield*/, fs.mkdir(dir, { recursive: true })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fs.writeFile(CONFIG.CATEGORY_SIMILARITY_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8")];
                case 2:
                    _a.sent();
                    log("Cache de similaridades de categorias salvo");
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Gera uma chave única para o cache de similaridade baseada no nome e parentId
 */
function getSimilarityCacheKey(name, parentId) {
    var normalizedName = name.toLowerCase().trim();
    var parentKey = parentId !== undefined ? "_parent_".concat(parentId) : "_root";
    return "".concat(normalizedName).concat(parentKey);
}
function scanProductFolders(inputFolder) {
    return __awaiter(this, void 0, void 0, function () {
        var result, categoryFolders, _i, categoryFolders_1, catFolder, categoryPath, stat, catInfo;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    result = [];
                    return [4 /*yield*/, fs.readdir(inputFolder)];
                case 1:
                    categoryFolders = _a.sent();
                    _i = 0, categoryFolders_1 = categoryFolders;
                    _a.label = 2;
                case 2:
                    if (!(_i < categoryFolders_1.length)) return [3 /*break*/, 5];
                    catFolder = categoryFolders_1[_i];
                    categoryPath = path.join(inputFolder, catFolder);
                    return [4 /*yield*/, fs.stat(categoryPath)];
                case 3:
                    stat = _a.sent();
                    if (!stat.isDirectory())
                        return [3 /*break*/, 4];
                    catInfo = extractCategoryInfo(catFolder);
                    if (!catInfo) {
                        log("Pasta mal formatada, pulando: ".concat(catFolder));
                        return [3 /*break*/, 4];
                    }
                    result.push({
                        category: catInfo.category,
                        subcategory: catInfo.subcategory,
                        folder: categoryPath,
                    });
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, result];
            }
        });
    });
}
function getProductFolders(categoryPath) {
    return __awaiter(this, void 0, void 0, function () {
        var products, items, _i, items_1, item, itemPath, stat, images, imageCount;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    products = [];
                    return [4 /*yield*/, fs.readdir(categoryPath)];
                case 1:
                    items = _a.sent();
                    _i = 0, items_1 = items;
                    _a.label = 2;
                case 2:
                    if (!(_i < items_1.length)) return [3 /*break*/, 6];
                    item = items_1[_i];
                    itemPath = path.join(categoryPath, item);
                    return [4 /*yield*/, fs.stat(itemPath)];
                case 3:
                    stat = _a.sent();
                    if (!stat.isDirectory())
                        return [3 /*break*/, 5];
                    return [4 /*yield*/, fs.readdir(itemPath)];
                case 4:
                    images = _a.sent();
                    imageCount = images.filter(function (img) {
                        return /\.(jpg|jpeg|png|gif|webp)$/i.test(img);
                    }).length;
                    if (imageCount > 0) {
                        products.push({ code: item, path: itemPath, imageCount: imageCount });
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/, products];
            }
        });
    });
}
/**
 * Ordena as imagens colocando a principal primeiro.
 * A imagem principal é identificada pela regex CONFIG.MAIN_IMAGE_REGEX
 * Por padrão: arquivos terminando em "-p" (ex: "1054-p.png", "1054-P.jpg")
 */
function sortImagesWithMainFirst(imagePaths) {
    var sorted = __spreadArray([], imagePaths, true).sort(function (a, b) {
        var fileNameA = path.basename(a);
        var fileNameB = path.basename(b);
        // A imagem principal é a que corresponde à regex configurada
        var isMainA = CONFIG.MAIN_IMAGE_REGEX.test(fileNameA);
        var isMainB = CONFIG.MAIN_IMAGE_REGEX.test(fileNameB);
        if (isMainA && !isMainB)
            return -1; // A vem primeiro
        if (!isMainA && isMainB)
            return 1; // B vem primeiro
        return 0; // Mantém ordem original
    });
    // Log sobre qual é a imagem principal
    var mainImage = sorted[0];
    var mainFileName = path.basename(mainImage);
    if (CONFIG.MAIN_IMAGE_REGEX.test(mainFileName)) {
        log("Imagem principal identificada: ".concat(mainFileName));
    }
    else {
        log("Nenhuma imagem principal encontrada (regex: ".concat(CONFIG.MAIN_IMAGE_REGEX, "), usando: ").concat(mainFileName));
    }
    return sorted;
}
function validateProductNotExists(barcode_1) {
    return __awaiter(this, arguments, void 0, function (barcode, force) {
        var existing;
        if (force === void 0) { force = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (force)
                        return [2 /*return*/, true];
                    return [4 /*yield*/, prisma.product.findFirst({
                            where: { gtin: barcode, storeId: CONFIG.STORE_ID },
                        })];
                case 1:
                    existing = _a.sent();
                    return [2 /*return*/, !existing];
            }
        });
    });
}
function extractProductInfo(productName) {
    var upperName = productName.toUpperCase();
    var material = "Semijoia";
    if (upperName.includes("OURO"))
        material = "Ouro";
    else if (upperName.includes("PRATA"))
        material = "Prata";
    else if (upperName.includes("BANHADO"))
        material = "Banhado";
    var type = "Joia";
    if (upperName.includes("ANEL"))
        type = "Anel";
    else if (upperName.includes("BRINCO"))
        type = "Brinco";
    else if (upperName.includes("PULSEIRA"))
        type = "Pulseira";
    else if (upperName.includes("PINGENTE"))
        type = "Pingente";
    else if (upperName.includes("COLAR"))
        type = "Colar";
    else if (upperName.includes("TORNOZELEIRA"))
        type = "Tornozeleira";
    else if (upperName.includes("GARGANTILHA"))
        type = "Gargantilha";
    var weightMatch = productName.match(/(\d+(?:[.,]\d+)?)\s*g/i);
    var weight = weightMatch ? weightMatch[1].replace(",", ".") : undefined;
    return { material: material, type: type, weight: weight };
}
// ============================================================================
// UTILITÁRIOS DE PROCESSAMENTO PARALELO
// ============================================================================
var BATCH_SIZE = 3; // Reduzido para evitar rate limit da OpenAI
var BATCH_DELAY_MS = 2000; // Delay entre batches para evitar rate limit
/**
 * Capitaliza cada palavra de uma string (Title Case)
 */
function capitalizeWords(str) {
    return str
        .toLowerCase()
        .split(" ")
        .map(function (word) { return word.charAt(0).toUpperCase() + word.slice(1); })
        .join(" ");
}
/**
 * Divide um array em chunks de tamanho específico
 */
function chunkArray(array, size) {
    var chunks = [];
    for (var i = 0; i < array.length; i += size) {
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
function retryWithBackoff(fn_1) {
    return __awaiter(this, arguments, void 0, function (fn, maxAttempts, initialDelayMs) {
        var lastError, _loop_1, attempt, state_1;
        if (maxAttempts === void 0) { maxAttempts = 3; }
        if (initialDelayMs === void 0) { initialDelayMs = 1000; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    lastError = null;
                    _loop_1 = function (attempt) {
                        var _b, error_2, delayMs_1;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    _c.trys.push([0, 2, , 5]);
                                    _b = {};
                                    return [4 /*yield*/, fn()];
                                case 1: return [2 /*return*/, (_b.value = _c.sent(), _b)];
                                case 2:
                                    error_2 = _c.sent();
                                    lastError = error_2 instanceof Error ? error_2 : new Error(String(error_2));
                                    if (!(attempt < maxAttempts)) return [3 /*break*/, 4];
                                    delayMs_1 = initialDelayMs * Math.pow(2, attempt - 1);
                                    log("Tentativa ".concat(attempt, "/").concat(maxAttempts, " falhou. Aguardando ").concat(delayMs_1, "ms antes da pr\u00F3xima tentativa..."), {
                                        error: lastError.message,
                                    });
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delayMs_1); })];
                                case 3:
                                    _c.sent();
                                    _c.label = 4;
                                case 4: return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= maxAttempts)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: throw new Error("Falha ap\u00F3s ".concat(maxAttempts, " tentativas: ").concat(lastError === null || lastError === void 0 ? void 0 : lastError.message));
            }
        });
    });
}
/**
 * Converte imagem para base64 para envio à API de visão
 */
function imageToBase64(imagePath) {
    return __awaiter(this, void 0, void 0, function () {
        var buffer, base64, ext, mimeTypes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs.readFile(imagePath)];
                case 1:
                    buffer = _a.sent();
                    base64 = buffer.toString("base64");
                    ext = path.extname(imagePath).toLowerCase();
                    mimeTypes = {
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".png": "image/png",
                        ".gif": "image/gif",
                        ".webp": "image/webp",
                    };
                    return [2 /*return*/, { base64: base64, mimeType: mimeTypes[ext] || "image/jpeg" }];
            }
        });
    });
}
/**
 * Extrai o material (ouro/prata/rodio) da subcategoria
 */
function extractMaterialFromSubcategory(subcategory) {
    var lower = subcategory.toLowerCase();
    if (lower.includes("prata"))
        return "prata";
    if (lower.includes("rodio") || lower.includes("ródio"))
        return "rodio";
    return "ouro"; // default é ouro (banhado)
}
function generateDescriptions(productName_1, csvData_1, imagePaths_1, subcategory_1) {
    return __awaiter(this, arguments, void 0, function (productName, csvData, imagePaths, subcategory, model) {
        var productInfo, materialType, imagesToAnalyze, imageContents, _i, imagesToAnalyze_1, imgPath, _a, base64, mimeType, error_3, materialConfig, _b, materialInfo, materialLabel, prompt, messageContent, content, jsonString, codeBlockMatch, jsonMatch, parsed, cleaned, shortDesc, longMarkdown, longDesc;
        var _this = this;
        if (model === void 0) { model = CONFIG.OPENAI_MODEL; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!CONFIG.OPENAI_API_KEY) {
                        throw new Error("PRODUCT_IMPORTER_OPENAI_API_KEY não configurada - obrigatório para gerar descrições");
                    }
                    productInfo = extractProductInfo(productName);
                    materialType = extractMaterialFromSubcategory(subcategory);
                    imagesToAnalyze = imagePaths.slice(0, 3);
                    log("Analisando ".concat(imagesToAnalyze.length, " imagem(ns) com IA"), {
                        images: imagesToAnalyze.map(function (p) { return path.basename(p); }),
                    });
                    imageContents = [];
                    _i = 0, imagesToAnalyze_1 = imagesToAnalyze;
                    _c.label = 1;
                case 1:
                    if (!(_i < imagesToAnalyze_1.length)) return [3 /*break*/, 6];
                    imgPath = imagesToAnalyze_1[_i];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, imageToBase64(imgPath)];
                case 3:
                    _a = _c.sent(), base64 = _a.base64, mimeType = _a.mimeType;
                    imageContents.push({
                        type: "image_url",
                        image_url: { url: "data:".concat(mimeType, ";base64,").concat(base64) },
                    });
                    log("Imagem carregada: ".concat(path.basename(imgPath)));
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _c.sent();
                    log("Erro ao carregar imagem ".concat(path.basename(imgPath), ": ").concat(error_3 instanceof Error ? error_3.message : String(error_3)));
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    materialConfig = {
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
                    _b = materialConfig[materialType], materialInfo = _b.info, materialLabel = _b.label;
                    prompt = "Voc\u00EA \u00E9 o propriet\u00E1rio de uma loja de semijoias escrevendo descri\u00E7\u00F5es para seu cat\u00E1logo online.\n\nIMPORTANTE SOBRE O MATERIAL: ".concat(materialInfo, "\n\nPRODUTO: \"").concat(productName, "\"\n- Tipo: ").concat(productInfo.type, "\n- Material: ").concat(materialLabel, "\n").concat(productInfo.weight ? "- Peso: ".concat(productInfo.weight, "g") : "", "\n\nINSTRU\u00C7\u00D5ES:\nAnalise as imagens do produto \"").concat(productName, "\" e escreva descri\u00E7\u00F5es com conhecimento e autoridade. Voc\u00EA conhece bem seu produto.\n\nGERE 2 DESCRI\u00C7\u00D5ES EM JSON:\n\n1. \"short\": M\u00E1ximo 100 caracteres. Descri\u00E7\u00E3o objetiva e elegante da pe\u00E7a.\n\n2. \"long\": M\u00E1ximo 550 caracteres em MARKDOWN. Estrutura:\n   - Um par\u00E1grafo descritivo sobre a pe\u00E7a (2-3 frases)\n   - Lista de caracter\u00EDsticas com bullets (-)\n   - Uma frase final com DICA DE USO: sugira uma ocasi\u00E3o ou como usar no dia a dia (ex: \"Combina bem com looks casuais e sociais\", \"\u00D3tima op\u00E7\u00E3o para presentear\", \"Vers\u00E1til para uso di\u00E1rio ou eventos especiais\")\n\nREGRAS OBRIGAT\u00D3RIAS:\n- Escreva com CERTEZA e AUTORIDADE - voc\u00EA conhece o produto\n- NUNCA use: \"talvez\", \"provavelmente\", \"parece\", \"pode ser\", \"aparenta\", \"sugere\"\n- NUNCA use frases de marketing exagerado: \"Descubra\", \"Apresentamos\", \"Perfeito para\", \"Ideal para\"\n- Descreva materiais, acabamentos, pedras e detalhes que voc\u00EA v\u00EA na imagem\n- Use linguagem profissional de joalheria\n- Seja descritivo mas natural, como se estivesse apresentando a pe\u00E7a a uma cliente\n- A dica de uso deve ser pr\u00E1tica e relacionada ao cotidiano\n\nEXEMPLO DE DESCRI\u00C7\u00C3O LONGA:\n\"Este brinco argola possui design cl\u00E1ssico com acabamento polido em banho de ouro 18k.\n\n- Formato circular elegante\n- Zirc\u00F4nias brancas cravejadas\n- Fecho tipo tarraxa\n\nVers\u00E1til para compor looks do dia a dia ou ocasi\u00F5es especiais.\"\n\nRetorne apenas o JSON:\n{\n  \"short\": \"descri\u00E7\u00E3o curta\",\n  \"long\": \"descri\u00E7\u00E3o longa em markdown com dica de uso\"\n}");
                    messageContent = __spreadArray([{ type: "text", text: prompt }], imageContents, true);
                    log("Enviando imagens para análise da OpenAI...");
                    return [4 /*yield*/, retryWithBackoff(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, error, data, responseContent;
                            var _a, _b, _c, _d;
                            return __generator(this, function (_e) {
                                switch (_e.label) {
                                    case 0: return [4 /*yield*/, fetch("https://api.openai.com/v1/chat/completions", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                Authorization: "Bearer ".concat(CONFIG.OPENAI_API_KEY),
                                            },
                                            body: JSON.stringify({
                                                model: model,
                                                messages: [{ role: "user", content: messageContent }],
                                                max_completion_tokens: 500,
                                            }),
                                        })];
                                    case 1:
                                        response = _e.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.json()];
                                    case 2:
                                        error = (_e.sent());
                                        throw new Error("OpenAI API error: ".concat(((_a = error.error) === null || _a === void 0 ? void 0 : _a.message) || response.statusText));
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4:
                                        data = (_e.sent());
                                        responseContent = ((_d = (_c = (_b = data.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || "";
                                        // Validar que temos conteúdo na resposta
                                        if (!responseContent || responseContent.trim() === "") {
                                            throw new Error("OpenAI retornou resposta vazia");
                                        }
                                        return [2 /*return*/, { content: responseContent }];
                                }
                            });
                        }); }, 3, // máximo de tentativas
                        1000 // delay inicial em ms
                        )];
                case 7:
                    content = (_c.sent()).content;
                    jsonString = null;
                    codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    if (codeBlockMatch) {
                        jsonString = codeBlockMatch[1].trim();
                    }
                    else {
                        jsonMatch = content.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            jsonString = jsonMatch[0];
                        }
                    }
                    if (!jsonString) {
                        throw new Error("Resposta da OpenAI n\u00E3o cont\u00E9m JSON v\u00E1lido. Resposta recebida: ".concat(content.substring(0, 300)));
                    }
                    try {
                        // Tenta fazer parse do JSON
                        parsed = JSON.parse(jsonString);
                    }
                    catch (e) {
                        // Se falhar, tenta limpar caracteres de controle e espaços extras
                        try {
                            cleaned = jsonString
                                .replace(/[\x00-\x1F\x7F]/g, "") // Remove caracteres de controle
                                .replace(/,\s*}/g, "}") // Remove vírgulas antes de }
                                .replace(/,\s*]/g, "]");
                            parsed = JSON.parse(cleaned);
                        }
                        catch (cleanError) {
                            throw new Error("Erro ao fazer parse do JSON (original: ".concat(jsonString.substring(0, 150), "): ").concat(String(e)));
                        }
                    }
                    shortDesc = (parsed.short || "").substring(0, 120).trim();
                    longMarkdown = (parsed.long || "").substring(0, 500).trim();
                    if (!shortDesc || !longMarkdown) {
                        throw new Error("Descrições vazias retornadas pela API");
                    }
                    log("Análise de imagem concluída - descrição gerada com sucesso");
                    longDesc = (0, markdown_to_html_1.markdownToHtml)(longMarkdown);
                    return [2 /*return*/, { short: shortDesc, long: longDesc }];
            }
        });
    });
}
function getOrGenerateDescriptions(cache_1, code_1, productName_1, csvData_1, imagePaths_1, subcategory_1, refreshCache_1) {
    return __awaiter(this, arguments, void 0, function (cache, code, productName, csvData, imagePaths, subcategory, refreshCache, model) {
        var _a, short, long;
        if (model === void 0) { model = CONFIG.OPENAI_MODEL; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!refreshCache && cache.entries[code]) {
                        log("Usando descri\u00E7\u00E3o do cache para ".concat(code));
                        return [2 /*return*/, {
                                short: cache.entries[code].shortDescription,
                                long: cache.entries[code].longDescription,
                                fromCache: true,
                            }];
                    }
                    return [4 /*yield*/, generateDescriptions(productName, csvData, imagePaths, subcategory, model)];
                case 1:
                    _a = _b.sent(), short = _a.short, long = _a.long;
                    cache.entries[code] = {
                        code: code,
                        productName: productName,
                        shortDescription: short,
                        longDescription: long,
                        generatedAt: new Date().toISOString(),
                    };
                    return [2 /*return*/, { short: short, long: long, fromCache: false }];
            }
        });
    });
}
// ============================================================================
// UPLOADTHING - OBRIGATÓRIO (sem fallback)
// ============================================================================
/**
 * Decodifica o token do Uploadthing para extrair a API key
 * O token pode ser um JWT ou um Base64 string direto
 */
function decodeUploadthingToken(token) {
    try {
        // Remove aspas se existirem
        var cleanToken = token.replace(/^["']|["']$/g, "");
        var payload = void 0;
        // Verifica se é formato JWT (tem 3 partes separadas por ponto)
        if (cleanToken.includes(".")) {
            var parts = cleanToken.split(".");
            if (parts.length === 3) {
                // JWT format: header.payload.signature
                payload = Buffer.from(parts[1], "base64").toString("utf-8");
            }
            else {
                throw new Error("Formato de token inválido");
            }
        }
        else {
            // É um Base64 string direto
            payload = Buffer.from(cleanToken, "base64").toString("utf-8");
        }
        var data = JSON.parse(payload);
        if (!data.apiKey || !data.appId) {
            throw new Error("Token não contém apiKey ou appId");
        }
        return { apiKey: data.apiKey, appId: data.appId };
    }
    catch (error) {
        throw new Error("Erro ao decodificar token do Uploadthing: ".concat(error instanceof Error ? error.message : String(error)));
    }
}
function uploadImages(imagePaths) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, urls, _i, imagePaths_1, imagePath, fileBuffer, fileName, mimeType, fileSize, presignedResponse, errorText, presignedData, fileData, uploadUrl, fields, fileKey, formData, _a, _b, _c, key, value, uint8Array, uploadResponse, errorText, finalUrl;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!CONFIG.UPLOADTHING_TOKEN) {
                        throw new Error("PRODUCT_IMPORTER_UPLOADTHING_TOKEN não configurado - obrigatório para upload de imagens");
                    }
                    apiKey = decodeUploadthingToken(CONFIG.UPLOADTHING_TOKEN).apiKey;
                    urls = [];
                    _i = 0, imagePaths_1 = imagePaths;
                    _d.label = 1;
                case 1:
                    if (!(_i < imagePaths_1.length)) return [3 /*break*/, 11];
                    imagePath = imagePaths_1[_i];
                    return [4 /*yield*/, fs.readFile(imagePath)];
                case 2:
                    fileBuffer = _d.sent();
                    fileName = path.basename(imagePath);
                    mimeType = getMimeType(imagePath);
                    fileSize = fileBuffer.length;
                    log("Fazendo upload: ".concat(fileName, " (").concat(fileSize, " bytes)"));
                    return [4 /*yield*/, fetch("https://api.uploadthing.com/v6/uploadFiles", {
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
                        })];
                case 3:
                    presignedResponse = _d.sent();
                    if (!!presignedResponse.ok) return [3 /*break*/, 5];
                    return [4 /*yield*/, presignedResponse.text()];
                case 4:
                    errorText = _d.sent();
                    throw new Error("Erro ao obter presigned URL para ".concat(fileName, ": ").concat(errorText));
                case 5: return [4 /*yield*/, presignedResponse.json()];
                case 6:
                    presignedData = (_d.sent());
                    if (!presignedData.data || presignedData.data.length === 0) {
                        throw new Error("Resposta inv\u00E1lida do Uploadthing para ".concat(fileName));
                    }
                    fileData = presignedData.data[0];
                    uploadUrl = fileData.url, fields = fileData.fields, fileKey = fileData.key;
                    // Log da resposta para debug
                    log("Presigned URL obtida", {
                        fileKey: fileKey,
                        hasUfsUrl: !!fileData.ufsUrl,
                        hasAppUrl: !!fileData.appUrl,
                        hasFileUrl: !!fileData.fileUrl,
                    });
                    formData = new FormData();
                    for (_a = 0, _b = Object.entries(fields); _a < _b.length; _a++) {
                        _c = _b[_a], key = _c[0], value = _c[1];
                        formData.append(key, value);
                    }
                    uint8Array = new Uint8Array(fileBuffer);
                    formData.append("file", new Blob([uint8Array], { type: mimeType }), fileName);
                    return [4 /*yield*/, fetch(uploadUrl, {
                            method: "POST",
                            body: formData,
                        })];
                case 7:
                    uploadResponse = _d.sent();
                    if (!!uploadResponse.ok) return [3 /*break*/, 9];
                    return [4 /*yield*/, uploadResponse.text()];
                case 8:
                    errorText = _d.sent();
                    throw new Error("Erro ao fazer upload de ".concat(fileName, ": ").concat(errorText));
                case 9:
                    finalUrl = fileData.ufsUrl ||
                        fileData.appUrl ||
                        fileData.fileUrl ||
                        "https://utfs.io/f/".concat(fileKey);
                    urls.push(finalUrl);
                    log("Upload conclu\u00EDdo: ".concat(finalUrl));
                    _d.label = 10;
                case 10:
                    _i++;
                    return [3 /*break*/, 1];
                case 11: return [2 /*return*/, urls];
            }
        });
    });
}
function getMimeType(filePath) {
    var ext = path.extname(filePath).toLowerCase();
    var mimeTypes = {
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
function findSimilarCategory(name_1, parentId_1, similarityCache_1) {
    return __awaiter(this, arguments, void 0, function (name, parentId, similarityCache, refreshCache) {
        var cacheKey, cached, category, existingCategories, existing, normalizedNew, normalizedExisting, categoryNames, prompt, response, data, similarName_1, found, error_4;
        var _this = this;
        var _a, _b, _c, _d;
        if (refreshCache === void 0) { refreshCache = false; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    cacheKey = getSimilarityCacheKey(name, parentId);
                    if (!(!refreshCache && similarityCache.entries[cacheKey])) return [3 /*break*/, 2];
                    cached = similarityCache.entries[cacheKey];
                    log("Cache de similaridade encontrado: \"".concat(name, "\" \u2192 \"").concat(cached.matchedCategoryName, "\" (ID: ").concat(cached.matchedCategoryId, ")"));
                    return [4 /*yield*/, prisma.category.findUnique({
                            where: { id: cached.matchedCategoryId },
                        })];
                case 1:
                    category = _e.sent();
                    if (category && !category.isDeleted) {
                        return [2 /*return*/, { id: category.id, name: category.name }];
                    }
                    else {
                        // Categoria foi deletada, remover do cache
                        delete similarityCache.entries[cacheKey];
                        log("Categoria do cache foi deletada, removendo entrada: ".concat(cacheKey));
                    }
                    _e.label = 2;
                case 2: return [4 /*yield*/, prisma.category.findMany({
                        where: {
                            storeId: CONFIG.STORE_ID,
                            parentId: parentId !== null && parentId !== void 0 ? parentId : null,
                            isDeleted: false,
                        },
                        select: { id: true, name: true },
                    })];
                case 3:
                    existingCategories = _e.sent();
                    if (existingCategories.length === 0) {
                        log("Nenhuma categoria existente no n\u00EDvel ".concat(parentId !== null && parentId !== void 0 ? parentId : "raiz", " para comparar"));
                        return [2 /*return*/, null];
                    }
                    // Se houver apenas uma categoria, fazer comparação simples primeiro
                    if (existingCategories.length === 1) {
                        existing = existingCategories[0];
                        normalizedNew = name.toLowerCase().trim();
                        normalizedExisting = existing.name.toLowerCase().trim();
                        // Comparação simples: se os nomes normalizados forem muito similares
                        if (normalizedNew === normalizedExisting) {
                            log("Categoria exata encontrada: \"".concat(name, "\" = \"").concat(existing.name, "\""));
                            similarityCache.entries[cacheKey] = {
                                newName: name,
                                parentId: parentId,
                                matchedCategoryId: existing.id,
                                matchedCategoryName: existing.name,
                                checkedAt: new Date().toISOString(),
                            };
                            return [2 /*return*/, { id: existing.id, name: existing.name }];
                        }
                    }
                    categoryNames = existingCategories.map(function (c) { return c.name; }).join(", ");
                    prompt = "Voc\u00EA \u00E9 um assistente que verifica se nomes de categorias s\u00E3o similares ou equivalentes.\n\nNOVA CATEGORIA: \"".concat(name, "\"\nCATEGORIAS EXISTENTES: ").concat(categoryNames, "\n\nINSTRU\u00C7\u00D5ES:\n- Verifique se a nova categoria \u00E9 similar ou equivalente a alguma existente\n- Considere varia\u00E7\u00F5es: singular/plural, acentos, sin\u00F4nimos, abrevia\u00E7\u00F5es\n- Exemplos: \"Aneis\" = \"An\u00E9is\", \"Brincos\" = \"Brinco\", \"Colares\" = \"Colar\", \"Acessorios\" = \"Acess\u00F3rios\"\n- Retorne APENAS o nome EXATO da categoria existente mais similar (copie exatamente como est\u00E1 na lista)\n- Se nenhuma for similar, retorne \"null\"\n\nResposta (apenas o nome exato ou \"null\"):");
                    _e.label = 4;
                case 4:
                    _e.trys.push([4, 7, , 8]);
                    log("Verificando similaridade com IA para: \"".concat(name, "\""));
                    return [4 /*yield*/, retryWithBackoff(function () { return __awaiter(_this, void 0, void 0, function () {
                            var res, error;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, fetch("https://api.openai.com/v1/chat/completions", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                Authorization: "Bearer ".concat(CONFIG.OPENAI_API_KEY),
                                            },
                                            body: JSON.stringify({
                                                model: CONFIG.OPENAI_MODEL,
                                                messages: [{ role: "user", content: prompt }],
                                                max_tokens: 100,
                                                temperature: 0.3,
                                            }),
                                        })];
                                    case 1:
                                        res = _b.sent();
                                        if (!!res.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, res.json()];
                                    case 2:
                                        error = (_b.sent());
                                        throw new Error("OpenAI API error: ".concat(((_a = error.error) === null || _a === void 0 ? void 0 : _a.message) || res.statusText));
                                    case 3: return [2 /*return*/, res];
                                }
                            });
                        }); }, 3, 1000)];
                case 5:
                    response = _e.sent();
                    return [4 /*yield*/, response.json()];
                case 6:
                    data = (_e.sent());
                    similarName_1 = (_d = (_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim();
                    if (similarName_1 && similarName_1.toLowerCase() !== "null") {
                        found = existingCategories.find(function (c) { return c.name.toLowerCase() === similarName_1.toLowerCase(); });
                        if (found) {
                            log("\u2705 Categoria similar encontrada via IA: \"".concat(name, "\" \u2192 \"").concat(found.name, "\" (ID: ").concat(found.id, ")"));
                            // Salvar no cache
                            similarityCache.entries[cacheKey] = {
                                newName: name,
                                parentId: parentId,
                                matchedCategoryId: found.id,
                                matchedCategoryName: found.name,
                                checkedAt: new Date().toISOString(),
                            };
                            return [2 /*return*/, { id: found.id, name: found.name }];
                        }
                        else {
                            log("\u26A0\uFE0F IA retornou \"".concat(similarName_1, "\" mas n\u00E3o foi encontrada nas categorias existentes"));
                        }
                    }
                    else {
                        log("Nenhuma categoria similar encontrada para: \"".concat(name, "\""));
                    }
                    return [3 /*break*/, 8];
                case 7:
                    error_4 = _e.sent();
                    logError("Erro ao verificar categoria similar com IA", error_4);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/, null];
            }
        });
    });
}
function getOrCreateCategory(name_1, parentId_1, cache_1, similarityCache_1) {
    return __awaiter(this, arguments, void 0, function (name, parentId, cache, similarityCache, refreshCache) {
        var slug, categoryCache, _a, category, similar, matchedSlug;
        var _b, _c;
        if (refreshCache === void 0) { refreshCache = false; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    slug = name
                        .toLowerCase()
                        .replace(/\s+/g, "-")
                        .replace(/[^\w-]/g, "");
                    _a = cache;
                    if (_a) return [3 /*break*/, 2];
                    return [4 /*yield*/, loadCategoryCache()];
                case 1:
                    _a = (_d.sent());
                    _d.label = 2;
                case 2:
                    categoryCache = _a;
                    if (!refreshCache && categoryCache.entries[slug]) {
                        return [2 /*return*/, {
                                id: categoryCache.entries[slug].id,
                                cache: categoryCache,
                                similarityCache: similarityCache,
                            }];
                    }
                    return [4 /*yield*/, prisma.category.findUnique({ where: { slug: slug } })];
                case 3:
                    category = _d.sent();
                    if (!!category) return [3 /*break*/, 6];
                    return [4 /*yield*/, findSimilarCategory(name, parentId, similarityCache, refreshCache)];
                case 4:
                    similar = _d.sent();
                    if (!similar) return [3 /*break*/, 6];
                    return [4 /*yield*/, prisma.category.findUnique({
                            where: { id: similar.id },
                        })];
                case 5:
                    category = _d.sent();
                    if (category) {
                        log("\u2705 Usando categoria similar existente: \"".concat(name, "\" \u2192 \"").concat(category.name, "\" (ID: ").concat(category.id, ")"));
                        matchedSlug = category.slug;
                        categoryCache.entries[matchedSlug] = {
                            id: category.id,
                            name: category.name,
                            slug: category.slug,
                            storeId: category.storeId,
                            parentId: (_b = category.parentId) !== null && _b !== void 0 ? _b : undefined,
                            createdAt: new Date().toISOString(),
                        };
                    }
                    _d.label = 6;
                case 6:
                    if (!!category) return [3 /*break*/, 8];
                    return [4 /*yield*/, prisma.category.create({
                            data: {
                                name: name,
                                slug: slug,
                                storeId: CONFIG.STORE_ID,
                                cashbackValue: 0,
                                cashbackPercent: 0,
                                status: "active",
                                parentId: parentId,
                            },
                        })];
                case 7:
                    category = _d.sent();
                    if (parentId) {
                        log("Subcategoria criada: ".concat(name, " (ID: ").concat(category.id, ", parentId: ").concat(parentId, ")"));
                    }
                    else {
                        log("Categoria pai criada: ".concat(name, " (ID: ").concat(category.id, ")"));
                    }
                    return [3 /*break*/, 9];
                case 8:
                    if (parentId) {
                        log("Subcategoria encontrada: ".concat(name, " (ID: ").concat(category.id, ")"));
                    }
                    else {
                        log("Categoria pai encontrada: ".concat(name, " (ID: ").concat(category.id, ")"));
                    }
                    _d.label = 9;
                case 9:
                    categoryCache.entries[slug] = {
                        id: category.id,
                        name: category.name,
                        slug: category.slug,
                        storeId: category.storeId,
                        parentId: (_c = category.parentId) !== null && _c !== void 0 ? _c : undefined,
                        createdAt: new Date().toISOString(),
                    };
                    return [2 /*return*/, { id: category.id, cache: categoryCache, similarityCache: similarityCache }];
            }
        });
    });
}
// ============================================================================
// CRIAR PRODUTO
// ============================================================================
function createProduct(data_1, categoryId_1, imageUrls_1, descriptions_1) {
    return __awaiter(this, arguments, void 0, function (data, categoryId, imageUrls, descriptions, force) {
        var sku, existingBySku, slug, uniqueSlug, counter, existing, product, i;
        if (force === void 0) { force = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sku = "HLN-".concat(data.code);
                    if (!force) return [3 /*break*/, 4];
                    return [4 /*yield*/, prisma.product.findUnique({ where: { sku: sku } })];
                case 1:
                    existingBySku = _a.sent();
                    if (!existingBySku) return [3 /*break*/, 4];
                    log("Deletando produto existente (force mode): ".concat(sku));
                    return [4 /*yield*/, prisma.image.deleteMany({ where: { productId: existingBySku.id } })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, prisma.product.delete({ where: { id: existingBySku.id } })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    slug = data.name
                        .toLowerCase()
                        .replace(/\s+/g, "-")
                        .replace(/[^\w-]/g, "");
                    uniqueSlug = slug;
                    counter = 1;
                    _a.label = 5;
                case 5:
                    if (!true) return [3 /*break*/, 7];
                    return [4 /*yield*/, prisma.product.findUnique({
                            where: { slug: uniqueSlug },
                        })];
                case 6:
                    existing = _a.sent();
                    if (!existing)
                        return [3 /*break*/, 7];
                    uniqueSlug = "".concat(slug, "-").concat(counter);
                    counter++;
                    return [3 /*break*/, 5];
                case 7: return [4 /*yield*/, prisma.product.create({
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
                            sku: sku,
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
                    })];
                case 8:
                    product = _a.sent();
                    i = 0;
                    _a.label = 9;
                case 9:
                    if (!(i < imageUrls.length)) return [3 /*break*/, 12];
                    return [4 /*yield*/, prisma.image.create({
                            data: {
                                url: imageUrls[i],
                                sortOrder: i,
                                productId: product.id,
                            },
                        })];
                case 10:
                    _a.sent();
                    _a.label = 11;
                case 11:
                    i++;
                    return [3 /*break*/, 9];
                case 12:
                    log("Produto criado: ".concat(data.name, " (ID: ").concat(product.id, ", SKU: ").concat(sku, ")"));
                    return [2 /*return*/, product.id];
            }
        });
    });
}
// ============================================================================
// INTERFACE CLI
// ============================================================================
function promptUser(question) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    var rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout,
                        terminal: true,
                    });
                    rl.question(question, function (answer) {
                        rl.close();
                        resolve(answer.toLowerCase().trim());
                    });
                })];
        });
    });
}
function displayProductReview(data, descriptions, fromCache) {
    if (fromCache === void 0) { fromCache = false; }
    console.log("\n" + "=".repeat(80));
    console.log("REVISAO DO PRODUTO");
    console.log("=".repeat(80));
    console.log("Nome: ".concat(data.name));
    console.log("Codigo: ".concat(data.code));
    console.log("SKU: HLN-".concat(data.code));
    console.log("Barcode: ".concat(data.barcode));
    console.log("Preco: R$ ".concat(data.price.toFixed(2)));
    console.log("Categoria: ".concat(data.category, " > ").concat(data.subcategory));
    console.log("Imagens: ".concat(data.imagePaths.length, " encontradas"));
    console.log("\nDescricao Curta ".concat(fromCache ? "(cache)" : "(gerada)", " (").concat(descriptions.short.length, " chars):"));
    console.log("   ".concat(descriptions.short, "\n"));
    console.log("Descricao Longa ".concat(fromCache ? "(cache)" : "(gerada)", " (").concat(descriptions.long.length, " chars):"));
    console.log("   ".concat(descriptions.long.substring(0, 300), "..."));
    console.log("\n" + "=".repeat(80));
}
// ============================================================================
// MAIN
// ============================================================================
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var args, adapter, startTime, inputFolder, openaiModel, limit, csvData, cache_1, categoryCache, similarityCache, categoryFolders, totalProducts, processedProducts, skippedProducts, failedProducts, _loop_2, _i, categoryFolders_2, catInfo, state_2, duration, reportPath, error_5;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    args = parseArgs();
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
                    adapter = new adapter_pg_1.PrismaPg({ connectionString: CONFIG.DATABASE_URL });
                    prisma = new client_1.PrismaClient({ adapter: adapter });
                    startTime = Date.now();
                    inputFolder = args.folderPath || CONFIG.INPUT_FOLDER;
                    openaiModel = args.openaiModel || CONFIG.OPENAI_MODEL;
                    limit = args.limit;
                    log("Configuracoes", {
                        inputFolder: inputFolder,
                        openaiModel: openaiModel,
                        dryRun: args.dryRun,
                        force: args.force,
                        yes: args.yes,
                        limit: limit,
                    });
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 20, 21, 23]);
                    // Testar conexão com banco
                    return [4 /*yield*/, prisma.$connect()];
                case 2:
                    // Testar conexão com banco
                    _b.sent();
                    log("Conectado ao banco de dados");
                    // Carregar dados CSV
                    console.log("\nCarregando CSVs...");
                    return [4 /*yield*/, loadCSVData(CONFIG.CSV_FOLDER)];
                case 3:
                    csvData = _b.sent();
                    console.log("".concat(Object.keys(csvData).length, " registros carregados\n"));
                    return [4 /*yield*/, loadDescriptionCache()];
                case 4:
                    cache_1 = _b.sent();
                    return [4 /*yield*/, loadCategoryCache()];
                case 5:
                    categoryCache = _b.sent();
                    return [4 /*yield*/, loadSimilarityCache()];
                case 6:
                    similarityCache = _b.sent();
                    console.log("Cache de descricoes: ".concat(Object.keys(cache_1.entries).length, " entradas"));
                    console.log("Cache de categorias: ".concat(Object.keys(categoryCache.entries).length, " entradas"));
                    console.log("Cache de similaridades: ".concat(Object.keys(similarityCache.entries).length, " entradas\n"));
                    // Escanear pastas
                    console.log("Escaneando pastas...");
                    return [4 /*yield*/, scanProductFolders(inputFolder)];
                case 7:
                    categoryFolders = _b.sent();
                    console.log("".concat(categoryFolders.length, " categorias encontradas\n"));
                    totalProducts = 0;
                    processedProducts = 0;
                    skippedProducts = 0;
                    failedProducts = [];
                    _loop_2 = function (catInfo) {
                        var productFolders, parentResult, subcategoryResult, validProducts, _loop_3, _c, productFolders_1, prodFolder, state_3, batches, _loop_4, batchIndex, state_4;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    if (limit && processedProducts >= limit)
                                        return [2 /*return*/, "break"];
                                    console.log("\nProcessando: [".concat(catInfo.category, "][").concat(catInfo.subcategory, "]"));
                                    return [4 /*yield*/, getProductFolders(catInfo.folder)];
                                case 1:
                                    productFolders = _d.sent();
                                    console.log("   ".concat(productFolders.length, " produtos encontrados"));
                                    return [4 /*yield*/, getOrCreateCategory(catInfo.category, undefined, categoryCache, similarityCache, args.refreshCache)];
                                case 2:
                                    parentResult = _d.sent();
                                    categoryCache = parentResult.cache;
                                    similarityCache = parentResult.similarityCache;
                                    return [4 /*yield*/, getOrCreateCategory(catInfo.subcategory, parentResult.id, categoryCache, similarityCache, args.refreshCache)];
                                case 3:
                                    subcategoryResult = _d.sent();
                                    categoryCache = subcategoryResult.cache;
                                    similarityCache = subcategoryResult.similarityCache;
                                    validProducts = [];
                                    _loop_3 = function (prodFolder) {
                                        var code, barcode, isNew, csv, priceStr, price, rawImages, images, productData;
                                        return __generator(this, function (_e) {
                                            switch (_e.label) {
                                                case 0:
                                                    totalProducts++;
                                                    code = prodFolder.code;
                                                    barcode = code;
                                                    return [4 /*yield*/, validateProductNotExists(barcode, args.force)];
                                                case 1:
                                                    isNew = _e.sent();
                                                    if (!isNew) {
                                                        console.log("   [SKIP] ".concat(code, ": ja existe no banco"));
                                                        skippedProducts++;
                                                        return [2 /*return*/, "continue"];
                                                    }
                                                    csv = csvData[code];
                                                    if (!csv) {
                                                        console.log("   [SKIP] ".concat(code, ": nao encontrado no CSV"));
                                                        skippedProducts++;
                                                        return [2 /*return*/, "continue"];
                                                    }
                                                    priceStr = csv.Preço.replace(",", ".");
                                                    price = parseFloat(priceStr);
                                                    if (isNaN(price)) {
                                                        console.log("   [SKIP] ".concat(code, ": preco invalido"));
                                                        skippedProducts++;
                                                        return [2 /*return*/, "continue"];
                                                    }
                                                    return [4 /*yield*/, fs.readdir(prodFolder.path)];
                                                case 2:
                                                    rawImages = (_e.sent())
                                                        .filter(function (f) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(f); })
                                                        .map(function (f) { return path.join(prodFolder.path, f); });
                                                    if (rawImages.length === 0) {
                                                        console.log("   [SKIP] ".concat(code, ": sem imagens"));
                                                        skippedProducts++;
                                                        return [2 /*return*/, "continue"];
                                                    }
                                                    images = sortImagesWithMainFirst(rawImages);
                                                    productData = {
                                                        code: code,
                                                        name: capitalizeWords(csv.Descrição),
                                                        barcode: barcode,
                                                        price: price,
                                                        category: catInfo.category,
                                                        subcategory: catInfo.subcategory,
                                                        imagePaths: images,
                                                        csvData: csv,
                                                    };
                                                    validProducts.push({ code: code, productData: productData, images: images });
                                                    // Verificar limite
                                                    if (limit &&
                                                        processedProducts + validProducts.length + failedProducts.length >=
                                                            limit) {
                                                        return [2 /*return*/, "break"];
                                                    }
                                                    return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _c = 0, productFolders_1 = productFolders;
                                    _d.label = 4;
                                case 4:
                                    if (!(_c < productFolders_1.length)) return [3 /*break*/, 7];
                                    prodFolder = productFolders_1[_c];
                                    return [5 /*yield**/, _loop_3(prodFolder)];
                                case 5:
                                    state_3 = _d.sent();
                                    if (state_3 === "break")
                                        return [3 /*break*/, 7];
                                    _d.label = 6;
                                case 6:
                                    _c++;
                                    return [3 /*break*/, 4];
                                case 7:
                                    batches = chunkArray(validProducts, BATCH_SIZE);
                                    console.log("   ".concat(validProducts.length, " produtos para processar em ").concat(batches.length, " batch(es)"));
                                    _loop_4 = function (batchIndex) {
                                        var batch, processProduct, results, _f, results_1, result;
                                        return __generator(this, function (_g) {
                                            switch (_g.label) {
                                                case 0:
                                                    batch = batches[batchIndex];
                                                    console.log("\n   [Batch ".concat(batchIndex + 1, "/").concat(batches.length, "] Processando ").concat(batch.length, " produtos..."));
                                                    processProduct = function (item) { return __awaiter(_this, void 0, void 0, function () {
                                                        var code, productData, images, shouldRefresh, descriptions, confirmation, imageUrls, error_6, errorMsg;
                                                        return __generator(this, function (_a) {
                                                            switch (_a.label) {
                                                                case 0:
                                                                    code = item.code, productData = item.productData, images = item.images;
                                                                    _a.label = 1;
                                                                case 1:
                                                                    _a.trys.push([1, 9, , 10]);
                                                                    shouldRefresh = args.refreshCache &&
                                                                        (!args.refreshCodes || args.refreshCodes.includes(code));
                                                                    return [4 /*yield*/, getOrGenerateDescriptions(cache_1, code, productData.name, productData.csvData, images, productData.subcategory, shouldRefresh, openaiModel)];
                                                                case 2:
                                                                    descriptions = _a.sent();
                                                                    if (!!args.yes) return [3 /*break*/, 4];
                                                                    displayProductReview(productData, descriptions, descriptions.fromCache);
                                                                    return [4 /*yield*/, promptUser("Cadastrar este produto? (y/n): ")];
                                                                case 3:
                                                                    confirmation = _a.sent();
                                                                    if (confirmation !== "y" && confirmation !== "s") {
                                                                        console.log("Produto ignorado pelo usuario\n");
                                                                        return [2 /*return*/, {
                                                                                success: false,
                                                                                code: code,
                                                                                name: productData.name,
                                                                                error: "Ignorado pelo usuário",
                                                                            }];
                                                                    }
                                                                    _a.label = 4;
                                                                case 4:
                                                                    if (!!args.dryRun) return [3 /*break*/, 7];
                                                                    return [4 /*yield*/, uploadImages(productData.imagePaths)];
                                                                case 5:
                                                                    imageUrls = _a.sent();
                                                                    // Criar produto
                                                                    return [4 /*yield*/, createProduct(productData, subcategoryResult.id, imageUrls, descriptions, args.force)];
                                                                case 6:
                                                                    // Criar produto
                                                                    _a.sent();
                                                                    console.log("   [OK] ".concat(code, ": ").concat(productData.name.substring(0, 40), "..."));
                                                                    return [2 /*return*/, { success: true, code: code, name: productData.name }];
                                                                case 7:
                                                                    console.log("   [DRY] ".concat(code, ": ").concat(productData.name.substring(0, 40), "..."));
                                                                    return [2 /*return*/, { success: true, code: code, name: productData.name }];
                                                                case 8: return [3 /*break*/, 10];
                                                                case 9:
                                                                    error_6 = _a.sent();
                                                                    errorMsg = error_6 instanceof Error ? error_6.message : String(error_6);
                                                                    logError("Erro ao processar produto ".concat(code), error_6);
                                                                    console.log("   [ERRO] ".concat(code, ": ").concat(errorMsg.substring(0, 60), "..."));
                                                                    return [2 /*return*/, {
                                                                            success: false,
                                                                            code: code,
                                                                            name: productData.name,
                                                                            error: errorMsg,
                                                                        }];
                                                                case 10: return [2 /*return*/];
                                                            }
                                                        });
                                                    }); };
                                                    return [4 /*yield*/, Promise.allSettled(batch.map(processProduct))];
                                                case 1:
                                                    results = _g.sent();
                                                    // Contabilizar resultados
                                                    for (_f = 0, results_1 = results; _f < results_1.length; _f++) {
                                                        result = results_1[_f];
                                                        if (result.status === "fulfilled") {
                                                            if (result.value.success) {
                                                                processedProducts++;
                                                            }
                                                            else if (result.value.error &&
                                                                result.value.error !== "Ignorado pelo usuário") {
                                                                failedProducts.push({
                                                                    code: result.value.code,
                                                                    name: result.value.name,
                                                                    error: result.value.error,
                                                                    timestamp: new Date().toISOString(),
                                                                });
                                                            }
                                                        }
                                                        else {
                                                            // Promise rejeitada (não deveria acontecer pois tratamos erros internamente)
                                                            failedProducts.push({
                                                                code: "unknown",
                                                                name: "unknown",
                                                                error: ((_a = result.reason) === null || _a === void 0 ? void 0 : _a.message) || String(result.reason),
                                                                timestamp: new Date().toISOString(),
                                                            });
                                                        }
                                                    }
                                                    // Verificar limite após cada batch
                                                    if (limit && processedProducts >= limit) {
                                                        console.log("\n   Limite de ".concat(limit, " produtos atingido."));
                                                        return [2 /*return*/, "break"];
                                                    }
                                                    if (!(batchIndex < batches.length - 1)) return [3 /*break*/, 3];
                                                    console.log("   Aguardando ".concat(BATCH_DELAY_MS, "ms antes do pr\u00F3ximo batch..."));
                                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, BATCH_DELAY_MS); })];
                                                case 2:
                                                    _g.sent();
                                                    _g.label = 3;
                                                case 3: return [2 /*return*/];
                                            }
                                        });
                                    };
                                    batchIndex = 0;
                                    _d.label = 8;
                                case 8:
                                    if (!(batchIndex < batches.length)) return [3 /*break*/, 11];
                                    return [5 /*yield**/, _loop_4(batchIndex)];
                                case 9:
                                    state_4 = _d.sent();
                                    if (state_4 === "break")
                                        return [3 /*break*/, 11];
                                    _d.label = 10;
                                case 10:
                                    batchIndex++;
                                    return [3 /*break*/, 8];
                                case 11: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, categoryFolders_2 = categoryFolders;
                    _b.label = 8;
                case 8:
                    if (!(_i < categoryFolders_2.length)) return [3 /*break*/, 11];
                    catInfo = categoryFolders_2[_i];
                    return [5 /*yield**/, _loop_2(catInfo)];
                case 9:
                    state_2 = _b.sent();
                    if (state_2 === "break")
                        return [3 /*break*/, 11];
                    _b.label = 10;
                case 10:
                    _i++;
                    return [3 /*break*/, 8];
                case 11:
                    if (!!args.skipCache) return [3 /*break*/, 15];
                    cache_1.lastUpdated = new Date().toISOString();
                    return [4 /*yield*/, saveDescriptionCache(cache_1)];
                case 12:
                    _b.sent();
                    categoryCache.lastUpdated = new Date().toISOString();
                    return [4 /*yield*/, saveCategoryCache(categoryCache)];
                case 13:
                    _b.sent();
                    similarityCache.lastUpdated = new Date().toISOString();
                    return [4 /*yield*/, saveSimilarityCache(similarityCache)];
                case 14:
                    _b.sent();
                    _b.label = 15;
                case 15:
                    duration = ((Date.now() - startTime) / 1000).toFixed(2);
                    console.log("\n" + "=".repeat(60));
                    console.log("RESUMO DA IMPORTAÇÃO");
                    console.log("=".repeat(60));
                    console.log("Produtos encontrados:  ".concat(totalProducts));
                    console.log("Produtos cadastrados:  ".concat(processedProducts));
                    console.log("Produtos pulados:      ".concat(skippedProducts));
                    console.log("Produtos com erro:     ".concat(failedProducts.length));
                    console.log("Tempo total:           ".concat(duration, "s"));
                    console.log("=".repeat(60));
                    if (!(failedProducts.length > 0)) return [3 /*break*/, 18];
                    console.log("\nPRODUTOS QUE FALHARAM:");
                    console.log("-".repeat(60));
                    failedProducts.forEach(function (failed, index) {
                        console.log("\n".concat(index + 1, ". C\u00F3digo: ").concat(failed.code));
                        console.log("   Nome: ".concat(failed.name));
                        console.log("   Erro: ".concat(failed.error));
                        console.log("   Hora: ".concat(failed.timestamp));
                    });
                    console.log("-".repeat(60) + "\n");
                    reportPath = path.join(SCRIPT_DIR, ".cache/failed-products-".concat(new Date().toISOString().split("T")[0], ".json"));
                    return [4 /*yield*/, fs.mkdir(path.dirname(reportPath), { recursive: true })];
                case 16:
                    _b.sent();
                    return [4 /*yield*/, fs.writeFile(reportPath, JSON.stringify(failedProducts, null, 2))];
                case 17:
                    _b.sent();
                    console.log("Relat\u00F3rio de falhas salvo em: ".concat(reportPath, "\n"));
                    return [3 /*break*/, 19];
                case 18:
                    console.log("\n✓ Nenhum erro detectado!\n");
                    _b.label = 19;
                case 19: return [3 /*break*/, 23];
                case 20:
                    error_5 = _b.sent();
                    logError("Erro durante importacao", error_5);
                    process.exit(1);
                    return [3 /*break*/, 23];
                case 21: return [4 /*yield*/, prisma.$disconnect()];
                case 22:
                    _b.sent();
                    return [7 /*endfinally*/];
                case 23: return [2 /*return*/];
            }
        });
    });
}
main();
