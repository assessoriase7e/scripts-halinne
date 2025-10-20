import fs from "fs/promises";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { CACHE_DB } from "./config.js";
// Configuração do banco de dados SQLite para cache
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", CACHE_DB);
// Função para calcular hash simples do arquivo (baseado no tamanho e data de modificação)
export async function getFileHash(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return `${stats.size}-${stats.mtime.getTime()}`;
    }
    catch (error) {
        console.error(`❌ Erro ao obter hash do arquivo: ${error.message}`);
        return null;
    }
}
// Função para inicializar o banco de dados
export function initDatabase() {
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
        db.run(`
      CREATE TABLE IF NOT EXISTS image_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        analysis TEXT NOT NULL,
        embedding TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_name, file_hash)
      )
    `, (err) => {
            if (err) {
                console.error(`❌ Erro ao criar tabela: ${err.message}`);
                reject(err);
                return;
            }
            console.log(`📋 Tabela de cache verificada/criada`);
            resolve(db);
        });
    });
}
// Classe para gerenciar cache de embeddings
export class EmbeddingCache {
    db;
    constructor(db) {
        this.db = db;
    }
    // Buscar embedding do cache usando o nome do arquivo
    async get(filePath) {
        try {
            const fileName = path.basename(filePath);
            const fileHash = await getFileHash(filePath);
            if (!fileHash) {
                return null;
            }
            return new Promise((resolve, reject) => {
                this.db.get("SELECT analysis, embedding FROM image_cache WHERE file_name = ? AND file_hash = ?", [fileName, fileHash], (err, row) => {
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
                    }
                    else {
                        console.log(`    💾 Cache miss: ${fileName}`);
                        resolve(null);
                    }
                });
            });
        }
        catch (error) {
            console.error(`❌ Erro ao buscar do cache: ${error.message}`);
            return null;
        }
    }
    // Salvar embedding no cache usando o nome do arquivo
    async set(filePath, analysis, embedding) {
        return new Promise((resolve, reject) => {
            const fileName = path.basename(filePath);
            const fileHash = getFileHash(filePath);
            if (!fileHash) {
                reject(new Error("Não foi possível gerar hash do arquivo"));
                return;
            }
            fileHash
                .then((hash) => {
                const embeddingJson = JSON.stringify(embedding);
                this.db.run(`INSERT OR REPLACE INTO image_cache (file_name, file_path, file_hash, analysis, embedding, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [fileName, filePath, hash, analysis, embeddingJson], function (err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    console.log(`    💾 Cache salvo: ${fileName}`);
                    resolve(this.lastID);
                });
            })
                .catch(reject);
        });
    }
    // Limpar cache antigo (opcional)
    async clearOld(daysOld = 30) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM image_cache WHERE updated_at < datetime('now', '-' || ? || ' days')", [daysOld], function (err) {
                if (err) {
                    reject(err);
                    return;
                }
                console.log(`🧹 Cache limpo: ${this.changes} registros removidos`);
                resolve(this.changes);
            });
        });
    }
    // Fechar conexão com o banco
    close() {
        this.db.close((err) => {
            if (err) {
                console.error(`❌ Erro ao fechar banco: ${err.message}`);
            }
            else {
                console.log(`💾 Conexão com cache SQLite fechada`);
            }
        });
    }
}
//# sourceMappingURL=cache.js.map