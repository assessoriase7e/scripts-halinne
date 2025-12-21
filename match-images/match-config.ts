// Configurações específicas para o script de match-images
import { Config } from "../src/types.js";
import {
  API_KEY,
  MAX_IMAGE_SIZE,
  MAX_CONCURRENT_REQUESTS,
  REQUEST_DELAY,
  CACHE_DB,
  MIN_SIMILARITY,
  COPY_FILES,
  RECURSIVE_SEARCH,
} from "../src/shared-config.js";

// Configuração agnóstica - pastas base e join
export const PATH_BASE: string = "match-images/base"; // Pastas de destino organizadas
export const PATH_JOIN: string = "match-images/join"; // Imagens desordenadas para classificar
export const PATH_OUT: string = "match-images/organized"; // Resultado final
export const PATH_NOT_FOUND: string = "match-images/not_found";

export const TOP_N: number = 5; // quantas correspondências pegar em cada imagem de input

// Configurações específicas do match-images
export const KEEP_ORIGINAL_NAMES: boolean = true; // true para manter nomes originais das pastas de destino
export const MOTHER_FOLDER: string = PATH_BASE; // pasta "mãe" de onde sairão os nomes para as pastas de destino
export const KEEP_MOTHER_FOLDER: boolean = true; // true para preservar estrutura da pasta mãe no destino

// Configuração do padrão de nomenclatura
export const NAMING_PATTERN: string = "[folder_name] - [M]-[number]"; // Padrão configurável

// Re-exportar configurações compartilhadas para uso no script
export {
  API_KEY,
  MAX_IMAGE_SIZE,
  MAX_CONCURRENT_REQUESTS,
  REQUEST_DELAY,
  CACHE_DB,
  MIN_SIMILARITY,
  COPY_FILES,
  RECURSIVE_SEARCH,
};

// Exportar configuração completa
export const matchConfig: Config = {
  API_KEY,
  PATH_BASE,
  PATH_JOIN,
  PATH_OUT,
  PATH_NOT_FOUND,
  TOP_N,
  MIN_SIMILARITY,
  MAX_IMAGE_SIZE,
  MAX_CONCURRENT_REQUESTS,
  REQUEST_DELAY,
  CACHE_DB,
  COPY_FILES,
  RECURSIVE_SEARCH,
  KEEP_ORIGINAL_NAMES,
  MOTHER_FOLDER,
  KEEP_MOTHER_FOLDER,
  NAMING_PATTERN,
};
