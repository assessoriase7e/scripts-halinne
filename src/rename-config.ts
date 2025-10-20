// Configurações para o script de renomeamento de imagens
import { RenameConfig } from "./types";

// Diretórios
export const INPUT_DIR: string = "rename-images/images"; // Diretório com as imagens a serem renomeadas
export const OUTPUT_DIR: string = "rename-images/organized"; // Diretório de saída com as imagens organizadas

// Padrões de identificação de arquivos
export const PATTERNS = {
  // Padrão para extrair código numérico do início do nome do arquivo
  CODE_EXTRACT: /^(\d+)/,

  // Padrões para identificar tipos de imagens
  PRODUCT_ON_STONE: /(?:pedra|stone|nano)/i,
  ADDITIONAL_PHOTO: /(?:cópia|copy|additional|adicional|extra)/i,
  VARIANT:
    /(?:cor|color|variant|variante|vermelho|azul|verde|amarelo|preto|branco|dourado|prata)/i,

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
  },
};

// Configurações de processamento
export const RECURSIVE_SEARCH: boolean = true; // Buscar em subdiretórios
export const COPY_FILES: boolean = false; // true para copiar, false para mover
export const DRY_RUN: boolean = true; // true para simular sem fazer alterações
export const LOG_LEVEL: "debug" | "info" | "warn" | "error" = "info"; // "debug", "info", "warn", "error"

// Contadores para sequência de arquivos adicionais
export const COUNTERS = {
  additional: {} as Record<string, number>, // Contador por código
  initialized: false,
};

// Exportar configuração completa
export const renameConfig: RenameConfig = {
  INPUT_DIR,
  OUTPUT_DIR,
  RECURSIVE_SEARCH,
  COPY_FILES,
  DRY_RUN,
  LOG_LEVEL,
  COUNTERS,
  PATTERNS,
};
