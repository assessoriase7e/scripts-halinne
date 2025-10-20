// Configurações específicas para o script de match-images
import { Config } from "../src/types";
import {
  API_KEY,
  MAX_IMAGE_SIZE,
  MAX_CONCURRENT_REQUESTS,
  REQUEST_DELAY,
  CACHE_DB,
  MIN_SIMILARITY,
  COPY_FILES,
  RECURSIVE_SEARCH,
} from "../src/shared-config";

export const PATH_BRANCO: string = "match-images/input-folder-1";
export const PATH_MODELO: string = "match-images/input-folder-2";
export const PATH_OUT: string = "match-images/match";
export const PATH_NOT_FOUND: string = "match-images/not_found";

export const TOP_N: number = 5; // quantas correspondências pegar em cada imagem de input

// Configurações específicas do match-images
export const KEEP_ORIGINAL_NAMES: boolean = true; // true para manter nomes originais das pastas de destino
export const MOTHER_FOLDER: string = PATH_BRANCO; // pasta "mãe" de onde sairão os nomes para as pastas de destino

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
  PATH_BRANCO,
  PATH_MODELO,
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
};
