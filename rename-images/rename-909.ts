import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para renomear arquivos na pasta 909 conforme regras específicas:
 * - codigo-1_1.ext → codigo.ext
 * - codigo_1.ext → codigo-AD1.ext (e continuar contagem se houver mais)
 */

const TARGET_DIR = "rename-images/input/[brincos][brincos-ouro]/909";
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

  // Padrão 2: codigo_1.ext → codigo-AD1.ext
  const pattern2 = /^(\d+)_1$/;
  const match2 = nameWithoutExt.match(pattern2);
  if (match2) {
    return {
      needsRename: true,
      newName: `${match2[1]}-AD1${ext}`,
      pattern: "codigo_1 → codigo-AD1",
    };
  }

  // Padrão 3: codigo_2.ext → codigo-AD2.ext (e assim por diante)
  const pattern3 = /^(\d+)_(\d+)$/;
  const match3 = nameWithoutExt.match(pattern3);
  if (match3 && parseInt(match3[2]) > 1) {
    const adNumber = match3[2];
    return {
      needsRename: true,
      newName: `${match3[1]}-AD${adNumber}${ext}`,
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
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 RENOMEANDO ARQUIVOS NA PASTA 909");
  console.log("═══════════════════════════════════════════\n");

  console.log(`📂 Diretório: ${TARGET_DIR}\n`);

  console.log("📋 Regras de renomeação:");
  console.log("   ✅ codigo-1_1.ext → codigo.ext");
  console.log("   ✅ codigo_1.ext → codigo-AD1.ext");
  console.log("   ✅ codigo_2.ext → codigo-AD2.ext (e assim por diante)\n");

  if (!fsSync.existsSync(TARGET_DIR)) {
    console.error(`❌ Diretório não encontrado: ${TARGET_DIR}`);
    process.exit(1);
  }

  try {
    // Listar todos os arquivos
    const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    console.log(`📁 Arquivos encontrados: ${files.length}\n`);

    if (files.length === 0) {
      console.log("⚠️ Nenhum arquivo encontrado!\n");
      return;
    }

    // Analisar cada arquivo
    const renames: Array<{
      oldName: string;
      newName: string;
      pattern: string;
    }> = [];

    for (const file of files) {
      const analysis = analyzeFileName(file);
      if (analysis.needsRename) {
        renames.push({
          oldName: file,
          newName: analysis.newName,
          pattern: analysis.pattern,
        });
      }
    }

    if (renames.length === 0) {
      console.log("✅ Nenhum arquivo precisa ser renomeado!\n");
      return;
    }

    console.log("═══════════════════════════════════════════");
    console.log("📋 ARQUIVOS A SEREM RENOMEADOS");
    console.log("═══════════════════════════════════════════\n");

    renames.forEach((rename, index) => {
      console.log(`   ${index + 1}. ${rename.oldName}`);
      console.log(`      → ${rename.newName} (${rename.pattern})\n`);
    });

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhum arquivo foi renomeado\n");
      return;
    }

    // Verificar conflitos e renomear
    console.log("🔄 Renomeando arquivos...\n");

    let renamed = 0;
    let errors = 0;
    const conflicts: string[] = [];

    for (const rename of renames) {
      const oldPath = path.join(TARGET_DIR, rename.oldName);
      let newPath = path.join(TARGET_DIR, rename.newName);

      // Verificar se já existe arquivo com o novo nome
      if (fsSync.existsSync(newPath)) {
        // Se já existe, criar nome único
        const ext = path.extname(rename.newName);
        const baseName = path.basename(rename.newName, ext);
        let counter = 1;
        let uniquePath = newPath;

        while (fsSync.existsSync(uniquePath)) {
          const uniqueName = `${baseName}_${counter}${ext}`;
          uniquePath = path.join(TARGET_DIR, uniqueName);
          counter++;
        }

        conflicts.push(`${rename.oldName} → ${path.basename(uniquePath)} (conflito)`);
        newPath = uniquePath;
      }

      try {
        await fs.rename(oldPath, newPath);
        renamed++;
        if (conflicts.length === 0 || conflicts[conflicts.length - 1] !== `${rename.oldName} → ${path.basename(newPath)} (conflito)`) {
          console.log(`   ✅ ${rename.oldName} → ${path.basename(newPath)}`);
        }
      } catch (error) {
        errors++;
        console.error(`   ❌ Erro ao renomear ${rename.oldName}: ${(error as Error).message}`);
      }
    }

    // Resumo final
    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Arquivos renomeados: ${renamed}`);
    console.log(`   Erros: ${errors}`);
    console.log(`   Total processado: ${renames.length}\n`);

    if (conflicts.length > 0) {
      console.log(`   ⚠️ Conflitos resolvidos (${conflicts.length}):`);
      conflicts.forEach((conflict) => {
        console.log(`      - ${conflict}`);
      });
      console.log();
    }

    // Listar arquivos finais
    const finalEntries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
    const finalFiles = finalEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    console.log(`📁 Arquivos finais na pasta (${finalFiles.length}):`);
    finalFiles.forEach((file) => {
      console.log(`   - ${file}`);
    });
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



