import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para renomear extensões de arquivos para minúsculas
 * Exemplo: arquivo.JPG -> arquivo.jpg, arquivo.PNG -> arquivo.png
 */

const INPUT_DIR = "rename-images/input";
const DRY_RUN = false;

/**
 * Verifica se a extensão precisa ser renomeada
 */
function needsRename(fileName: string): { needs: boolean; newName: string } {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);

  // Se a extensão tem letras maiúsculas, precisa renomear
  if (ext !== ext.toLowerCase()) {
    const newName = `${baseName}${ext.toLowerCase()}`;
    return { needs: true, newName };
  }

  return { needs: false, newName: fileName };
}

/**
 * Processa uma pasta recursivamente
 */
async function processDirectory(dirPath: string): Promise<{
  processed: number;
  renamed: number;
  errors: number;
}> {
  let processed = 0;
  let renamed = 0;
  let errors = 0;

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Continuar escaneando subpastas
          await scan(fullPath);
        } else if (entry.isFile()) {
          processed++;

          const { needs, newName } = needsRename(entry.name);

          if (needs) {
            let finalNewName = newName;
            let newPath = path.join(currentPath, finalNewName);

            // Se já existe arquivo com o novo nome, criar nome único
            if (fsSync.existsSync(newPath)) {
              const ext = path.extname(newName);
              const baseName = path.basename(newName, ext);
              let counter = 1;

              while (fsSync.existsSync(newPath)) {
                finalNewName = `${baseName}_${counter}${ext}`;
                newPath = path.join(currentPath, finalNewName);
                counter++;
              }

              console.log(`   ⚠️ Conflito: ${entry.name} → ${finalNewName} (nome único criado)`);
            }

            try {
              if (!DRY_RUN) {
                await fs.rename(fullPath, newPath);
              }
              renamed++;
              if (finalNewName === newName) {
                console.log(`   🔄 ${entry.name} → ${finalNewName}`);
              }
            } catch (error) {
              console.error(`   ❌ Erro ao renomear ${entry.name}: ${(error as Error).message}`);
              errors++;
            }
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Erro ao processar ${currentPath}: ${(error as Error).message}`);
      errors++;
    }
  }

  await scan(dirPath);
  return { processed, renamed, errors };
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 RENOMEANDO EXTENSÕES PARA MINÚSCULAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${INPUT_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(INPUT_DIR)) {
    console.error(`❌ Diretório não encontrado: ${INPUT_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔄 Processando arquivos...\n");

    const result = await processDirectory(INPUT_DIR);

    // Resumo final
    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Arquivos processados: ${result.processed}`);
    console.log(`   Arquivos renomeados: ${result.renamed}`);
    console.log(`   Erros: ${result.errors}\n`);

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhum arquivo foi renomeado\n");
    } else {
      console.log("✅ Todas as extensões foram convertidas para minúsculas!\n");
    }
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

