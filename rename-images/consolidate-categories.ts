import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para consolidar todas as pastas de categoria em uma única pasta
 * Move todas as pastas [categoria][subcategoria] para uma pasta separada
 * e remove as estruturas antigas
 */

const IMAGES_DIR = "rename-images/images";
const TARGET_DIR = "rename-images/images/categorias";
const DRY_RUN = false;

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
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(rootDir, fullPath);

          // Verificar se é uma pasta de categoria (formato [categoria][subcategoria])
          if (/^\[.+\]\[.+\]$/.test(entry.name)) {
            folders.push({
              fullPath,
              name: entry.name,
              relativePath,
            });
          } else {
            // Continuar escaneando recursivamente
            await scan(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(
        `❌ Erro ao escanear ${currentPath}: ${(error as Error).message}`
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
): Promise<{ success: boolean; finalPath: string }> {
  try {
    // Se destino já existe, criar nome único
    if (fsSync.existsSync(destPath)) {
      const baseName = path.basename(destPath);
      const parentDir = path.dirname(destPath);
      let counter = 1;
      let newDestPath = destPath;

      while (fsSync.existsSync(newDestPath)) {
        const newName = `${baseName}_${counter}`;
        newDestPath = path.join(parentDir, newName);
        counter++;
      }

      if (!DRY_RUN) {
        await fs.rename(sourcePath, newDestPath);
      }
      return { success: true, finalPath: newDestPath };
    } else {
      if (!DRY_RUN) {
        await fs.rename(sourcePath, destPath);
      }
      return { success: true, finalPath: destPath };
    }
  } catch (error) {
    console.error(
      `   ❌ Erro ao mover ${sourcePath}: ${(error as Error).message}`
    );
    return { success: false, finalPath: destPath };
  }
}

/**
 * Remove pasta recursivamente se estiver vazia
 */
async function removeEmptyFolders(rootDir: string): Promise<number> {
  let removedCount = 0;

  async function scan(currentPath: string): Promise<boolean> {
    try {
      // Não remover a pasta de destino
      if (currentPath === TARGET_DIR) {
        return false;
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      let isEmpty = true;

      // Verificar se há subpastas ou arquivos
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          const subEmpty = await scan(fullPath);
          if (!subEmpty) {
            isEmpty = false;
          }
        } else {
          isEmpty = false;
        }
      }

      // Se estiver vazia e não for a raiz, remover
      if (isEmpty && currentPath !== rootDir) {
        try {
          if (!DRY_RUN) {
            await fs.rmdir(currentPath);
          }
          removedCount++;
          return true;
        } catch (error) {
          // Ignorar erros ao remover
          return false;
        }
      }

      return isEmpty;
    } catch (error) {
      return false;
    }
  }

  await scan(rootDir);
  return removedCount;
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("📦 CONSOLIDAÇÃO DE CATEGORIAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório origem: ${IMAGES_DIR}`);
  console.log(`   - Diretório destino: ${TARGET_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(IMAGES_DIR)) {
    console.error(`❌ Diretório não encontrado: ${IMAGES_DIR}`);
    process.exit(1);
  }

  try {
    // Criar pasta de destino
    if (!fsSync.existsSync(TARGET_DIR)) {
      console.log("📁 Criando pasta de destino...");
      if (!DRY_RUN) {
        await fs.mkdir(TARGET_DIR, { recursive: true });
      }
      console.log(`   ✅ Pasta criada: ${TARGET_DIR}\n`);
    }

    // Encontrar todas as pastas de categoria
    console.log("🔍 Procurando pastas de categoria...");
    const categoryFolders = await findCategoryFolders(IMAGES_DIR);
    console.log(`   ✅ Encontradas ${categoryFolders.length} pastas de categoria\n`);

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
      console.log(`      Para: categorias/${folder.name}\n`);
    });

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhuma pasta foi movida\n");
      return;
    }

    // Mover pastas
    console.log("🔄 Movendo pastas...\n");
    let movedCount = 0;
    let errorCount = 0;
    const conflicts: string[] = [];

    for (const folder of categoryFolders) {
      const destPath = path.join(TARGET_DIR, folder.name);
      console.log(`   🔄 Movendo: ${folder.name}`);

      const result = await moveFolder(folder.fullPath, destPath);
      if (result.success) {
        movedCount++;
        if (result.finalPath !== destPath) {
          conflicts.push(`${folder.name} → ${path.basename(result.finalPath)}`);
          console.log(`      ⚠️ Conflito resolvido: ${path.basename(result.finalPath)}`);
        } else {
          console.log(`      ✅ Movido com sucesso`);
        }
      } else {
        errorCount++;
        console.log(`      ❌ Erro ao mover`);
      }
    }

    console.log();

    // Remover pastas vazias
    console.log("🧹 Removendo pastas vazias...");
    const removedCount = await removeEmptyFolders(IMAGES_DIR);
    console.log(`   ✅ ${removedCount} pastas vazias removidas\n`);

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ CONSOLIDAÇÃO CONCLUÍDA");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Pastas movidas: ${movedCount}`);
    console.log(`   Erros: ${errorCount}`);
    console.log(`   Pastas vazias removidas: ${removedCount}`);

    if (conflicts.length > 0) {
      console.log(`\n   ⚠️ Conflitos resolvidos (${conflicts.length}):`);
      conflicts.forEach((conflict) => {
        console.log(`      - ${conflict}`);
      });
    }

    console.log(`\n   📁 Todas as categorias estão agora em: ${TARGET_DIR}\n`);
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A CONSOLIDAÇÃO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();



