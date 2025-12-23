import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para fundir pastas com nomes iguais
 * Move arquivos de uma pasta para outra e remove a pasta vazia
 */

const IMAGES_DIR = "rename-images/images";
const DRY_RUN = true; // Mudar para false quando estiver pronto

interface FolderInfo {
  fullPath: string;
  relativePath: string;
  name: string;
  depth: number;
}

/**
 * Encontra todas as pastas e agrupa por nome
 */
async function findAllFolders(
  rootDir: string
): Promise<Map<string, FolderInfo[]>> {
  const foldersByName = new Map<string, FolderInfo[]>();

  async function scan(currentPath: string, depth: number = 0): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(rootDir, fullPath);

          const folderInfo: FolderInfo = {
            fullPath,
            relativePath,
            name: entry.name,
            depth,
          };

          if (!foldersByName.has(entry.name)) {
            foldersByName.set(entry.name, []);
          }
          foldersByName.get(entry.name)!.push(folderInfo);

          // Continuar escaneando recursivamente
          await scan(fullPath, depth + 1);
        }
      }
    } catch (error) {
      console.error(
        `❌ Erro ao escanear ${currentPath}: ${(error as Error).message}`
      );
    }
  }

  await scan(rootDir);
  return foldersByName;
}

/**
 * Move arquivos de uma pasta para outra, lidando com conflitos
 */
async function moveFilesWithConflictHandling(
  sourceDir: string,
  destDir: string
): Promise<{ moved: number; skipped: number; errors: number }> {
  let moved = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      try {
        if (entry.isDirectory()) {
          // Se for diretório, mover recursivamente
          if (!fsSync.existsSync(destPath)) {
            if (!DRY_RUN) {
              await fs.mkdir(destPath, { recursive: true });
            }
          }

          const subResult = await moveFilesWithConflictHandling(
            sourcePath,
            destPath
          );
          moved += subResult.moved;
          skipped += subResult.skipped;
          errors += subResult.errors;

          // Tentar remover diretório vazio
          try {
            const subEntries = await fs.readdir(sourcePath);
            if (subEntries.length === 0 && !DRY_RUN) {
              await fs.rmdir(sourcePath);
            }
          } catch {
            // Ignorar erros ao remover diretório
          }
        } else {
          // Se for arquivo
          if (fsSync.existsSync(destPath)) {
            // Conflito: arquivo já existe
            // Criar nome único adicionando sufixo
            const ext = path.extname(entry.name);
            const baseName = path.basename(entry.name, ext);
            let counter = 1;
            let newDestPath = destPath;

            while (fsSync.existsSync(newDestPath)) {
              const newName = `${baseName}_${counter}${ext}`;
              newDestPath = path.join(destDir, newName);
              counter++;
            }

            if (!DRY_RUN) {
              await fs.rename(sourcePath, newDestPath);
            }
            moved++;
            console.log(
              `      ⚠️ Conflito resolvido: ${entry.name} → ${path.basename(newDestPath)}`
            );
          } else {
            // Sem conflito, mover normalmente
            if (!DRY_RUN) {
              await fs.rename(sourcePath, destPath);
            }
            moved++;
          }
        }
      } catch (error) {
        errors++;
        console.error(
          `      ❌ Erro ao mover ${entry.name}: ${(error as Error).message}`
        );
      }
    }
  } catch (error) {
    console.error(
      `   ❌ Erro ao ler diretório ${sourceDir}: ${(error as Error).message}`
    );
    errors++;
  }

  return { moved, skipped, errors };
}

/**
 * Remove pasta vazia
 */
async function removeEmptyFolder(folderPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(folderPath);
    if (entries.length === 0) {
      if (!DRY_RUN) {
        await fs.rmdir(folderPath);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error(
      `   ❌ Erro ao remover pasta ${folderPath}: ${(error as Error).message}`
    );
    return false;
  }
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔀 FUSÃO DE PASTAS DUPLICADAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${IMAGES_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(IMAGES_DIR)) {
    console.error(`❌ Diretório não encontrado: ${IMAGES_DIR}`);
    process.exit(1);
  }

  try {
    // Encontrar todas as pastas
    console.log("🔍 Escaneando pastas...");
    const foldersByName = await findAllFolders(IMAGES_DIR);

    // Filtrar apenas pastas duplicadas (mesmo nome em locais diferentes)
    const duplicateGroups: Array<{
      name: string;
      folders: FolderInfo[];
    }> = [];

    for (const [name, folders] of foldersByName.entries()) {
      // Ignorar pastas numéricas (códigos de produtos)
      if (/^\d+$/.test(name)) {
        continue;
      }

      // Ignorar pastas especiais
      const specialFolders = [
        "images",
        "cadastradas-parte-1",
        "geradas-novas",
        "transfer",
        "prontas2",
        "prontas3",
        "modelo",
        "pedra",
        "organized",
      ];
      if (specialFolders.includes(name.toLowerCase())) {
        continue;
      }

      // Se há mais de uma pasta com o mesmo nome
      if (folders.length > 1) {
        duplicateGroups.push({ name, folders });
      }
    }

    console.log(`   ✅ Encontradas ${duplicateGroups.length} grupos de pastas duplicadas\n`);

    if (duplicateGroups.length === 0) {
      console.log("✅ Nenhuma pasta duplicada encontrada!\n");
      return;
    }

    // Exibir resumo
    console.log("═══════════════════════════════════════════");
    console.log("📊 PASTAS DUPLICADAS ENCONTRADAS");
    console.log("═══════════════════════════════════════════\n");

    for (const group of duplicateGroups) {
      console.log(`   📁 ${group.name} (${group.folders.length} ocorrências):`);
      group.folders.forEach((folder, index) => {
        console.log(`      ${index + 1}. ${folder.relativePath}`);
      });
      console.log();
    }

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhuma fusão foi feita\n");
      return;
    }

    // Processar cada grupo de pastas duplicadas
    console.log("🔄 Fundindo pastas...\n");
    let totalMoved = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let foldersRemoved = 0;

    for (const group of duplicateGroups) {
      const folders = group.folders.sort((a, b) => {
        // Ordenar por profundidade (mais profundas primeiro)
        // e depois por caminho (alfabeticamente)
        if (a.depth !== b.depth) {
          return b.depth - a.depth;
        }
        return a.relativePath.localeCompare(b.relativePath);
      });

      // A primeira pasta será a de destino (mantém a estrutura mais profunda ou alfabética)
      const destFolder = folders[0];
      const sourceFolders = folders.slice(1);

      console.log(`   🔀 Fundindo "${group.name}":`);
      console.log(`      Destino: ${destFolder.relativePath}`);

      for (const sourceFolder of sourceFolders) {
        console.log(`      Origem: ${sourceFolder.relativePath}`);

        // Contar arquivos antes de mover
        const countFiles = async (dir: string): Promise<number> => {
          let count = 0;
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                count += await countFiles(fullPath);
              } else {
                count++;
              }
            }
          } catch {
            // Ignorar erros
          }
          return count;
        };

        const fileCountBefore = await countFiles(sourceFolder.fullPath);

        // Mover arquivos
        const result = await moveFilesWithConflictHandling(
          sourceFolder.fullPath,
          destFolder.fullPath
        );

        totalMoved += result.moved;
        totalSkipped += result.skipped;
        totalErrors += result.errors;

        console.log(
          `         Arquivos movidos: ${result.moved}, Erros: ${result.errors}`
        );

        // Tentar remover pasta origem se estiver vazia
        const removed = await removeEmptyFolder(sourceFolder.fullPath);
        if (removed) {
          foldersRemoved++;
          console.log(`         ✅ Pasta removida (estava vazia)`);
        } else {
          // Tentar remover recursivamente se ainda tiver conteúdo
          try {
            const remainingEntries = await fs.readdir(sourceFolder.fullPath);
            if (remainingEntries.length === 0 && !DRY_RUN) {
              await fs.rmdir(sourceFolder.fullPath);
              foldersRemoved++;
              console.log(`         ✅ Pasta removida`);
            } else {
              console.log(
                `         ⚠️ Pasta não removida (ainda tem conteúdo)`
              );
            }
          } catch {
            // Ignorar erros
          }
        }
      }
      console.log();
    }

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ FUSÃO CONCLUÍDA");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Grupos processados: ${duplicateGroups.length}`);
    console.log(`   Arquivos movidos: ${totalMoved}`);
    console.log(`   Arquivos pulados: ${totalSkipped}`);
    console.log(`   Erros: ${totalErrors}`);
    console.log(`   Pastas removidas: ${foldersRemoved}\n`);
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A FUSÃO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();

