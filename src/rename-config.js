"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renameConfig = exports.COUNTERS = exports.SIMPLE_MODE = exports.KEEP_MOTHER_FOLDER = exports.LOG_LEVEL = exports.DRY_RUN = exports.COPY_FILES = exports.RECURSIVE_SEARCH = exports.PATTERNS = exports.OUTPUT_DIR = exports.INPUT_DIR = void 0;
// Diretórios
exports.INPUT_DIR = "rename-images/images"; // Diretório com as imagens a serem renomeadas
exports.OUTPUT_DIR = "rename-images/organized"; // Diretório de saída com as imagens organizadas
// Padrões de identificação de arquivos
exports.PATTERNS = {
    // Padrão para extrair código numérico do início do nome do arquivo
    CODE_EXTRACT: /^(\d+)/,
    // Padrões para identificar tipos de imagens
    PRODUCT_ON_STONE: /(?:pedra|stone|nano)/i,
    ADDITIONAL_PHOTO: /(?:cópia|copy|additional|adicional|extra)/i,
    VARIANT: /(?:cor|color|variant|variante|vermelho|azul|verde|amarelo|preto|branco|dourado|prata)/i,
    // Padrões para identificar variantes específicas
    COLOR_VARIANTS: {
        vermelho: "vermelho",
        red: "vermelho",
        azul: "azul",
        blue: "azul",
        verde: "verde",
        green: "verde",
        amarelo: "amarelo",
        yellow: "amarelo",
        preto: "preto",
        black: "preto",
        branco: "branco",
        white: "branco",
        dourado: "dourado",
        gold: "dourado",
        prata: "prata",
        silver: "prata",
        rosa: "rosa",
        pink: "rosa",
        roxo: "roxo",
        purple: "roxo",
        laranja: "laranja",
        orange: "laranja",
        marrom: "marrom",
        brown: "marrom",
        cinza: "cinza",
        gray: "cinza",
        grey: "cinza",
        "ouro branco": "ouro-branco",
        "white gold": "ouro-branco",
        "ouro rose": "ouro-rose",
        "rose gold": "ouro-rose",
    },
};
// Configurações de processamento
exports.RECURSIVE_SEARCH = true; // Buscar em subdiretórios
exports.COPY_FILES = false; // true para copiar, false para mover (IMPORTANTE: false move os arquivos)
exports.DRY_RUN = false; // true para simular sem fazer alterações
exports.LOG_LEVEL = "info"; // "debug", "info", "warn", "error"
exports.KEEP_MOTHER_FOLDER = true; // true para manter estrutura da pasta mãe no destino
exports.SIMPLE_MODE = false; // true para modo simples sem IA, false para modo completo com IA
// Contadores para sequência de arquivos
exports.COUNTERS = {
    additional: {}, // Contador por código para fotos adicionais
    mainImage: {}, // Contador por código para imagens principais
    productOnStone: {}, // Contador por código para produtos na pedra
    initialized: false,
};
// Exportar configuração completa
exports.renameConfig = {
    INPUT_DIR: exports.INPUT_DIR,
    OUTPUT_DIR: exports.OUTPUT_DIR,
    RECURSIVE_SEARCH: exports.RECURSIVE_SEARCH,
    COPY_FILES: exports.COPY_FILES,
    DRY_RUN: exports.DRY_RUN,
    LOG_LEVEL: exports.LOG_LEVEL,
    KEEP_MOTHER_FOLDER: exports.KEEP_MOTHER_FOLDER,
    SIMPLE_MODE: exports.SIMPLE_MODE,
    COUNTERS: exports.COUNTERS,
    PATTERNS: exports.PATTERNS,
};
