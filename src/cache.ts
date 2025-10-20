import fs from "fs/promises";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { CACHE_DB } from "./shared-config.js";
import { CacheEntry } from "./types.js";

// Configuração do banco de dados SQLite para cache
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", CACHE_DB);

// Função para calcular hash simples do arquivo (baseado no tamanho e data de modificação)
export async function getFileHash(filePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath);
    return `${stats.size}-${stats.mtime.getTime()}`;
  } catch (error) {
    console.error(
      `❌ Erro ao obter hash do arquivo: ${(error as Error).message}`
    );
    return null;
  }
}

// Função para calcular hash SHA256 do conteúdo do arquivo
export async function getContentHash(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.error(
      `❌ Erro ao calcular hash do conteúdo: ${(error as Error).message}`
    );
    return null;
  }
}

// Função para inicializar o banco de dados
export function initDatabase(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`❌ Erro ao abrir banco de dados: ${err.message}`);
        reject(err);
        return;
      }
      console.log(`💾 Cache SQLite inicializado: ${dbPath}`);
    });

    // Criar tabela se não existir
    db.run(
      `
      CREATE TABLE IF NOT EXISTS image_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        content_hash TEXT,
        file_size INTEGER,
        analysis TEXT NOT NULL,
        embedding TEXT NOT NULL,
        original_file_name TEXT,
        original_file_path TEXT,
        final_file_name TEXT,
        final_file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_name, file_hash)
      )
    `,
      (err) => {
        if (err) {
          console.error(`❌ Erro ao criar tabela: ${err.message}`);
          reject(err);
          return;
        }
        
        // Criar índice para content_hash para buscas rápidas
        db.run(
          `CREATE INDEX IF NOT EXISTS idx_content_hash ON image_cache(content_hash)`,
          (indexErr) => {
            if (indexErr) {
              console.error(`❌ Erro ao criar índice: ${indexErr.message}`);
            }
            console.log(`📋 Tabela de cache verificada/criada`);
            resolve(db);
          }
        );
      }
    );
  });
}

// Classe para gerenciar cache de embeddings
export class EmbeddingCache {
  private db: sqlite3.Database;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  // Buscar embedding do cache usando o nome do arquivo
  async get(filePath: string): Promise<CacheEntry | null> {
    try {
      const fileName = path.basename(filePath);
      const fileHash = await getFileHash(filePath);
      if (!fileHash) {
        return null;
      }

      return new Promise((resolve, reject) => {
        this.db.get(
          "SELECT analysis, embedding FROM image_cache WHERE file_name = ? AND file_hash = ?",
          [fileName, fileHash],
          (err, row: any) => {
            if (err) {
              reject(err);
              return;
            }

            if (row) {
              console.log(`    🎯 Cache hit: ${fileName}`);
              resolve({
                analysis: row.analysis,
                embedding: JSON.parse(row.embedding),
              });
            } else {
              console.log(`    💾 Cache miss: ${fileName}`);
              resolve(null);
            }
          }
        );
      });
    } catch (error) {
      console.error(`❌ Erro ao buscar do cache: ${(error as Error).message}`);
      return null;
    }
  }

  // Buscar embedding do cache usando o nome original do arquivo
  async getByOriginalPath(
    originalFilePath: string
  ): Promise<CacheEntry | null> {
    try {
      const originalFileName = path.basename(originalFilePath);

      return new Promise((resolve, reject) => {
        this.db.get(
          "SELECT analysis, embedding FROM image_cache WHERE original_file_name = ? OR original_file_path = ?",
          [originalFileName, originalFilePath],
          (err, row: any) => {
            if (err) {
              reject(err);
              return;
            }

            if (row) {
              console.log(
                `    🎯 Cache hit por nome original: ${originalFileName}`
              );
              resolve({
                analysis: row.analysis,
                embedding: JSON.parse(row.embedding),
              });
            } else {
              console.log(
                `    💾 Cache miss por nome original: ${originalFileName}`
              );
              resolve(null);
            }
          }
        );
      });
    } catch (error) {
      console.error(
        `❌ Erro ao buscar do cache por nome original: ${
          (error as Error).message
        }`
      );
      return null;
    }
  }

  // Verificar se existe arquivo duplicado pelo hash de conteúdo
  async checkDuplicateByContentHash(
    filePath: string
  ): Promise<{ isDuplicate: boolean; existingFile?: string; finalFile?: string } | null> {
    try {
      const contentHash = await getContentHash(filePath);
      if (!contentHash) {
        return null;
      }

      return new Promise((resolve, reject) => {
        this.db.get(
          "SELECT file_name, file_path, final_file_name, final_file_path FROM image_cache WHERE content_hash = ? LIMIT 1",
          [contentHash],
          (err, row: any) => {
            if (err) {
              reject(err);
              return;
            }

            if (row) {
              resolve({
                isDuplicate: true,
                existingFile: row.file_path,
                finalFile: row.final_file_path || row.file_path,
              });
            } else {
              resolve({ isDuplicate: false });
            }
          }
        );
      });
    } catch (error) {
      console.error(
        `❌ Erro ao verificar duplicata por hash: ${(error as Error).message}`
      );
      return null;
    }
  }

  // Salvar embedding no cache usando o nome do arquivo
  async set(
    filePath: string,
    analysis: string,
    embedding: number[],
    originalFilePath?: string,
    finalFilePath?: string
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const fileName = path.basename(filePath);
      const fileHash = getFileHash(filePath);
      const contentHashPromise = getContentHash(filePath);
      const fileSizePromise = fs.stat(filePath).then(stats => stats.size);
      
      if (!fileHash) {
        reject(new Error("Não foi possível gerar hash do arquivo"));
        return;
      }

      Promise.all([fileHash, contentHashPromise, fileSizePromise])
        .then(([hash, contentHash, fileSize]) => {
          const embeddingJson = JSON.stringify(embedding);
          const originalFileName = originalFilePath
            ? path.basename(originalFilePath)
            : null;
          const finalFileName = finalFilePath
            ? path.basename(finalFilePath)
            : null;

          this.db.run(
            `INSERT OR REPLACE INTO image_cache (
              file_name, file_path, file_hash, content_hash, file_size,
              analysis, embedding, original_file_name, original_file_path,
              final_file_name, final_file_path, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
              fileName,
              filePath,
              hash,
              contentHash,
              fileSize,
              analysis,
              embeddingJson,
              originalFileName,
              originalFilePath,
              finalFileName,
              finalFilePath,
            ],
            function (err) {
              if (err) {
                reject(err);
                return;
              }
              console.log(
                `    💾 Cache salvo: ${fileName}${
                  originalFileName ? ` (original: ${originalFileName})` : ""
                }${finalFileName ? ` (final: ${finalFileName})` : ""}`
              );
              resolve(this.lastID);
            }
          );
        })
        .catch(reject);
    });
  }

  // Limpar cache antigo (opcional)
  async clearOld(daysOld: number = 30): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM image_cache WHERE updated_at < datetime('now', '-' || ? || ' days')",
        [daysOld],
        function (err) {
          if (err) {
            reject(err);
            return;
          }
          console.log(`🧹 Cache limpo: ${this.changes} registros removidos`);
          resolve(this.changes);
        }
      );
    });
  }

  // Fechar conexão com o banco
  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error(`❌ Erro ao fechar banco: ${err.message}`);
      } else {
        console.log(`💾 Conexão com cache SQLite fechada`);
      }
    });
  }
}
