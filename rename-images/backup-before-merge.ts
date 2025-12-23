import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para criar backup antes de fundir pastas
 */

const IMAGES_DIR = "rename-images/images";
const BACKUP_DIR = `rename-images/backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)}`;

async function copyFile(src: string, dest: string): Promise<void> {
  const destDir = path.dirname(dest);
  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("💾 CRIANDO BACKUP");
  console.log("═══════════════════════════════════════════\n");

  if (!fsSync.existsSync(IMAGES_DIR)) {
    console.error(`❌ Diretório não encontrado: ${IMAGES_DIR}`);
    process.exit(1);
  }

  try {
    console.log(`📂 Origem: ${IMAGES_DIR}`);
    console.log(`📦 Destino: ${BACKUP_DIR}\n`);

    console.log("🔄 Copiando arquivos...");
    const startTime = Date.now();

    await copyDirectory(IMAGES_DIR, BACKUP_DIR);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Contar arquivos copiados
    const countFiles = async (dir: string): Promise<number> => {
      let count = 0;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          count += await countFiles(fullPath);
        } else {
          count++;
        }
      }
      return count;
    };

    const fileCount = await countFiles(BACKUP_DIR);

    console.log("\n═══════════════════════════════════════════");
    console.log("✅ BACKUP CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Arquivos copiados: ${fileCount}`);
    console.log(`   Tempo decorrido: ${duration}s`);
    console.log(`   Localização: ${BACKUP_DIR}\n`);
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O BACKUP");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

main();



