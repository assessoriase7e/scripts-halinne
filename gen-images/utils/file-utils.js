// file-utils.js
// Utilitários para manipulação de arquivos

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { config } from "./config.js";

// Calcula hash MD5 de um arquivo
export function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return createHash("md5").update(fileBuffer).digest("hex");
}

// Calcula o caminho de saída esperado
export function getExpectedOutputPath(fileInfo, suffix) {
  const { relativePath, fileName } = fileInfo;
  const baseName = path.parse(fileName).name;
  const suffixPart = suffix
    ? suffix.startsWith("-")
      ? ` - ${suffix.slice(1)}`
      : ` - ${suffix}`
    : "";

  const relativeDir = path.dirname(relativePath);
  const outputSubDir =
    relativeDir !== "." ? path.join(config.outputDir, relativeDir) : config.outputDir;

  // Tenta diferentes extensões possíveis
  const extensions = [".png", ".jpg", ".jpeg"];
  for (const ext of extensions) {
    const outputName = `${baseName}${suffixPart}${ext}`;
    const outputPath = path.join(outputSubDir, outputName);
    if (fs.existsSync(outputPath)) {
      return outputPath;
    }
  }

  // Se não encontrou, retorna o caminho esperado com extensão padrão
  const outputName = `${baseName}${suffixPart}.jpg`;
  return path.join(outputSubDir, outputName);
}

// Valida se um arquivo é uma imagem válida
export function isValidImageFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg"].includes(ext)) {
      return false;
    }

    // Verifica assinatura de arquivo (magic bytes)
    const buffer = fs.readFileSync(filePath);
    const firstBytes = buffer.slice(0, 4);

    // PNG: 89 50 4E 47
    const isPNG =
      firstBytes[0] === 0x89 &&
      firstBytes[1] === 0x50 &&
      firstBytes[2] === 0x4e &&
      firstBytes[3] === 0x47;

    // JPEG: FF D8
    const isJPEG = firstBytes[0] === 0xff && firstBytes[1] === 0xd8;

    return isPNG || isJPEG;
  } catch (error) {
    return false;
  }
}

// Encontra todas as imagens recursivamente
export function getAllImageFiles(dir, baseDir = dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAllImageFiles(filePath, baseDir, fileList);
    } else if (/\.(png|jpg|jpeg)$/i.test(file)) {
      const relativePath = path.relative(baseDir, filePath);
      const nameWithoutExt = path.parse(file).name.toLowerCase();

      // Ignora imagens estáticas apenas se estiverem na raiz de input
      if (
        path.dirname(relativePath) === "." &&
        config.staticImageNames.includes(nameWithoutExt)
      ) {
        continue;
      }

      // Valida se é uma imagem válida
      if (isValidImageFile(filePath)) {
        fileList.push({
          relativePath: relativePath,
          fullPath: filePath,
          fileName: file,
        });
      }
    }
  }

  return fileList;
}

// Filtra arquivos que não são imagens estáticas
export function filterNonStaticFiles(files) {
  return files.filter((file) => {
    const nameWithoutExt = path.parse(file).name.toLowerCase();
    return !config.staticImageNames.includes(nameWithoutExt);
  });
}


