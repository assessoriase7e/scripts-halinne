import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Obter __dirname em ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_DIR = path.join(__dirname, "images");
const ORGANIZED_DIR = path.join(__dirname, "organized");

/**
 * Extrai o código numérico do nome do arquivo
 */
function extractCode(fileName: string): string | null {
  // Remove extensão
  const nameWithoutExt = path.basename(fileName, path.extname(fileName));

  // Tenta encontrar código no início (ex: "1516.png" -> "1516")
  const match = nameWithoutExt.match(/^(\d+)/);
  if (match) {
    return match[1];
  }

  // Tenta encontrar código no formato "823-AD1" -> "823"
  const matchWithDash = nameWithoutExt.match(/^(\d+)-/);
  if (matchWithDash) {
    return matchWithDash[1];
  }

  return null;
}

/**
 * Verifica se é um arquivo de imagem
 */
function isImageFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext);
}

/**
 * Organiza arquivos de uma pasta de categoria
 */
async function organizeCategoryFolder(
  categoryPath: string,
  categoryName: string
): Promise<{ moved: number; errors: number }> {
  let moved = 0;
  let errors = 0;

  try {
    const items = await fs.readdir(categoryPath);

    // Primeiro, processar subpastas (se houver)
    for (const item of items) {
      const itemPath = path.join(categoryPath, item);
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        // Processar arquivos dentro da subpasta
        const subResult = await organizeCategoryFolder(itemPath, categoryName);
        moved += subResult.moved;
        errors += subResult.errors;
      }
    }

    // Depois, processar arquivos diretamente na pasta
    for (const file of items) {
      const filePath = path.join(categoryPath, file);
      const stats = await fs.stat(filePath);

      // Ignorar diretórios e arquivos que não são imagens
      if (!stats.isFile() || !isImageFile(file)) {
        continue;
      }

      // Extrair código do arquivo
      const code = extractCode(file);
      if (!code) {
        console.log(`   ⚠️ Não foi possível extrair código de: ${file}`);
        errors++;
        continue;
      }

      // Criar pasta de destino
      const destCategoryDir = path.join(ORGANIZED_DIR, categoryName);
      const destCodeDir = path.join(destCategoryDir, code);
      await fs.mkdir(destCodeDir, { recursive: true });

      // Mover arquivo
      const destFilePath = path.join(destCodeDir, file);

      // Se arquivo já existe, adicionar sufixo
      if (fsSync.existsSync(destFilePath)) {
        const ext = path.extname(file);
        const base = path.basename(file, ext);
        let counter = 1;
        let newDestFile = path.join(destCodeDir, `${base}_${counter}${ext}`);
        while (fsSync.existsSync(newDestFile)) {
          counter++;
          newDestFile = path.join(destCodeDir, `${base}_${counter}${ext}`);
        }
        await fs.rename(filePath, newDestFile);
        console.log(`      ${file} → ${path.basename(newDestFile)} (duplicado)`);
      } else {
        await fs.rename(filePath, destFilePath);
        console.log(`      ${file} → ${code}/${file}`);
      }

      moved++;
    }
  } catch (error) {
    console.error(`   ❌ Erro ao processar ${categoryName}: ${(error as Error).message}`);
    errors++;
  }

  return { moved, errors };
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 ORGANIZANDO ARQUIVOS POR CÓDIGO");
  console.log("═══════════════════════════════════════════\n");

  try {
    // Criar diretório organized se não existir
    await fs.mkdir(ORGANIZED_DIR, { recursive: true });

    // Processar todas as pastas em images/
    const sourceDirs: string[] = [];

    // Adicionar images/pedra e images/modelo
    const pedraDir = path.join(IMAGES_DIR, "pedra");
    const modeloDir = path.join(IMAGES_DIR, "modelo");
    if (fsSync.existsSync(pedraDir)) sourceDirs.push(pedraDir);
    if (fsSync.existsSync(modeloDir)) sourceDirs.push(modeloDir);

    // Adicionar todas as subpastas de images/transfer
    const transferDir = path.join(IMAGES_DIR, "transfer");
    if (fsSync.existsSync(transferDir)) {
      const transferSubdirs = await fs.readdir(transferDir);
      for (const subdir of transferSubdirs) {
        const subdirPath = path.join(transferDir, subdir);
        const stats = await fs.stat(subdirPath);
        if (stats.isDirectory()) {
          sourceDirs.push(subdirPath);
        }
      }
    }

    let totalMoved = 0;
    let totalErrors = 0;

    for (const sourceDir of sourceDirs) {
      if (!fsSync.existsSync(sourceDir)) {
        console.log(`⚠️ Diretório não encontrado: ${sourceDir}\n`);
        continue;
      }

      const dirName = path.basename(sourceDir);
      console.log(`📁 Processando: ${dirName}/`);

      const categories = await fs.readdir(sourceDir);

      for (const category of categories) {
        const categoryPath = path.join(sourceDir, category);
        const stats = await fs.stat(categoryPath);

        if (!stats.isDirectory()) continue;

        // Verificar se é uma categoria no formato [categoria][categoria-material]
        if (!/^\[.*\]\[.*\]$/.test(category)) {
          continue;
        }

        console.log(`   📂 ${category}`);

        const result = await organizeCategoryFolder(categoryPath, category);
        totalMoved += result.moved;
        totalErrors += result.errors;

        if (result.moved > 0) {
          console.log(`   ✅ ${result.moved} arquivo(s) movido(s)`);
        }
        if (result.errors > 0) {
          console.log(`   ⚠️ ${result.errors} erro(s)`);
        }
      }

      console.log();
    }

    console.log("═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO!");
    console.log("═══════════════════════════════════════════");
    console.log(`\n📊 Estatísticas:`);
    console.log(`   ✅ Arquivos movidos: ${totalMoved}`);
    console.log(`   ❌ Erros: ${totalErrors}`);
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

