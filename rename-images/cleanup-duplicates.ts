import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getContentHash } from "../src/cache.js";

/**
 * Script para comparar imagens entre duas pastas e excluir duplicatas
 * Compara por hash SHA256 do conteúdo do arquivo
 */

// Configurações
const SOURCE_DIR = "rename-images/images"; // Pasta de origem (onde podem estar duplicatas)
const TARGET_DIR = "rename-images/organized"; // Pasta de destino (referência)
const DRY_RUN = false; // true para simular sem deletar
const RECURSIVE = true; // Buscar recursivamente

interface ImageFile {
  path: string;
  hash: string;
  size: number;
}

/**
 * Lista todos os arquivos de imagem em um diretório
 */
async function listImages(dirPath: string, recursive: boolean = true): Promise<string[]> {
  const imageFiles: string[] = [];
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

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
          if (imageExtensions.includes(ext)) {
            imageFiles.push(itemPath);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao ler diretório ${currentPath}: ${(error as Error).message}`);
    }
  }

  await scanDirectory(dirPath);
  return imageFiles;
}

/**
 * Calcula hash e tamanho de uma lista de imagens
 */
async function hashImages(imagePaths: string[]): Promise<Map<string, ImageFile>> {
  const hashMap = new Map<string, ImageFile>();
  
  console.log(`\n🔍 Calculando hashes de ${imagePaths.length} imagens...\n`);
  
  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    
    try {
      const hash = await getContentHash(imagePath);
      const stats = await fs.stat(imagePath);
      
      if (hash) {
        hashMap.set(hash, {
          path: imagePath,
          hash,
          size: stats.size,
        });
        
        if ((i + 1) % 10 === 0 || i === imagePaths.length - 1) {
          console.log(`   Processado: ${i + 1}/${imagePaths.length}`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Erro ao processar ${path.basename(imagePath)}: ${(error as Error).message}`);
    }
  }
  
  return hashMap;
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🧹 LIMPEZA DE DUPLICATAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Pasta de origem (verificar duplicatas): ${SOURCE_DIR}`);
  console.log(`   - Pasta de destino (referência): ${TARGET_DIR}`);
  console.log(`   - Modo de simulação: ${DRY_RUN ? "Sim" : "Não"}`);
  console.log(`   - Busca recursiva: ${RECURSIVE ? "Sim" : "Não"}\n`);

  // Verificar se os diretórios existem
  if (!fsSync.existsSync(SOURCE_DIR)) {
    console.error(`❌ Diretório de origem não encontrado: ${SOURCE_DIR}`);
    process.exit(1);
  }

  if (!fsSync.existsSync(TARGET_DIR)) {
    console.error(`❌ Diretório de destino não encontrado: ${TARGET_DIR}`);
    process.exit(1);
  }

  try {
    // Listar imagens em ambas as pastas
    console.log("📂 Listando imagens na pasta de destino (referência)...");
    const targetImages = await listImages(TARGET_DIR, RECURSIVE);
    console.log(`   ✅ Encontradas ${targetImages.length} imagens na pasta de destino\n`);

    console.log("📂 Listando imagens na pasta de origem...");
    const sourceImages = await listImages(SOURCE_DIR, RECURSIVE);
    console.log(`   ✅ Encontradas ${sourceImages.length} imagens na pasta de origem\n`);

    if (targetImages.length === 0) {
      console.log("⚠️ Nenhuma imagem encontrada na pasta de destino. Nada a comparar.");
      return;
    }

    if (sourceImages.length === 0) {
      console.log("⚠️ Nenhuma imagem encontrada na pasta de origem. Nada a limpar.");
      return;
    }

    // Calcular hashes das imagens de destino (referência)
    console.log("🔐 Calculando hashes da pasta de destino (referência)...");
    const targetHashMap = await hashImages(targetImages);
    console.log(`   ✅ ${targetHashMap.size} hashes únicos calculados\n`);

    // Verificar duplicatas na pasta de origem
    console.log("🔍 Verificando duplicatas na pasta de origem...\n");
    
    const duplicates: Array<{ source: string; target: string; hash: string; size: number }> = [];
    let processedCount = 0;

    for (const sourcePath of sourceImages) {
      try {
        const hash = await getContentHash(sourcePath);
        
        if (hash && targetHashMap.has(hash)) {
          const targetFile = targetHashMap.get(hash)!;
          duplicates.push({
            source: sourcePath,
            target: targetFile.path,
            hash,
            size: targetFile.size,
          });
          
          console.log(`   🔄 Duplicata encontrada:`);
          console.log(`      Origem: ${sourcePath}`);
          console.log(`      Destino: ${targetFile.path}`);
          console.log(`      Hash: ${hash.substring(0, 16)}...`);
          console.log(`      Tamanho: ${(targetFile.size / 1024).toFixed(2)} KB\n`);
        }
        
        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`   Verificado: ${processedCount}/${sourceImages.length}`);
        }
      } catch (error) {
        console.error(`   ❌ Erro ao verificar ${path.basename(sourcePath)}: ${(error as Error).message}`);
      }
    }

    // Resumo
    console.log("\n═══════════════════════════════════════════");
    console.log("📊 RESUMO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Total de imagens na origem: ${sourceImages.length}`);
    console.log(`   Total de imagens no destino: ${targetImages.length}`);
    console.log(`   Duplicatas encontradas: ${duplicates.length}\n`);

    if (duplicates.length === 0) {
      console.log("✅ Nenhuma duplicata encontrada!");
      return;
    }

    // Deletar duplicatas
    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Os seguintes arquivos SERIAM deletados:\n");
      duplicates.forEach((dup, index) => {
        console.log(`   ${index + 1}. ${dup.source}`);
      });
    } else {
      console.log("🗑️ Deletando duplicatas...\n");
      
      let deletedCount = 0;
      let errorCount = 0;
      
      for (const dup of duplicates) {
        try {
          await fs.unlink(dup.source);
          console.log(`   ✅ Deletado: ${dup.source}`);
          deletedCount++;
        } catch (error) {
          console.error(`   ❌ Erro ao deletar ${dup.source}: ${(error as Error).message}`);
          errorCount++;
        }
      }
      
      console.log("\n═══════════════════════════════════════════");
      console.log("✅ LIMPEZA CONCLUÍDA!");
      console.log("═══════════════════════════════════════════\n");
      console.log(`   Arquivos deletados: ${deletedCount}`);
      console.log(`   Erros: ${errorCount}`);
      
      if (deletedCount > 0) {
        const spaceSaved = duplicates.reduce((sum, dup) => sum + dup.size, 0);
        console.log(`   Espaço liberado: ${(spaceSaved / 1024 / 1024).toFixed(2)} MB`);
      }
    }

  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A LIMPEZA");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();
