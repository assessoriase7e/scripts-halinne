import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Script para encontrar imagens duplicadas usando hash SHA256
 * Mantém cache JSON para evitar recalcular hashes já processados
 */

// Configurações
const IMAGES_DIR = "rename-images/images"; // Pasta onde buscar imagens
const CACHE_FILE = "rename-images/image-hash-cache.json"; // Arquivo de cache
const RECURSIVE = true; // Buscar recursivamente
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

interface HashCache {
  [filePath: string]: {
    hash: string;
    size: number;
    modified: number; // timestamp da última modificação
    calculatedAt: string; // quando foi calculado
  };
}

interface DuplicateGroup {
  hash: string;
  files: Array<{
    path: string;
    size: number;
  }>;
  totalSize: number;
}

/**
 * Carrega o cache de hashes do arquivo JSON
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
 * Salva o cache de hashes no arquivo JSON
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
    // Cache é válido se a data de modificação não mudou
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
 * Lista todos os arquivos de imagem em um diretório
 */
async function listImages(
  dirPath: string,
  recursive: boolean = true
): Promise<string[]> {
  const imageFiles: string[] = [];

  async function scanDirectory(currentPath: string): Promise<void> {
    try {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory() && recursive) {
          await scanDirectory(itemPath);
        } else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (IMAGE_EXTENSIONS.includes(ext)) {
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
  hashMap: Map<string, Array<{ path: string; size: number }>>
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
  console.log("🔍 BUSCA DE IMAGENS DUPLICADAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Pasta de imagens: ${IMAGES_DIR}`);
  console.log(`   - Arquivo de cache: ${CACHE_FILE}`);
  console.log(`   - Busca recursiva: ${RECURSIVE ? "Sim" : "Não"}\n`);

  // Verificar se o diretório existe
  if (!fsSync.existsSync(IMAGES_DIR)) {
    console.error(`❌ Diretório não encontrado: ${IMAGES_DIR}`);
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
    const imagePaths = await listImages(IMAGES_DIR, RECURSIVE);
    console.log(`   ✅ Encontradas ${imagePaths.length} imagens\n`);

    if (imagePaths.length === 0) {
      console.log("⚠️ Nenhuma imagem encontrada!");
      return;
    }

    // Calcular hashes (usando cache quando possível)
    console.log("🔐 Calculando hashes das imagens...\n");
    const hashMap = new Map<string, Array<{ path: string; size: number }>>();
    let cacheHits = 0;
    let cacheMisses = 0;

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      const hadCache = cache[imagePath] !== undefined;

      const result = await getFileHash(imagePath, cache);

      if (result) {
        const { hash, size } = result;

        // Agrupar por hash
        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }
        hashMap.get(hash)!.push({ path: imagePath, size });

        if (hadCache && (await isCacheValid(imagePath, cache[imagePath]))) {
          cacheHits++;
        } else {
          cacheMisses++;
        }
      }

      // Progresso
      if ((i + 1) % 50 === 0 || i === imagePaths.length - 1) {
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
    console.log("🔍 Identificando duplicatas...\n");
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
    console.log("📊 RELATÓRIO DE DUPLICATAS");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Total de imagens: ${imagePaths.length}`);
    console.log(`   Imagens únicas: ${hashMap.size}`);
    console.log(`   Grupos de duplicatas: ${duplicateGroups.length}`);
    console.log(`   Total de arquivos duplicados: ${totalDuplicates}`);
    console.log(
      `   Espaço desperdiçado: ${(totalWastedSpace / 1024 / 1024).toFixed(2)} MB\n`
    );

    if (duplicateGroups.length === 0) {
      console.log("✅ Nenhuma duplicata encontrada!\n");
      return;
    }

    // Detalhes dos grupos de duplicatas
    console.log("═══════════════════════════════════════════");
    console.log("📋 DETALHES DAS DUPLICATAS");
    console.log("═══════════════════════════════════════════\n");

    duplicateGroups.forEach((group, index) => {
      console.log(
        `\n🔴 Grupo ${index + 1} - ${group.files.length} duplicatas (${(group.totalSize / 1024 / 1024).toFixed(2)} MB total)`
      );
      console.log(`   Hash: ${group.hash.substring(0, 16)}...`);
      console.log(`   Arquivos:`);

      group.files.forEach((file, fileIndex) => {
        const relativePath = path.relative(process.cwd(), file.path);
        const sizeKB = (file.size / 1024).toFixed(2);
        const marker = fileIndex === 0 ? "   ✓" : "   ✗";
        console.log(
          `   ${marker} ${fileIndex + 1}. ${relativePath} (${sizeKB} KB)`
        );
      });
    });

    // Resumo final
    console.log("\n═══════════════════════════════════════════");
    console.log("💡 DICAS");
    console.log("═══════════════════════════════════════════\n");
    console.log(
      "   - Arquivos marcados com ✓ são os originais (mantenha estes)"
    );
    console.log(
      "   - Arquivos marcados com ✗ são duplicatas (podem ser deletados)"
    );
    console.log(
      `   - Você pode liberar ${(totalWastedSpace / 1024 / 1024).toFixed(2)} MB deletando duplicatas\n`
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



