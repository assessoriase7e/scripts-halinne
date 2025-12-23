import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Script para encontrar imagens idênticas usando hash SHA256
 * Analisa todas as imagens em rename-images/input e identifica duplicatas exatas
 */

const INPUT_DIR = "rename-images/input";
const CACHE_FILE = "rename-images/image-hash-cache-input.json";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".JPG"];

interface HashCache {
  [filePath: string]: {
    hash: string;
    size: number;
    modified: number;
    calculatedAt: string;
  };
}

interface DuplicateGroup {
  hash: string;
  files: Array<{
    path: string;
    size: number;
    relativePath: string;
  }>;
  totalSize: number;
}

/**
 * Carrega o cache de hashes
 */
async function loadCache(): Promise<HashCache> {
  try {
    if (fsSync.existsSync(CACHE_FILE)) {
      const content = await fs.readFile(CACHE_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`⚠️ Erro ao carregar cache: ${(error as Error).message}`);
  }
  return {};
}

/**
 * Salva o cache de hashes
 */
async function saveCache(cache: HashCache): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    console.error(`❌ Erro ao salvar cache: ${(error as Error).message}`);
  }
}

/**
 * Calcula hash SHA256 do conteúdo de um arquivo
 */
async function calculateHash(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

/**
 * Verifica se o cache de um arquivo ainda é válido
 */
async function isCacheValid(
  filePath: string,
  cacheEntry: HashCache[string]
): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtimeMs === cacheEntry.modified;
  } catch {
    return false;
  }
}

/**
 * Obtém hash de um arquivo (usando cache se disponível)
 */
async function getFileHash(
  filePath: string,
  cache: HashCache
): Promise<{ hash: string; size: number } | null> {
  try {
    const stats = await fs.stat(filePath);
    const cacheEntry = cache[filePath];

    // Se existe no cache e ainda é válido, usar cache
    if (cacheEntry && (await isCacheValid(filePath, cacheEntry))) {
      return {
        hash: cacheEntry.hash,
        size: cacheEntry.size,
      };
    }

    // Calcular novo hash
    const hash = await calculateHash(filePath);

    // Atualizar cache
    cache[filePath] = {
      hash,
      size: stats.size,
      modified: stats.mtimeMs,
      calculatedAt: new Date().toISOString(),
    };

    return { hash, size: stats.size };
  } catch (error) {
    console.error(
      `   ❌ Erro ao processar ${filePath}: ${(error as Error).message}`
    );
    return null;
  }
}

/**
 * Lista todos os arquivos de imagem recursivamente
 */
async function listImages(dirPath: string): Promise<string[]> {
  const imageFiles: string[] = [];

  async function scanDirectory(currentPath: string): Promise<void> {
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(currentPath, item.name);

        if (item.isDirectory()) {
          await scanDirectory(itemPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (IMAGE_EXTENSIONS.includes(ext) || IMAGE_EXTENSIONS.includes(path.extname(item.name))) {
            imageFiles.push(itemPath);
          }
        }
      }
    } catch (error) {
      console.error(
        `❌ Erro ao ler diretório ${currentPath}: ${(error as Error).message}`
      );
    }
  }

  await scanDirectory(dirPath);
  return imageFiles;
}

/**
 * Encontra grupos de arquivos duplicados
 */
function findDuplicateGroups(
  hashMap: Map<string, Array<{ path: string; size: number; relativePath: string }>>
): DuplicateGroup[] {
  const duplicates: DuplicateGroup[] = [];

  for (const [hash, files] of hashMap.entries()) {
    if (files.length > 1) {
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      duplicates.push({
        hash,
        files,
        totalSize,
      });
    }
  }

  // Ordenar por número de duplicatas (mais duplicatas primeiro)
  return duplicates.sort((a, b) => b.files.length - a.files.length);
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔍 BUSCA DE IMAGENS IDÊNTICAS (HASH SHA256)");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Pasta de imagens: ${INPUT_DIR}`);
  console.log(`   - Arquivo de cache: ${CACHE_FILE}\n`);

  if (!fsSync.existsSync(INPUT_DIR)) {
    console.error(`❌ Diretório não encontrado: ${INPUT_DIR}`);
    process.exit(1);
  }

  try {
    // Carregar cache
    console.log("📦 Carregando cache de hashes...");
    const cache = await loadCache();
    const cacheSize = Object.keys(cache).length;
    console.log(`   ✅ Cache carregado: ${cacheSize} entradas\n`);

    // Listar todas as imagens
    console.log("📂 Listando imagens...");
    const imagePaths = await listImages(INPUT_DIR);
    console.log(`   ✅ Encontradas ${imagePaths.length} imagens\n`);

    if (imagePaths.length === 0) {
      console.log("⚠️ Nenhuma imagem encontrada!");
      return;
    }

    // Calcular hashes (usando cache quando possível)
    console.log("🔐 Calculando hashes das imagens...\n");
    const hashMap = new Map<string, Array<{ path: string; size: number; relativePath: string }>>();
    let cacheHits = 0;
    let cacheMisses = 0;

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      const hadCache = cache[imagePath] !== undefined;

      const result = await getFileHash(imagePath, cache);

      if (result) {
        const { hash, size } = result;
        const relativePath = path.relative(INPUT_DIR, imagePath);

        // Agrupar por hash
        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }
        hashMap.get(hash)!.push({ path: imagePath, size, relativePath });

        if (hadCache && (await isCacheValid(imagePath, cache[imagePath]))) {
          cacheHits++;
        } else {
          cacheMisses++;
        }
      }

      // Progresso
      if ((i + 1) % 100 === 0 || i === imagePaths.length - 1) {
        const progress = ((i + 1) / imagePaths.length) * 100;
        console.log(
          `   Processado: ${i + 1}/${imagePaths.length} (${progress.toFixed(1)}%) | Cache: ${cacheHits} hits, ${cacheMisses} misses`
        );
      }
    }

    // Salvar cache atualizado
    console.log("\n💾 Salvando cache...");
    await saveCache(cache);
    console.log(`   ✅ Cache salvo com ${Object.keys(cache).length} entradas\n`);

    // Encontrar duplicatas
    console.log("🔍 Identificando imagens idênticas...\n");
    const duplicateGroups = findDuplicateGroups(hashMap);

    // Estatísticas
    const totalDuplicates = duplicateGroups.reduce(
      (sum, group) => sum + group.files.length - 1,
      0
    );
    const totalWastedSpace = duplicateGroups.reduce(
      (sum, group) => sum + group.totalSize - group.files[0].size,
      0
    );

    // Relatório
    console.log("═══════════════════════════════════════════");
    console.log("📊 RELATÓRIO DE IMAGENS IDÊNTICAS");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Total de imagens: ${imagePaths.length}`);
    console.log(`   Imagens únicas: ${hashMap.size}`);
    console.log(`   Grupos de duplicatas: ${duplicateGroups.length}`);
    console.log(`   Total de arquivos duplicados: ${totalDuplicates}`);
    console.log(
      `   Espaço desperdiçado: ${(totalWastedSpace / 1024 / 1024).toFixed(2)} MB\n`
    );

    if (duplicateGroups.length === 0) {
      console.log("✅ Nenhuma imagem idêntica encontrada!\n");
      return;
    }

    // Detalhes dos grupos de duplicatas
    console.log("═══════════════════════════════════════════");
    console.log("📋 DETALHES DAS IMAGENS IDÊNTICAS");
    console.log("═══════════════════════════════════════════\n");

    // Mostrar até 20 grupos
    const maxGroups = 20;
    for (let index = 0; index < Math.min(duplicateGroups.length, maxGroups); index++) {
      const group = duplicateGroups[index];
      console.log(
        `\n🔴 Grupo ${index + 1} - ${group.files.length} imagens idênticas (${(group.totalSize / 1024 / 1024).toFixed(2)} MB total)`
      );
      console.log(`   Hash: ${group.hash.substring(0, 32)}...`);
      console.log(`   Arquivos:`);

      group.files.forEach((file, fileIndex) => {
        const sizeKB = (file.size / 1024).toFixed(2);
        const marker = fileIndex === 0 ? "   ✓" : "   ✗";
        console.log(
          `   ${marker} ${fileIndex + 1}. ${file.relativePath} (${sizeKB} KB)`
        );
      });
    }

    if (duplicateGroups.length > maxGroups) {
      console.log(`\n   ... e mais ${duplicateGroups.length - maxGroups} grupos de duplicatas\n`);
    }

    // Resumo final
    console.log("\n═══════════════════════════════════════════");
    console.log("💡 INFORMAÇÕES");
    console.log("═══════════════════════════════════════════\n");
    console.log(
      "   - Arquivos marcados com ✓ são os originais (mantenha estes)"
    );
    console.log(
      "   - Arquivos marcados com ✗ são duplicatas idênticas (podem ser deletados)"
    );
    console.log(
      `   - Você pode liberar ${(totalWastedSpace / 1024 / 1024).toFixed(2)} MB deletando duplicatas`
    );
    console.log(
      `   - Hash SHA256 garante 100% de precisão na detecção de imagens idênticas\n`
    );
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A BUSCA");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();



