import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para corrigir nomes de arquivos:
 * 1. Remove espaços dos nomes
 * 2. Adiciona traço após o código quando houver letras ou caracteres grudados
 *
 * Exemplos:
 *   "1287 branca.png" → "1287-branca.png"
 *   "1287 - AD - 1.png" → "1287-AD-1.png"
 *   "466pedra.jpg" → "466-pedra.jpg"
 *   "51P.jpg" → "51-P.jpg"
 */

const INPUT_DIR = "rename-images/input";
const DRY_RUN = false;

/**
 * Corrige o nome do arquivo
 */
function fixFileName(fileName: string): { newName: string; changed: boolean } {
  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(fileName, ext);

  let newName = nameWithoutExt;
  let changed = false;

  // 1. Remover espaços (substituir por traços)
  if (newName.includes(" ")) {
    newName = newName.replace(/\s+/g, "-");
    changed = true;
  }

  // 2. Adicionar traço após código quando houver letras/caracteres grudados
  // Padrão: número seguido imediatamente por letra (sem traço antes)
  // Exemplos: "466pedra" → "466-pedra", "51P" → "51-P", "1306P" → "1306-P"
  // Mas não alterar se já tem traço: "1287-AD-1" permanece assim
  const match = newName.match(/^(\d+)([A-Za-z])/);
  if (match) {
    const code = match[1];
    const rest = newName.substring(code.length);
    newName = `${code}-${rest}`;
    changed = true;
  }

  // Normalizar múltiplos traços consecutivos para um único traço
  if (newName.includes("--")) {
    newName = newName.replace(/-+/g, "-");
    changed = true;
  }

  // Remover traços no início ou fim
  if (newName.startsWith("-") || newName.endsWith("-")) {
    newName = newName.replace(/^-+|-+$/g, "");
    changed = true;
  }

  const finalName = changed ? `${newName}${ext}` : fileName;
  return { newName: finalName, changed };
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
          // Verificar se é imagem
          const ext = path.extname(entry.name).toLowerCase();
          if (![".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
            continue;
          }

          processed++;

          const { newName, changed } = fixFileName(entry.name);

          if (changed) {
            const newPath = path.join(currentPath, newName);

            // Verificar se já existe arquivo com o novo nome
            if (fsSync.existsSync(newPath)) {
              // Se já existe, criar nome único
              const ext = path.extname(newName);
              const baseName = path.basename(newName, ext);
              let counter = 1;
              let finalNewPath = newPath;

              while (fsSync.existsSync(finalNewPath)) {
                const uniqueName = `${baseName}_${counter}${ext}`;
                finalNewPath = path.join(currentPath, uniqueName);
                counter++;
              }

              try {
                if (!DRY_RUN) {
                  await fs.rename(fullPath, finalNewPath);
                }
                renamed++;
                console.log(`   🔄 ${entry.name} → ${path.basename(finalNewPath)} (conflito resolvido)`);
              } catch (error) {
                console.error(`   ❌ Erro ao renomear ${entry.name}: ${(error as Error).message}`);
                errors++;
              }
            } else {
              try {
                if (!DRY_RUN) {
                  await fs.rename(fullPath, newPath);
                }
                renamed++;
                console.log(`   🔄 ${entry.name} → ${newName}`);
              } catch (error) {
                console.error(`   ❌ Erro ao renomear ${entry.name}: ${(error as Error).message}`);
                errors++;
              }
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
  console.log("🔄 CORRIGINDO NOMES DE ARQUIVOS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${INPUT_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);
  console.log(`   Ações:`);
  console.log(`   - Remover espaços dos nomes`);
  console.log(`   - Adicionar traço após código quando houver letras grudadas\n`);

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
      console.log("✅ Todos os nomes de arquivos foram corrigidos!\n");
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

