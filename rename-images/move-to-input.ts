import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para mover todas as pastas [categoria][subcategoria] para rename-images/input
 * Sem perda de arquivos
 */

const ROOT_DIR = path.resolve(".");
const TARGET_DIR = path.join(ROOT_DIR, "rename-images", "input");
const DRY_RUN = false; // true para simular sem mover

// Pastas a ignorar
const IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "rename-images/input", // Não mover pastas que já estão no destino
];

/**
 * Verifica se um caminho deve ser ignorado
 */
function shouldIgnore(folderPath: string): boolean {
  const normalizedPath = folderPath.replace(/\\/g, "/");
  return IGNORE_PATTERNS.some((pattern) => normalizedPath.includes(pattern));
}

/**
 * Encontra todas as pastas no formato [categoria][subcategoria]
 */
async function findCategoryFolders(
  rootDir: string
): Promise<Array<{ fullPath: string; name: string; relativePath: string }>> {
  const folders: Array<{
    fullPath: string;
    name: string;
    relativePath: string;
  }> = [];

  async function scan(currentPath: string): Promise<void> {
    try {
      // Verificar se deve ignorar este caminho
      if (shouldIgnore(currentPath)) {
        return;
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(rootDir, fullPath);

          // Verificar se é uma pasta de categoria (formato [categoria][subcategoria])
          if (/^\[.+\]\[.+\]$/.test(entry.name)) {
            // Verificar se não está dentro da pasta de destino
            if (!shouldIgnore(fullPath)) {
              folders.push({
                fullPath,
                name: entry.name,
                relativePath,
              });
            }
          } else {
            // Continuar escaneando recursivamente
            await scan(fullPath);
          }
        }
      }
    } catch (error) {
      // Ignorar erros de permissão ou outros
      console.error(
        `⚠️ Erro ao escanear ${currentPath}: ${(error as Error).message}`
      );
    }
  }

  await scan(rootDir);
  return folders;
}

/**
 * Move pasta para o destino, lidando com conflitos
 */
async function moveFolder(
  sourcePath: string,
  destPath: string
): Promise<{ success: boolean; finalPath: string; merged: boolean }> {
  try {
    // Se destino já existe, mesclar conteúdo
    if (fsSync.existsSync(destPath)) {
      console.log(`   ⚠️ Pasta já existe, mesclando conteúdo...`);

      if (!DRY_RUN) {
        const sourceFiles = await fs.readdir(sourcePath, { withFileTypes: true });

        for (const entry of sourceFiles) {
          const sourceEntryPath = path.join(sourcePath, entry.name);
          const destEntryPath = path.join(destPath, entry.name);

          if (entry.isDirectory()) {
            // Se é uma subpasta e já existe, mesclar recursivamente
            if (fsSync.existsSync(destEntryPath)) {
              await moveFolder(sourceEntryPath, destEntryPath);
            } else {
              await fs.rename(sourceEntryPath, destEntryPath);
            }
          } else {
            // Se é um arquivo e já existe, adicionar sufixo
            if (fsSync.existsSync(destEntryPath)) {
              const ext = path.extname(entry.name);
              const base = path.basename(entry.name, ext);
              let counter = 1;
              let newDestPath = path.join(destPath, `${base}_${counter}${ext}`);

              while (fsSync.existsSync(newDestPath)) {
                counter++;
                newDestPath = path.join(destPath, `${base}_${counter}${ext}`);
              }

              await fs.rename(sourceEntryPath, newDestPath);
              console.log(`      → ${entry.name} → ${path.basename(newDestPath)}`);
            } else {
              await fs.rename(sourceEntryPath, destEntryPath);
            }
          }
        }

        // Remover pasta fonte vazia
        try {
          await fs.rmdir(sourcePath);
        } catch {
          // Ignorar se não estiver vazia
        }
      }

      return { success: true, finalPath: destPath, merged: true };
    } else {
      // Criar diretório pai se não existir
      const parentDir = path.dirname(destPath);
      if (!fsSync.existsSync(parentDir)) {
        if (!DRY_RUN) {
          await fs.mkdir(parentDir, { recursive: true });
        }
      }

      // Mover pasta inteira
      if (!DRY_RUN) {
        await fs.rename(sourcePath, destPath);
      }

      return { success: true, finalPath: destPath, merged: false };
    }
  } catch (error) {
    console.error(
      `   ❌ Erro ao mover ${sourcePath}: ${(error as Error).message}`
    );
    return { success: false, finalPath: destPath, merged: false };
  }
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("📦 MOVENDO PASTAS PARA rename-images/input");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório raiz: ${ROOT_DIR}`);
  console.log(`   - Diretório destino: ${TARGET_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  try {
    // Criar pasta de destino se não existir
    if (!fsSync.existsSync(TARGET_DIR)) {
      console.log("📁 Criando pasta de destino...");
      if (!DRY_RUN) {
        await fs.mkdir(TARGET_DIR, { recursive: true });
      }
      console.log(`   ✅ Pasta criada: ${TARGET_DIR}\n`);
    }

    // Encontrar todas as pastas de categoria
    console.log("🔍 Procurando pastas [categoria][subcategoria]...");
    const categoryFolders = await findCategoryFolders(ROOT_DIR);
    console.log(`   ✅ Encontradas ${categoryFolders.length} pastas\n`);

    if (categoryFolders.length === 0) {
      console.log("⚠️ Nenhuma pasta de categoria encontrada!\n");
      return;
    }

    // Exibir resumo
    console.log("═══════════════════════════════════════════");
    console.log("📊 PASTAS A SEREM MOVIDAS");
    console.log("═══════════════════════════════════════════\n");

    categoryFolders.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.name}`);
      console.log(`      De: ${folder.relativePath}`);
      console.log(`      Para: rename-images/input/${folder.name}\n`);
    });

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhuma pasta foi movida\n");
      return;
    }

    // Mover pastas
    console.log("🔄 Movendo pastas...\n");
    let movedCount = 0;
    let mergedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < categoryFolders.length; i++) {
      const folder = categoryFolders[i];
      const destPath = path.join(TARGET_DIR, folder.name);

      console.log(`[${i + 1}/${categoryFolders.length}] ${folder.name}`);

      const result = await moveFolder(folder.fullPath, destPath);
      if (result.success) {
        if (result.merged) {
          mergedCount++;
          console.log(`   ✅ Mesclado com sucesso`);
        } else {
          movedCount++;
          console.log(`   ✅ Movido com sucesso`);
        }
      } else {
        errorCount++;
        console.log(`   ❌ Erro ao mover`);
      }
      console.log();
    }

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Pastas movidas: ${movedCount}`);
    console.log(`   Pastas mescladas: ${mergedCount}`);
    console.log(`   Erros: ${errorCount}`);
    console.log(`   Total processado: ${categoryFolders.length}`);
    console.log(`\n   📁 Todas as categorias estão agora em: ${TARGET_DIR}\n`);
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O PROCESSAMENTO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();

