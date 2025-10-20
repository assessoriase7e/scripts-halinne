// Configurações do aplicativo
import { Config } from "./types.js";

export const API_KEY: string = process.env.OPENAI_API_KEY || "";

export const PATH_BRANCO: string = "match-images/input-folder-1";
export const PATH_MODELO: string = "match-images/input-folder-2";
export const PATH_OUT: string = "match-images/match";
export const PATH_NOT_FOUND: string = "match-images/not_found";

export const TOP_N: number = 5; // quantas correspondências pegar em cada imagem de input
export const MIN_SIMILARITY: number = 0.75; // similaridade mínima para considerar um match válido (75%)
export const MAX_IMAGE_SIZE: number = 1024; // tamanho máximo reduzido para evitar erros
export const MAX_CONCURRENT_REQUESTS: number = 3; // número máximo de requisições simultâneas à API
export const REQUEST_DELAY: number = 1000; // delay entre requisições em ms (reduzido para processamento paralelo)
export const CACHE_DB: string = "image_cache.db"; // arquivo do banco de dados SQLite

// Novas configurações
export const COPY_FILES: boolean = true; // true para copiar, false para mover arquivos
export const RECURSIVE_SEARCH: boolean = true; // buscar imagens em subpastas recursivamente
export const KEEP_ORIGINAL_NAMES: boolean = true; // true para manter nomes originais das pastas de destino
export const MOTHER_FOLDER: string = PATH_BRANCO; // pasta "mãe" de onde sairão os nomes para as pastas de destino

// Exportar configuração completa
export const config: Config = {
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
