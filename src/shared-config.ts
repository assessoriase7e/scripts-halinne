// Configurações compartilhadas entre os scripts de match-images e rename-images

// Configurações de API OpenAI (compartilhadas)
export const API_KEY: string = process.env.OPENAI_API_KEY || "";

// Configurações de processamento de imagem (compartilhadas)
export const MAX_IMAGE_SIZE: number = 1024; // tamanho máximo reduzido para evitar erros

// Configurações de concorrência (compartilhadas)
export const MAX_CONCURRENT_REQUESTS: number = 3; // número máximo de requisições simultâneas à API
export const REQUEST_DELAY: number = 1000; // delay entre requisições em ms

// Configurações de cache (compartilhadas)
export const CACHE_DB: string = "image_cache.db"; // arquivo do banco de dados SQLite

// Configurações de similaridade (usadas principalmente pelo match-images)
export const MIN_SIMILARITY: number = 0.75; // similaridade mínima para considerar um match válido (75%)

// Configurações de arquivo (comportamento padrão, pode ser sobrescrito)
export const COPY_FILES: boolean = false; // true para copiar, false para mover arquivos
export const RECURSIVE_SEARCH: boolean = true; // buscar imagens em subpastas recursivamente
