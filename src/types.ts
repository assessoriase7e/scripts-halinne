// Tipos para o processamento de imagens

export interface ImageInfo {
  fileName: string;
  filePath: string;
  relativePath: string;
}

export interface ProcessedImage extends ImageInfo {
  success: boolean;
  code?: string;
  imageType?: ImageType | string;
  newFileName?: string;
  destinationPath?: string;
  error?: string;
}

export interface ImageAnalysis {
  type: "MAIN_IMAGE" | "PRODUCT_ON_STONE" | "ADDITIONAL_PHOTO" | "VARIANT";
  variantType?: string;
  variantOption?: string;
  confidence: number;
  reasoning: string;
}

export type ImageType =
  | "MAIN_IMAGE"
  | "PRODUCT_ON_STONE"
  | "ADDITIONAL_PHOTO"
  | ImageAnalysis;

export interface EmbeddingData {
  embedding: number[];
  analysis: string;
  imageInfo: ImageInfo;
}

export interface MatchResult {
  filename: string;
  score: number;
  analysis: string;
  imageInfo: ImageInfo;
}

export interface ComparisonResult {
  success: boolean;
  type: string;
  filename: string;
}

export interface ProcessingStats {
  successfulMatches: number;
  notFoundCount: number;
  unpairedModelo: number;
}

export interface ReportData {
  timestamp: string;
  summary: {
    total: number;
    success: number;
    failed: number;
    errors: number;
  };
  processedFiles: ProcessedImage[];
  errors: Array<{
    file: string;
    error: string;
  }>;
  cacheUpdate?: {
    updatedCount: number;
    errorCount: number;
  };
}

export interface CacheEntry {
  analysis: string;
  embedding: number[];
}

export interface Counters {
  additional: Record<string, number>;
  mainImage: Record<string, number>;
  productOnStone: Record<string, number>;
  initialized: boolean;
}

// Configurações
export interface Config {
  API_KEY: string;
  PATH_BASE: string;
  PATH_JOIN: string;
  PATH_OUT: string;
  PATH_NOT_FOUND: string;
  TOP_N: number;
  MIN_SIMILARITY: number;
  MAX_IMAGE_SIZE: number;
  MAX_CONCURRENT_REQUESTS: number;
  REQUEST_DELAY: number;
  CACHE_DB: string;
  COPY_FILES: boolean;
  RECURSIVE_SEARCH: boolean;
  KEEP_ORIGINAL_NAMES: boolean;
  MOTHER_FOLDER: string;
  KEEP_MOTHER_FOLDER: boolean;
  NAMING_PATTERN: string;
}

export interface RenameConfig {
  INPUT_DIR: string;
  OUTPUT_DIR: string;
  RECURSIVE_SEARCH: boolean;
  COPY_FILES: boolean;
  DRY_RUN: boolean;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  KEEP_MOTHER_FOLDER: boolean;
  SIMPLE_MODE: boolean;
  COUNTERS: Counters;
  PATTERNS: {
    CODE_EXTRACT: RegExp;
    PRODUCT_ON_STONE: RegExp;
    ADDITIONAL_PHOTO: RegExp;
    VARIANT: RegExp;
    COLOR_VARIANTS: Record<string, string>;
  };
}

// Tipos para API OpenAI
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: {
          url: string;
        };
      }>;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

// Tipos para controle de concorrência
export interface Task<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}
