"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = log;
exports.extractCode = extractCode;
exports.identifyImageType = identifyImageType;
exports.generateNewFileName = generateNewFileName;
exports.listImageFiles = listImageFiles;
exports.moveFile = moveFile;
exports.createReport = createReport;
exports.saveReport = saveReport;
var promises_1 = require("fs/promises");
var path_1 = require("path");
var rename_config_js_1 = require("./rename-config.js");
/**
 * Função de log personalizada
 */
function log(level, message) {
    var levels = { debug: 0, info: 1, warn: 2, error: 3 };
    var currentLevel = levels[level] || 1;
    var configLevel = levels[rename_config_js_1.LOG_LEVEL] || 1;
    if (currentLevel >= configLevel) {
        var timestamp = new Date().toLocaleTimeString();
        var prefix = {
            debug: "🔍",
            info: "ℹ️",
            warn: "⚠️",
            error: "❌",
        }[level] || "ℹ️";
        console.log("[".concat(timestamp, "] ").concat(prefix, " ").concat(message));
    }
}
/**
 * Extrai o código numérico do nome do arquivo
 */
function extractCode(fileName) {
    var match = fileName.match(rename_config_js_1.PATTERNS.CODE_EXTRACT);
    return match ? match[1] : null;
}
/**
 * Identifica o tipo de imagem com base no nome do arquivo
 */
function identifyImageType(fileName, filePath) {
    var lowerFileName = fileName.toLowerCase();
    var lowerFilePath = filePath.toLowerCase();
    // Verificar se é produto na pedra
    if (rename_config_js_1.PATTERNS.PRODUCT_ON_STONE.test(lowerFileName) ||
        rename_config_js_1.PATTERNS.PRODUCT_ON_STONE.test(lowerFilePath)) {
        return "PRODUCT_ON_STONE";
    }
    // Verificar se é cópia/adicional
    if (rename_config_js_1.PATTERNS.ADDITIONAL_PHOTO.test(lowerFileName) ||
        rename_config_js_1.PATTERNS.ADDITIONAL_PHOTO.test(lowerFilePath)) {
        return "ADDITIONAL_PHOTO";
    }
    // Verificar se é variante de cor
    for (var _i = 0, _a = Object.entries(rename_config_js_1.PATTERNS.COLOR_VARIANTS); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        if (lowerFileName.includes(key) || lowerFilePath.includes(key)) {
            return {
                type: "VARIANT",
                variantType: "cor",
                variantOption: value,
                confidence: 0.8,
                reasoning: "Identificado pelo nome do arquivo",
            };
        }
    }
    // Se não for nenhum dos acima, é imagem principal
    return "MAIN_IMAGE";
}
/**
 * Gera o novo nome do arquivo conforme o padrão especificado
 */
function generateNewFileName(fileName, filePath, code, imageType, counters) {
    var ext = path_1.default.extname(fileName);
    var lowerFileName = fileName.toLowerCase();
    var lowerFilePath = filePath.toLowerCase();
    switch (imageType) {
        case "MAIN_IMAGE":
            // Primeira imagem principal usa apenas o código, demais usam contador
            if (!counters.mainImage[code]) {
                counters.mainImage[code] = 0;
                return "".concat(code).concat(ext);
            }
            var mainNumber = ++counters.mainImage[code];
            return "".concat(code, " - ").concat(mainNumber).concat(ext);
        case "PRODUCT_ON_STONE":
            // Primeira imagem na pedra usa código - P, demais usam contador
            if (!counters.productOnStone[code]) {
                counters.productOnStone[code] = 0;
                return "".concat(code, " - P").concat(ext);
            }
            var stoneNumber = ++counters.productOnStone[code];
            return "".concat(code, " - P - ").concat(stoneNumber).concat(ext);
        case "ADDITIONAL_PHOTO":
            // Inicializar contador para este código se não existir
            if (!counters.additional[code]) {
                counters.additional[code] = 1;
            }
            var additionalNumber = counters.additional[code]++;
            return "".concat(code, " - AD - ").concat(additionalNumber).concat(ext);
        default:
            // Verificar se é um objeto de variante
            if (typeof imageType === "object" && imageType.type === "VARIANT") {
                return "".concat(code, " - V - ").concat(imageType.variantType, " - ").concat(imageType.variantOption).concat(ext);
            }
            return "".concat(code).concat(ext);
    }
}
/**
 * Lista arquivos de imagem em uma pasta (recursivo ou não)
 */
function listImageFiles(dirPath_1) {
    return __awaiter(this, arguments, void 0, function (dirPath, recursive) {
        function scanDirectory(currentPath) {
            return __awaiter(this, void 0, void 0, function () {
                var items, _i, items_1, item, itemPath, stats, ext;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, promises_1.default.readdir(currentPath)];
                        case 1:
                            items = _a.sent();
                            _i = 0, items_1 = items;
                            _a.label = 2;
                        case 2:
                            if (!(_i < items_1.length)) return [3 /*break*/, 7];
                            item = items_1[_i];
                            itemPath = path_1.default.join(currentPath, item);
                            return [4 /*yield*/, promises_1.default.stat(itemPath)];
                        case 3:
                            stats = _a.sent();
                            if (!(stats.isDirectory() && recursive)) return [3 /*break*/, 5];
                            return [4 /*yield*/, scanDirectory(itemPath)];
                        case 4:
                            _a.sent();
                            return [3 /*break*/, 6];
                        case 5:
                            if (stats.isFile()) {
                                ext = path_1.default.extname(item).toLowerCase();
                                if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)) {
                                    imageFiles_1.push({
                                        fileName: item,
                                        filePath: itemPath,
                                        relativePath: path_1.default.relative(dirPath, itemPath),
                                    });
                                }
                            }
                            _a.label = 6;
                        case 6:
                            _i++;
                            return [3 /*break*/, 2];
                        case 7: return [2 /*return*/];
                    }
                });
            });
        }
        var imageFiles_1, error_1;
        if (recursive === void 0) { recursive = true; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    imageFiles_1 = [];
                    return [4 /*yield*/, scanDirectory(dirPath)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, imageFiles_1];
                case 2:
                    error_1 = _a.sent();
                    log("error", "Erro ao ler pasta ".concat(dirPath, ": ").concat(error_1.message));
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Move ou copia um arquivo de forma assíncrona
 */
function moveFile(src_1, dest_1) {
    return __awaiter(this, arguments, void 0, function (src, dest, copy) {
        var destDir, error_2;
        if (copy === void 0) { copy = rename_config_js_1.COPY_FILES; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    destDir = path_1.default.dirname(dest);
                    return [4 /*yield*/, promises_1.default.mkdir(destDir, { recursive: true })];
                case 1:
                    _a.sent();
                    if (rename_config_js_1.DRY_RUN) {
                        log("info", "[DRY RUN] ".concat(copy ? "Copiaria" : "Moveria", ": ").concat(path_1.default.basename(src), " \u2192 ").concat(dest));
                        return [2 /*return*/];
                    }
                    if (!copy) return [3 /*break*/, 3];
                    return [4 /*yield*/, promises_1.default.copyFile(src, dest)];
                case 2:
                    _a.sent();
                    log("info", "Copiado: ".concat(path_1.default.basename(src), " \u2192 ").concat(dest));
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, promises_1.default.rename(src, dest)];
                case 4:
                    _a.sent();
                    log("info", "Movido: ".concat(path_1.default.basename(src), " \u2192 ").concat(dest));
                    _a.label = 5;
                case 5: return [3 /*break*/, 7];
                case 6:
                    error_2 = _a.sent();
                    log("error", "Erro ao ".concat(copy ? "copiar" : "mover", " arquivo: ").concat(error_2.message));
                    throw error_2;
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Cria um relatório das operações realizadas
 */
function createReport(processedFiles, errors) {
    var report = {
        timestamp: new Date().toISOString(),
        summary: {
            total: processedFiles.length,
            success: processedFiles.filter(function (f) { return f.success; }).length,
            failed: processedFiles.filter(function (f) { return !f.success; }).length,
            errors: errors.length,
        },
        processedFiles: processedFiles,
        errors: errors,
    };
    return report;
}
/**
 * Salva o relatório em um arquivo JSON
 */
function saveReport(report_1) {
    return __awaiter(this, arguments, void 0, function (report, outputPath) {
        var error_3;
        if (outputPath === void 0) { outputPath = "rename-reporton"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, promises_1.default.writeFile(outputPath, JSON.stringify(report, null, 2))];
                case 1:
                    _a.sent();
                    log("info", "Relat\u00F3rio salvo em: ".concat(outputPath));
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    log("error", "Erro ao salvar relat\u00F3rio: ".concat(error_3.message));
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
