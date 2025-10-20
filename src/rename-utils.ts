import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { PATTERNS, COPY_FILES, DRY_RUN, LOG_LEVEL } from "./rename-config";
import {
  ImageInfo,
  ProcessedImage,
  ImageType,
  Counters,
  ReportData,
} from "./types";

/**
 * Função de log personalizada
 */
export function log(
  level: "debug" | "info" | "warn" | "error",
  message: string
): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[level] || 1;
  const configLevel = levels[LOG_LEVEL] || 1;

  if (currentLevel >= configLevel) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix =
      {
        debug: "🔍",
        info: "ℹ️",
        warn: "⚠️",
        error: "❌",
      }[level] || "ℹ️";

    console.log(`[${timestamp}] ${prefix} ${message}`);
  }
}

/**
 * Extrai o código numérico do nome do arquivo
 */
export function extractCode(fileName: string): string | null {
  const match = fileName.match(PATTERNS.CODE_EXTRACT);
  return match ? match[1] : null;
}

/**
 * Identifica o tipo de imagem com base no nome do arquivo
 */
export function identifyImageType(
  fileName: string,
  filePath: string
): ImageType {
  const lowerFileName = fileName.toLowerCase();
  const lowerFilePath = filePath.toLowerCase();

  // Verificar se é produto na pedra
  if (
    PATTERNS.PRODUCT_ON_STONE.test(lowerFileName) ||
    PATTERNS.PRODUCT_ON_STONE.test(lowerFilePath)
  ) {
    return "PRODUCT_ON_STONE";
  }

  // Verificar se é cópia/adicional
  if (
    PATTERNS.ADDITIONAL_PHOTO.test(lowerFileName) ||
    PATTERNS.ADDITIONAL_PHOTO.test(lowerFilePath)
  ) {
    return "ADDITIONAL_PHOTO";
  }

  // Verificar se é variante de cor
  for (const [key, value] of Object.entries(PATTERNS.COLOR_VARIANTS)) {
    if (lowerFileName.includes(key) || lowerFilePath.includes(key)) {
      return {
        type: "VARIANT",
        variantType: "cor",
        variantOption: value,
        confidence: 0.8,
        reasoning: "Identificado pelo nome do arquivo",
      };
    }
  }

  // Se não for nenhum dos acima, é imagem principal
  return "MAIN_IMAGE";
}

/**
 * Gera o novo nome do arquivo conforme o padrão especificado
 */
export function generateNewFileName(
  fileName: string,
  filePath: string,
  code: string,
  imageType: ImageType,
  counters: Counters
): string {
  const ext = path.extname(fileName);

  switch (imageType) {
    case "MAIN_IMAGE":
      return `${code}${ext}`;

    case "PRODUCT_ON_STONE":
      return `${code} - P${ext}`;

    case "ADDITIONAL_PHOTO":
      // Inicializar contador para este código se não existir
      if (!counters.additional[code]) {
        counters.additional[code] = 1;
      }
      const additionalNumber = counters.additional[code]++;
      return `${code} - AD - ${additionalNumber}${ext}`;

    default:
      // Verificar se é um objeto de variante
      if (typeof imageType === "object" && imageType.type === "VARIANT") {
        return `${code} - V - ${imageType.variantType} - ${imageType.variantOption}${ext}`;
      }
      return `${code}${ext}`;
  }
}

/**
 * Lista arquivos de imagem em uma pasta (recursivo ou não)
 */
export async function listImageFiles(
  dirPath: string,
  recursive: boolean = true
): Promise<ImageInfo[]> {
  try {
    const imageFiles: ImageInfo[] = [];

    async function scanDirectory(currentPath: string): Promise<void> {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory() && recursive) {
          await scanDirectory(itemPath);
        } else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (
            [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)
          ) {
            imageFiles.push({
              fileName: item,
              filePath: itemPath,
              relativePath: path.relative(dirPath, itemPath),
            });
          }
        }
      }
    }

    await scanDirectory(dirPath);
    return imageFiles;
  } catch (error) {
    log("error", `Erro ao ler pasta ${dirPath}: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Move ou copia um arquivo de forma assíncrona
 */
export async function moveFile(
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
 * Cria um relatório das operações realizadas
 */
export function createReport(
  processedFiles: ProcessedImage[],
  errors: Array<{ file: string; error: string }>
): ReportData {
  const report: ReportData = {
    timestamp: new Date().toISOString(),
    summary: {
      total: processedFiles.length,
      success: processedFiles.filter((f) => f.success).length,
      failed: processedFiles.filter((f) => !f.success).length,
      errors: errors.length,
    },
    processedFiles,
    errors,
  };

  return report;
}

/**
 * Salva o relatório em um arquivo JSON
 */
export async function saveReport(
  report: ReportData,
  outputPath: string = "rename-reporton"
): Promise<void> {
  try {
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    log("info", `Relatório salvo em: ${outputPath}`);
  } catch (error) {
    log("error", `Erro ao salvar relatório: ${(error as Error).message}`);
  }
}
