// static-images.js
// Gerenciamento de imagens estáticas

import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { uploadToUploadThing } from "./api-client.js";

// Carrega imagens estáticas de um diretório específico
export async function loadStaticImagesFromDir(targetDir, isRoot = false) {
  const staticImages = [];

  for (const staticName of config.staticImageNames) {
    const extensions = [".png", ".jpg", ".jpeg"];
    let found = false;

    for (const ext of extensions) {
      const staticPath = path.join(targetDir, `${staticName}${ext}`);
      if (fs.existsSync(staticPath)) {
        try {
          const location = isRoot
            ? "raiz"
            : path.relative(config.inputDir, targetDir);
          logger.info(
            `Fazendo upload de ${staticName}${ext} (${location}) para UploadThing...`
          );
          const imageUrl = await uploadToUploadThing(staticPath);
          staticImages.push(imageUrl);
          logger.info(
            `Imagem estática carregada: ${staticName}${ext} (${location}) -> ${imageUrl}`
          );
          found = true;
          break;
        } catch (err) {
          logger.error(
            `Erro ao fazer upload da imagem estática ${staticName}${ext}: ${err.message}`
          );
        }
      }
    }
  }

  return staticImages;
}

// Carrega imagens estáticas globais (raiz)
export async function loadStaticImages() {
  return await loadStaticImagesFromDir(config.inputDir, true);
}
