import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

// Configurações
const INPUT_DIR = "rename-images/images";
const OUTPUT_DIR = "rename-images/organized";
const COPY_FILES = false; // true para copiar, false para mover
const DRY_RUN = false; // true para simular sem fazer alterações

// Contadores para AD (Additional)
const adCounters: Record<string, number> = {};

/**
 * Função de log personalizada
 */
function log(level: "info" | "warn" | "error", message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const prefix =
    {
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
    }[level] || "ℹ️";

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

/**
 * Extrai o código numérico do início do nome do arquivo (até 4 dígitos)
 */
function extractCode(fileName: string): string | null {
  // Remover espaços em branco no início
  const cleanFileName = fileName.trim();

  // Procurar por código de até 4 dígitos no início
  const match = cleanFileName.match(/^(\d{1,4})/);
  return match ? match[1] : null;
}

/**
 * Verifica se já existe arquivo principal na pasta de destino
 */
async function hasMainImage(
  destFolder: string,
  code: string
): Promise<boolean> {
  try {
    if (!fsSync.existsSync(destFolder)) {
      return false;
    }

    const files = await fs.readdir(destFolder);

    // Verificar se existe arquivo principal (apenas o código ou código - P)
    return files.some((file) => {
      const baseName = path.parse(file).name;
      return baseName === code || baseName === `${code} - P`;
    });
  } catch (error) {
    log(
      "error",
      `Erro ao verificar pasta de destino: ${(error as Error).message}`
    );
    return false;
  }
}

/**
 * Gera o próximo número AD para um código
 */
function getNextAdNumber(code: string): number {
  if (!adCounters[code]) {
    adCounters[code] = 1;
  } else {
    adCounters[code]++;
  }
  return adCounters[code];
}

/**
 * Move ou copia um arquivo
 */
async function moveFile(
  src: string,
  dest: string,
  copy: boolean = COPY_FILES
): Promise<void> {
  try {
    // Garantir que o diretório de destino exista
    const destDir = path.dirname(dest);
    await fs.mkdir(destDir, { recursive: true });

    if (DRY_RUN) {
      log(
        "info",
        `[DRY RUN] ${copy ? "Copiaria" : "Moveria"}: ${path.basename(
          src
        )} → ${dest}`
      );
      return;
    }

    if (copy) {
      await fs.copyFile(src, dest);
      log("info", `Copiado: ${path.basename(src)} → ${dest}`);
    } else {
      await fs.rename(src, dest);
      log("info", `Movido: ${path.basename(src)} → ${dest}`);
    }
  } catch (error) {
    log(
      "error",
      `Erro ao ${copy ? "copiar" : "mover"} arquivo: ${
        (error as Error).message
      }`
    );
    throw error;
  }
}

/**
 * Lista arquivos de imagem em uma pasta
 */
async function listImageFiles(dirPath: string): Promise<string[]> {
  const imageFiles: string[] = [];

  async function scanDirectory(currentPath: string): Promise<void> {
    try {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          await scanDirectory(itemPath);
        } else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (
            [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)
          ) {
            imageFiles.push(itemPath);
          }
        }
      }
    } catch (error) {
      log(
        "error",
        `Erro ao ler pasta ${currentPath}: ${(error as Error).message}`
      );
    }
  }

  await scanDirectory(dirPath);
  return imageFiles;
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 MOVIMENTANDO IMAGENS (SIMPLES - SEM IA)");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório de entrada: ${INPUT_DIR}`);
  console.log(`   - Diretório de saída: ${OUTPUT_DIR}`);
  console.log(`   - Modo de simulação: ${DRY_RUN ? "Sim" : "Não"}`);
  console.log(`   - Copiar arquivos: ${COPY_FILES ? "Sim" : "Não"}\n`);

  try {
    // Verificar se o diretório de entrada existe
    if (!fsSync.existsSync(INPUT_DIR)) {
      throw new Error(`Diretório de entrada não encontrado: ${INPUT_DIR}`);
    }

    // Criar diretório de saída se não existir
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Listar todos os arquivos de imagem
    log("info", `Procurando imagens em ${INPUT_DIR}...`);
    const imageFiles = await listImageFiles(INPUT_DIR);

    if (imageFiles.length === 0) {
      log("warn", "Nenhuma imagem encontrada!");
      return;
    }

    log("info", `Encontradas ${imageFiles.length} imagens para processar\n`);

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Processar cada imagem
    for (let i = 0; i < imageFiles.length; i++) {
      const imagePath = imageFiles[i];
      const fileName = path.basename(imagePath);
      const relativePath = path.relative(INPUT_DIR, imagePath);

      log("info", `[${i + 1}/${imageFiles.length}] Processando: ${fileName}`);

      try {
        // Extrair código do nome do arquivo
        const code = extractCode(fileName);

        if (!code) {
          log(
            "warn",
            `   ⚠️ Não foi possível extrair código do arquivo: ${fileName}`
          );
          skippedCount++;
          continue;
        }

        log("info", `   Código extraído: ${code}`);

        // Determinar pasta mãe (ex: ANEIS - Ouro)
        const motherFolder = path.dirname(relativePath);

        // Criar caminho de destino
        let destFolder: string;
        if (motherFolder && motherFolder !== ".") {
          destFolder = path.join(OUTPUT_DIR, motherFolder, code);
        } else {
          destFolder = path.join(OUTPUT_DIR, code);
        }

        // Verificar se já existe imagem principal na pasta
        const hasMain = await hasMainImage(destFolder, code);

        // Gerar nome do arquivo de destino
        const ext = path.extname(fileName);
        let destFileName: string;

        if (hasMain) {
          // Se já existe imagem principal, usar nomenclatura AD
          const adNumber = getNextAdNumber(code);
          destFileName = `${code} - AD - ${adNumber}${ext}`;
          log("info", `   📸 Usando nomenclatura AD: ${destFileName}`);
        } else {
          // Se não existe imagem principal, usar o nome original
          destFileName = fileName;
          log("info", `   📸 Usando nome original: ${destFileName}`);
        }

        const destPath = path.join(destFolder, destFileName);

        // Verificar se o arquivo de destino já existe
        try {
          await fs.access(destPath);
          log(
            "warn",
            `   ⚠️ Arquivo de destino já existe, pulando: ${destFileName}`
          );
          skippedCount++;
          continue;
        } catch {
          // Arquivo não existe, podemos prosseguir
        }

        // Mover/copiar arquivo
        await moveFile(imagePath, destPath, COPY_FILES);
        processedCount++;
      } catch (error) {
        const errorMsg = `Erro ao processar ${fileName}: ${
          (error as Error).message
        }`;
        log("error", errorMsg);
        errorCount++;
      }
    }

    // Exibir resumo final
    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO!");
    console.log("═══════════════════════════════════════════");
    console.log(`\n📊 Estatísticas:`);
    console.log(`   ✅ Processados com sucesso: ${processedCount}`);
    console.log(`   ⏭️ Pulados: ${skippedCount}`);
    console.log(`   ❌ Falhas: ${errorCount}`);
    console.log(`   📁 Códigos com AD: ${Object.keys(adCounters).length}`);

    if (Object.keys(adCounters).length > 0) {
      console.log(`\n📋 Arquivos AD criados:`);
      for (const [code, count] of Object.entries(adCounters)) {
        console.log(`   - ${code}: ${count} arquivo(s)`);
      }
    }

    console.log(`\n📂 Diretórios:`);
    console.log(`   📥 Entrada: ${INPUT_DIR}`);
    console.log(`   📤 Saída: ${OUTPUT_DIR}`);
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
