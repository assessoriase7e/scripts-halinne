import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para organizar imagens em subpastas por código do produto
 * Move imagens que estão soltas nas pastas de categoria para subpastas nomeadas com o código
 * Adaptado para trabalhar com rename-images/input
 */

const INPUT_DIR = "rename-images/input";
const DRY_RUN = false;

/**
 * Extrai o código do produto do nome do arquivo
 * Exemplos:
 *   "1287.png" -> "1287"
 *   "1287 - AD - 1.png" -> "1287"
 *   "1287 branca.png" -> "1287"
 *   "285.png" -> "285"
 *   "823-AD1.png" -> "823"
 */
function extractProductCode(fileName: string): string | null {
  // Remove extensão
  const nameWithoutExt = path.basename(fileName, path.extname(fileName));

  // Tenta extrair número no início do nome
  const match = nameWithoutExt.match(/^(\d+)/);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Processa uma pasta de categoria
 */
async function processCategoryFolder(
  categoryPath: string
): Promise<{
  moved: number;
  errors: number;
  createdFolders: number;
}> {
  let moved = 0;
  let errors = 0;
  let createdFolders = 0;
  const createdFoldersSet = new Set<string>();

  try {
    const entries = await fs.readdir(categoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(categoryPath, entry.name);

      if (entry.isDirectory()) {
        // Se for uma pasta numérica (código), pular (já está organizada)
        if (/^\d+$/.test(entry.name)) {
          continue;
        }
        // Se for outra pasta, processar recursivamente
        const subResult = await processCategoryFolder(fullPath);
        moved += subResult.moved;
        errors += subResult.errors;
        createdFolders += subResult.createdFolders;
      } else if (entry.isFile()) {
        // Verificar se é imagem
        const ext = path.extname(entry.name).toLowerCase();
        if (![".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".JPG"].includes(ext)) {
          continue;
        }

        // É um arquivo solto na pasta de categoria
        const code = extractProductCode(entry.name);

        if (!code) {
          console.log(
            `   ⚠️ Não foi possível extrair código de: ${entry.name}`
          );
          errors++;
          continue;
        }

        // Criar pasta de código se não existir
        const codeFolderPath = path.join(categoryPath, code);
        const folderKey = codeFolderPath;

        if (!createdFoldersSet.has(folderKey)) {
          if (!fsSync.existsSync(codeFolderPath)) {
            if (!DRY_RUN) {
              await fs.mkdir(codeFolderPath, { recursive: true });
            }
            createdFolders++;
            createdFoldersSet.add(folderKey);
          }
        }

        // Mover arquivo para a pasta de código
        const destPath = path.join(codeFolderPath, entry.name);

        if (fsSync.existsSync(destPath)) {
          // Se arquivo já existe, criar nome único
          const ext = path.extname(entry.name);
          const baseName = path.basename(entry.name, ext);
          let counter = 1;
          let newDestPath = destPath;

          while (fsSync.existsSync(newDestPath)) {
            const newName = `${baseName}_${counter}${ext}`;
            newDestPath = path.join(codeFolderPath, newName);
            counter++;
          }

          if (!DRY_RUN) {
            await fs.rename(fullPath, newDestPath);
          }
          moved++;
          console.log(
            `      ⚠️ Conflito: ${entry.name} → ${path.basename(newDestPath)}`
          );
        } else {
          if (!DRY_RUN) {
            await fs.rename(fullPath, destPath);
          }
          moved++;
        }
      }
    }
  } catch (error) {
    console.error(
      `   ❌ Erro ao processar ${categoryPath}: ${(error as Error).message}`
    );
    errors++;
  }

  return { moved, errors, createdFolders };
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("📁 ORGANIZAÇÃO POR CÓDIGO DE PRODUTO");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${INPUT_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(INPUT_DIR)) {
    console.error(`❌ Diretório não encontrado: ${INPUT_DIR}`);
    process.exit(1);
  }

  try {
    // Encontrar todas as pastas de categoria
    const categoryFolders: string[] = [];
    const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && /^\[.+\]\[.+\]$/.test(entry.name)) {
        categoryFolders.push(path.join(INPUT_DIR, entry.name));
      }
    }

    console.log(`📂 Encontradas ${categoryFolders.length} pastas de categoria\n`);

    if (categoryFolders.length === 0) {
      console.log("⚠️ Nenhuma pasta de categoria encontrada!\n");
      return;
    }

    // Processar cada pasta de categoria
    console.log("🔄 Organizando imagens...\n");
    let totalMoved = 0;
    let totalErrors = 0;
    let totalCreatedFolders = 0;

    for (const categoryPath of categoryFolders) {
      const categoryName = path.basename(categoryPath);
      console.log(`   📁 Processando: ${categoryName}`);

      const result = await processCategoryFolder(categoryPath);
      totalMoved += result.moved;
      totalErrors += result.errors;
      totalCreatedFolders += result.createdFolders;

      console.log(
        `      ✅ Movidos: ${result.moved}, Pastas criadas: ${result.createdFolders}, Erros: ${result.errors}\n`
      );
    }

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ ORGANIZAÇÃO CONCLUÍDA");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Arquivos organizados: ${totalMoved}`);
    console.log(`   Pastas criadas: ${totalCreatedFolders}`);
    console.log(`   Erros: ${totalErrors}\n`);

    // Verificar se ainda há arquivos soltos
    const looseFiles = await findLooseFiles(INPUT_DIR);
    if (looseFiles.length > 0) {
      console.log(`   ⚠️ Ainda há ${looseFiles.length} arquivos soltos:`);
      looseFiles.slice(0, 10).forEach((file) => {
        console.log(`      - ${file}`);
      });
      if (looseFiles.length > 10) {
        console.log(`      ... e mais ${looseFiles.length - 10} arquivos`);
      }
      console.log();
    } else {
      console.log(`   ✅ Todas as imagens foram organizadas!\n`);
    }
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A ORGANIZAÇÃO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

/**
 * Encontra arquivos que ainda estão soltos (não em subpastas de código)
 */
async function findLooseFiles(rootDir: string): Promise<string[]> {
  const looseFiles: string[] = [];

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Se for pasta numérica (código), não escanear dentro
          if (/^\d+$/.test(entry.name)) {
            continue;
          }
          // Continuar escaneando outras pastas
          await scan(fullPath);
        } else if (entry.isFile()) {
          // Verificar se é imagem
          const ext = path.extname(entry.name).toLowerCase();
          if (![".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".JPG"].includes(ext)) {
            return;
          }

          // Verificar se está diretamente em uma pasta de categoria
          const parentDir = path.dirname(fullPath);
          const parentName = path.basename(parentDir);

          // Se o pai é uma pasta de categoria (formato [categoria][subcategoria])
          if (/^\[.+\]\[.+\]$/.test(parentName)) {
            looseFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Ignorar erros
    }
  }

  await scan(rootDir);
  return looseFiles;
}

// Executar o script
main();



