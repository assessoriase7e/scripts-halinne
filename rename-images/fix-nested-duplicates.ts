import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para corrigir pastas duplicadas aninhadas
 * Exemplo: [colares][colares-ouro]/[colares][colares-ouro] -> [colares][colares-ouro]
 */

const IMAGES_DIR = "rename-images/images";
const DRY_RUN = false;

/**
 * Encontra pastas duplicadas aninhadas
 */
async function findNestedDuplicates(
  dirPath: string
): Promise<Array<{ parent: string; duplicate: string }>> {
  const duplicates: Array<{ parent: string; duplicate: string }> = [];

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryPath = path.join(currentPath, entry.name);
          const parentName = path.basename(currentPath);
          const childName = entry.name;

          // Verificar se a pasta filha tem o mesmo nome da pasta pai
          if (parentName === childName && /^\[.+\]\[.+\]$/.test(parentName)) {
            duplicates.push({
              parent: currentPath,
              duplicate: entryPath,
            });
          }

          // Continuar escaneando recursivamente
          await scan(entryPath);
        }
      }
    } catch (error) {
      console.error(
        `❌ Erro ao escanear ${currentPath}: ${(error as Error).message}`
      );
    }
  }

  await scan(dirPath);
  return duplicates;
}

/**
 * Remove pasta recursivamente
 */
async function removeDirectoryRecursive(dirPath: string): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await removeDirectoryRecursive(fullPath);
    } else {
      await fs.unlink(fullPath);
    }
  }

  await fs.rmdir(dirPath);
}

/**
 * Move conteúdo da pasta duplicada para a pasta pai e remove a duplicada
 */
async function fixDuplicate(
  parentPath: string,
  duplicatePath: string
): Promise<boolean> {
  try {
    const entries = await fs.readdir(duplicatePath);

    if (entries.length === 0) {
      // Pasta vazia, apenas deletar
      if (!DRY_RUN) {
        await fs.rmdir(duplicatePath);
      }
      return true;
    }

    // Mover cada item da pasta duplicada para a pasta pai
    for (const entry of entries) {
      const sourcePath = path.join(duplicatePath, entry);
      const destPath = path.join(parentPath, entry);

      // Verificar se destino já existe
      if (fsSync.existsSync(destPath)) {
        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          // Se for diretório, mover conteúdo recursivamente
          const subEntries = await fs.readdir(sourcePath);
          for (const subEntry of subEntries) {
            const subSource = path.join(sourcePath, subEntry);
            const subDest = path.join(destPath, subEntry);
            if (!fsSync.existsSync(subDest)) {
              if (!DRY_RUN) {
                await fs.rename(subSource, subDest);
              }
            }
          }
        }
        // Pular arquivos que já existem (como .DS_Store)
        continue;
      }

      if (!DRY_RUN) {
        await fs.rename(sourcePath, destPath);
      }
    }

    // Remover pasta duplicada recursivamente
    if (!DRY_RUN) {
      await removeDirectoryRecursive(duplicatePath);
    }

    return true;
  } catch (error) {
    console.error(
      `   ❌ Erro ao corrigir duplicata: ${(error as Error).message}`
    );
    return false;
  }
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔧 CORREÇÃO DE PASTAS DUPLICADAS ANINHADAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${IMAGES_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(IMAGES_DIR)) {
    console.error(`❌ Diretório não encontrado: ${IMAGES_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔍 Procurando pastas duplicadas aninhadas...\n");
    const duplicates = await findNestedDuplicates(IMAGES_DIR);

    if (duplicates.length === 0) {
      console.log("✅ Nenhuma pasta duplicada encontrada!\n");
      return;
    }

    console.log(`   ✅ Encontradas ${duplicates.length} pastas duplicadas\n`);

    // Exibir resumo
    console.log("═══════════════════════════════════════════");
    console.log("📊 PASTAS DUPLICADAS ENCONTRADAS");
    console.log("═══════════════════════════════════════════\n");

    for (const dup of duplicates) {
      const relativePath = path.relative(process.cwd(), dup.duplicate);
      console.log(`   📁 ${relativePath}`);
    }

    console.log();

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhuma correção foi feita\n");
      return;
    }

    // Corrigir duplicatas
    console.log("🔄 Corrigindo pastas duplicadas...\n");
    let successCount = 0;
    let errorCount = 0;

    for (const dup of duplicates) {
      const relativeParent = path.relative(process.cwd(), dup.parent);
      const relativeDup = path.relative(process.cwd(), dup.duplicate);

      console.log(`   🔄 Corrigindo: ${relativeDup}`);
      console.log(`      Movendo conteúdo para: ${relativeParent}`);

      const success = await fixDuplicate(dup.parent, dup.duplicate);
      if (success) {
        successCount++;
        console.log(`      ✅ Corrigido com sucesso\n`);
      } else {
        errorCount++;
        console.log(`      ❌ Erro ao corrigir\n`);
      }
    }

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ CORREÇÃO CONCLUÍDA");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Pastas corrigidas: ${successCount}`);
    console.log(`   Erros: ${errorCount}\n`);
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A CORREÇÃO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();

