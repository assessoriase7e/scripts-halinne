import sharp from "sharp";
import { MAX_IMAGE_SIZE } from "./shared-config";

/**
 * Redimensiona e otimiza a imagem agressivamente
 */
export async function optimizeImage(imagePath: string): Promise<string> {
  try {
    const buffer = await sharp(imagePath)
      .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 70,
        mozjpeg: true,
      })
      .toBuffer();

    const base64 = buffer.toString("base64");
    console.log(
      `    ℹ️  Imagem otimizada: ${(buffer.length / 1024).toFixed(2)} KB`
    );
    return base64;
  } catch (error) {
    console.error(
      `    ⚠️  Erro ao otimizar imagem: ${(error as Error).message}`
    );
    throw error;
  }
}

/**
 * Calcula a similaridade de cosseno entre dois vetores
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}
