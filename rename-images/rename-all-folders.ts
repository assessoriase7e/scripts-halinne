import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para renomear arquivos em todas as pastas conforme regras específicas:
 * - codigo-1_1.ext → codigo.ext
 * - codigo_1.ext → codigo-AD1.ext (e continuar contagem se houver mais)
 */

const INPUT_DIR = "rename-images/input";
const DRY_RUN = false;

/**
 * Analisa o nome do arquivo e determina o novo nome
 */
function analyzeFileName(fileName: string): {
  needsRename: boolean;
  newName: string;
  pattern: string;
} {
  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(fileName, ext);

  // Padrão 1: codigo-1_1.ext → codigo.ext
  const pattern1 = /^(\d+)-1_1$/;
  const match1 = nameWithoutExt.match(pattern1);
  if (match1) {
    return {
      needsRename: true,
      newName: `${match1[1]}${ext}`,
      pattern: "codigo-1_1 → codigo",
    };
  }

  // Padrão 2: codigo-X_1.ext → codigo-ADX.ext (onde X é um número)
  // Exemplo: 896-2_1.jpg → 896-AD2.jpg
  const pattern2 = /^(\d+)-(\d+)_1$/;
  const match2 = nameWithoutExt.match(pattern2);
  if (match2) {
    const code = match2[1];
    const adNumber = match2[2];
    return {
      needsRename: true,
      newName: `${code}-AD${adNumber}${ext}`,
      pattern: `codigo-${adNumber}_1 → codigo-AD${adNumber}`,
    };
  }

  // Padrão 3: codigo_1.ext → codigo-AD1.ext
  const pattern3 = /^(\d+)_1$/;
  const match3 = nameWithoutExt.match(pattern3);
  if (match3) {
    return {
      needsRename: true,
      newName: `${match3[1]}-AD1${ext}`,
      pattern: "codigo_1 → codigo-AD1",
    };
  }

  // Padrão 4: codigo_2.ext → codigo-AD2.ext (e assim por diante)
  const pattern4 = /^(\d+)_(\d+)$/;
  const match4 = nameWithoutExt.match(pattern4);
  if (match4 && parseInt(match4[2]) > 1) {
    const adNumber = match4[2];
    return {
      needsRename: true,
      newName: `${match4[1]}-AD${adNumber}${ext}`,
      pattern: `codigo_${adNumber} → codigo-AD${adNumber}`,
    };
  }

  return {
    needsRename: false,
    newName: fileName,
    pattern: "sem alteração",
  };
}

/**
 * Processa uma pasta recursivamente
 */
async function processDirectory(dirPath: string): Promise<{
  processed: number;
  renamed: number;
  errors: number;
  renames: Array<{
    folder: string;
    oldName: string;
    newName: string;
    pattern: string;
  }>;
}> {
  let processed = 0;
  let renamed = 0;
  let errors = 0;
  const renames: Array<{
    folder: string;
    oldName: string;
    newName: string;
    pattern: string;
  }> = [];

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

          const analysis = analyzeFileName(entry.name);

          if (analysis.needsRename) {
            const relativeFolder = path.relative(INPUT_DIR, currentPath);
            renames.push({
              folder: relativeFolder,
              oldName: entry.name,
              newName: analysis.newName,
              pattern: analysis.pattern,
            });
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Erro ao processar ${currentPath}: ${(error as Error).message}`);
      errors++;
    }
  }

  await scan(dirPath);

  // Executar renomeações
  for (const rename of renames) {
    const folderPath = path.join(INPUT_DIR, rename.folder);
    const oldPath = path.join(folderPath, rename.oldName);
    let newPath = path.join(folderPath, rename.newName);

    // Verificar se já existe arquivo com o novo nome
    if (fsSync.existsSync(newPath)) {
      // Se já existe, criar nome único
      const ext = path.extname(rename.newName);
      const baseName = path.basename(rename.newName, ext);
      let counter = 1;
      let uniquePath = newPath;

      while (fsSync.existsSync(uniquePath)) {
        const uniqueName = `${baseName}_${counter}${ext}`;
        uniquePath = path.join(folderPath, uniqueName);
        counter++;
      }

      newPath = uniquePath;
    }

    try {
      if (!DRY_RUN) {
        await fs.rename(oldPath, newPath);
      }
      renamed++;
    } catch (error) {
      errors++;
      console.error(`   ❌ Erro ao renomear ${rename.folder}/${rename.oldName}: ${(error as Error).message}`);
    }
  }

  return { processed, renamed, errors, renames };
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 RENOMEANDO ARQUIVOS EM TODAS AS PASTAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`📂 Diretório: ${INPUT_DIR}\n`);

  console.log("📋 Regras de renomeação:");
  console.log("   ✅ codigo-1_1.ext → codigo.ext");
  console.log("   ✅ codigo-X_1.ext → codigo-ADX.ext (ex: 896-2_1.jpg → 896-AD2.jpg)");
  console.log("   ✅ codigo_1.ext → codigo-AD1.ext");
  console.log("   ✅ codigo_2.ext → codigo-AD2.ext (e assim por diante)\n");

  if (!fsSync.existsSync(INPUT_DIR)) {
    console.error(`❌ Diretório não encontrado: ${INPUT_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔍 Procurando arquivos para renomear...\n");

    const result = await processDirectory(INPUT_DIR);

    console.log("═══════════════════════════════════════════");
    console.log("📊 RESULTADO DA BUSCA");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Arquivos processados: ${result.processed}`);
    console.log(`   Arquivos a renomear: ${result.renames.length}\n`);

    if (result.renames.length === 0) {
      console.log("✅ Nenhum arquivo precisa ser renomeado!\n");
      return;
    }

    // Agrupar por pasta para exibir melhor
    const byFolder = new Map<string, Array<{
      oldName: string;
      newName: string;
      pattern: string;
    }>>();

    for (const rename of result.renames) {
      if (!byFolder.has(rename.folder)) {
        byFolder.set(rename.folder, []);
      }
      byFolder.get(rename.folder)!.push({
        oldName: rename.oldName,
        newName: rename.newName,
        pattern: rename.pattern,
      });
    }

    console.log("═══════════════════════════════════════════");
    console.log("📋 ARQUIVOS A SEREM RENOMEADOS");
    console.log("═══════════════════════════════════════════\n");

    // Mostrar até 20 exemplos
    const maxShow = 20;
    let shown = 0;
    for (const [folder, files] of byFolder) {
      for (const file of files) {
        if (shown < maxShow) {
          console.log(`   ${folder}/${file.oldName}`);
          console.log(`      → ${file.newName} (${file.pattern})\n`);
          shown++;
        }
      }
    }

    if (result.renames.length > maxShow) {
      console.log(`   ... e mais ${result.renames.length - maxShow} arquivos\n`);
    }

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhum arquivo foi renomeado\n");
      return;
    }

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Arquivos processados: ${result.processed}`);
    console.log(`   Arquivos renomeados: ${result.renamed}`);
    console.log(`   Erros: ${result.errors}`);
    console.log(`   Pastas afetadas: ${byFolder.size}\n`);

    // Estatísticas por padrão
    const byPattern = new Map<string, number>();
    for (const rename of result.renames) {
      byPattern.set(rename.pattern, (byPattern.get(rename.pattern) || 0) + 1);
    }

    console.log("📈 Estatísticas por padrão:");
    for (const [pattern, count] of byPattern) {
      console.log(`   ${pattern}: ${count} arquivos`);
    }
    console.log();

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

