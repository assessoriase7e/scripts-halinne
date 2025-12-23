import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Obter __dirname em ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeamento de categorias antigas para novas
const CATEGORY_MAP: Record<string, string> = {
  "ANEIS - Ouro": "[aneis][aneis-ouro]",
  "ANEIS - Prata _ Rodio": "[aneis][aneis-prata]",
  "BRINCO - Ouro": "[brincos][brincos-ouro]",
  "BRINCO - Prata_ Rodio": "[brincos][brincos-prata]",
  "COLAR - Ouro": "[colares][colares-ouro]",
  "CONJJUNTO colar e brinco OURO": "[conjuntos][conjuntos-ouro]",
  "CONJJUNTO colar e brinco PRATA": "[conjuntos][conjuntos-prata]",
  "PINGENTE - Ouro": "[pingentes][pingentes-ouro]",
  "PINGENTE - Prata _ Rodio": "[pingentes][pingentes-prata]",
  "PULSEIRA - Ouro": "[pulseiras][pulseiras-ouro]",
  "PULSEIRA - Prata_ Rodio": "[pulseiras][pulseiras-prata]",
  "TORNOZELEIRA - Ouro": "[tornozeleiras][tornozeleiras-ouro]",
  "TORNOZELEIRA - Prata _ Rodio": "[tornozeleiras][tornozeleiras-prata]",
};

const IMAGES_DIR = path.join(__dirname, "images");
const ORGANIZED_DIR = path.join(__dirname, "organized");

/**
 * Encontra todas as pastas com códigos em images/
 */
async function findCodedFolders(): Promise<
  Array<{ category: string; code: string; sourcePath: string }>
> {
  const folders: Array<{
    category: string;
    code: string;
    sourcePath: string;
  }> = [];

  // Buscar em images/transfer/prontas3/ (já renomeadas)
  const transferDir = path.join(IMAGES_DIR, "transfer", "prontas3");
  if (fsSync.existsSync(transferDir)) {
    const categories = await fs.readdir(transferDir);

    for (const category of categories) {
      const categoryPath = path.join(transferDir, category);
      const stats = await fs.stat(categoryPath);

      if (!stats.isDirectory()) continue;

      // Verificar se é uma categoria no formato [categoria][categoria-material]
      if (!/^\[.*\]\[.*\]$/.test(category)) {
        // Se não está no formato novo, tentar mapear
        if (CATEGORY_MAP[category]) {
          const mappedCategory = CATEGORY_MAP[category];
          const codeFolders = await fs.readdir(categoryPath);
          for (const codeFolder of codeFolders) {
            const codePath = path.join(categoryPath, codeFolder);
            const codeStats = await fs.stat(codePath);

            if (codeStats.isDirectory() && /^\d+$/.test(codeFolder)) {
              folders.push({
                category: mappedCategory,
                code: codeFolder,
                sourcePath: codePath,
              });
            }
          }
        }
      } else {
        // Já está no formato novo, usar diretamente
        const codeFolders = await fs.readdir(categoryPath);
        for (const codeFolder of codeFolders) {
          const codePath = path.join(categoryPath, codeFolder);
          const codeStats = await fs.stat(codePath);

          if (codeStats.isDirectory() && /^\d+$/.test(codeFolder)) {
            folders.push({
              category: category,
              code: codeFolder,
              sourcePath: codePath,
            });
          }
        }
      }
    }
  }

  return folders;
}

/**
 * Move uma pasta com código para organized/
 */
async function moveCodedFolder(
  category: string,
  code: string,
  sourcePath: string
): Promise<void> {
  const destCategoryDir = path.join(ORGANIZED_DIR, category);
  const destCodeDir = path.join(destCategoryDir, code);

  // Criar diretório de categoria se não existir
  await fs.mkdir(destCategoryDir, { recursive: true });

  // Se a pasta de destino já existe, mover conteúdo para dentro
  if (fsSync.existsSync(destCodeDir)) {
    console.log(
      `   ⚠️ Pasta ${code} já existe em ${category}, mesclando conteúdo...`
    );
    const files = await fs.readdir(sourcePath);
    for (const file of files) {
      const sourceFile = path.join(sourcePath, file);
      const destFile = path.join(destCodeDir, file);

      // Se arquivo de destino já existe, adicionar sufixo
      if (fsSync.existsSync(destFile)) {
        const ext = path.extname(file);
        const base = path.basename(file, ext);
        let counter = 1;
        let newDestFile = path.join(destCodeDir, `${base}_${counter}${ext}`);
        while (fsSync.existsSync(newDestFile)) {
          counter++;
          newDestFile = path.join(destCodeDir, `${base}_${counter}${ext}`);
        }
        await fs.rename(sourceFile, newDestFile);
        console.log(`      → ${file} → ${path.basename(newDestFile)}`);
      } else {
        await fs.rename(sourceFile, destFile);
        console.log(`      → ${file}`);
      }
    }
    // Remover pasta fonte vazia
    await fs.rmdir(sourcePath);
  } else {
    // Mover pasta inteira
    await fs.rename(sourcePath, destCodeDir);
    console.log(`   ✅ ${code} → ${category}/${code}`);
  }
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 MOVENDO PASTAS COM CÓDIGOS PARA ORGANIZED");
  console.log("═══════════════════════════════════════════\n");

  try {
    // Criar diretório organized se não existir
    await fs.mkdir(ORGANIZED_DIR, { recursive: true });

    // Encontrar todas as pastas com códigos
    console.log("🔍 Procurando pastas com códigos...");
    const folders = await findCodedFolders();

    if (folders.length === 0) {
      console.log("ℹ️ Nenhuma pasta com código encontrada.");
      return;
    }

    console.log(`✅ Encontradas ${folders.length} pastas com códigos\n`);

    // Agrupar por categoria para exibir estatísticas
    const byCategory: Record<string, number> = {};
    folders.forEach((f) => {
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    });

    console.log("📊 Distribuição por categoria:");
    Object.entries(byCategory)
      .sort()
      .forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count} pastas`);
      });
    console.log();

    // Mover cada pasta
    let moved = 0;
    let merged = 0;
    let errors = 0;

    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];

      console.log(
        `[${i + 1}/${folders.length}] ${folder.category}/${folder.code}`
      );

      try {
        const destPath = path.join(
          ORGANIZED_DIR,
          folder.category,
          folder.code
        );
        const alreadyExists = fsSync.existsSync(destPath);

        await moveCodedFolder(
          folder.category,
          folder.code,
          folder.sourcePath
        );

        if (alreadyExists) {
          merged++;
        } else {
          moved++;
        }
      } catch (error) {
        console.error(
          `   ❌ Erro: ${(error as Error).message}`
        );
        errors++;
      }
    }

    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO!");
    console.log("═══════════════════════════════════════════");
    console.log(`\n📊 Estatísticas:`);
    console.log(`   ✅ Pastas movidas: ${moved}`);
    console.log(`   🔀 Pastas mescladas: ${merged}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`   📁 Total processado: ${folders.length}`);
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O PROCESSAMENTO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar
main();

