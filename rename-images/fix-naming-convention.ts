import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para corrigir convenção de nomes: adicionar traço entre código e sufixo
 * Exemplo: "123P" → "123-P"
 */

const ORGANIZED_DIR = "rename-images/organized";
const DRY_RUN = false;

/**
 * Corrige nome do arquivo adicionando traço entre código e sufixo
 */
function fixFileName(fileName: string): { newName: string; changed: boolean } {
  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(fileName, ext);

  // Regex para encontrar padrão: número seguido imediatamente por letra(s)
  // Ex: "123P", "456AB", "789G"
  const match = nameWithoutExt.match(/^(\d+)([A-Za-z]+.*)?$/);

  if (match) {
    const code = match[1];
    const suffix = match[2];

    if (suffix && suffix.length > 0 && !suffix.startsWith('-')) {
      // Adicionar traço entre código e sufixo
      const newName = `${code}-${suffix}${ext}`;
      return { newName, changed: true };
    }
  }

  return { newName: fileName, changed: false };
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

  async function scan(currentPath: string): Promise<{
    processed: number;
    renamed: number;
    errors: number;
  }> {
    let localProcessed = 0;
    let localRenamed = 0;
    let localErrors = 0;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          const subResult = await scan(fullPath);
          localProcessed += subResult.processed;
          localRenamed += subResult.renamed;
          localErrors += subResult.errors;
        } else if (entry.isFile()) {
          // Verificar se é imagem
          const ext = path.extname(entry.name).toLowerCase();
          if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
            localProcessed++;

            const { newName, changed } = fixFileName(entry.name);

            if (changed) {
              const newPath = path.join(currentPath, newName);

              // Verificar se já existe arquivo com o novo nome
              if (fsSync.existsSync(newPath)) {
                console.log(`   ⚠️ Conflito: ${entry.name} → ${newName} (arquivo já existe)`);
                localErrors++;
                continue;
              }

              if (!DRY_RUN) {
                await fs.rename(fullPath, newPath);
              }

              localRenamed++;
              console.log(`   🔄 Renomeado: ${entry.name} → ${newName}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Erro ao processar ${currentPath}: ${(error as Error).message}`);
      localErrors++;
    }

    return {
      processed: localProcessed,
      renamed: localRenamed,
      errors: localErrors,
    };
  }

  const result = await scan(dirPath);
  return result;
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔧 CORREÇÃO DE CONVENÇÃO DE NOMES");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${ORGANIZED_DIR}`);
  console.log(`   - Padrão: "123P" → "123-P"`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(ORGANIZED_DIR)) {
    console.error(`❌ Diretório não encontrado: ${ORGANIZED_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔄 Processando arquivos...\n");

    const result = await processDirectory(ORGANIZED_DIR);

    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Arquivos processados: ${result.processed}`);
    console.log(`   Arquivos renomeados: ${result.renamed}`);
    console.log(`   Erros: ${result.errors}\n`);

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhuma alteração foi feita\n");
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

