import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {
  INPUT_DIR,
  OUTPUT_DIR,
  RECURSIVE_SEARCH,
  COUNTERS,
  COPY_FILES,
  DRY_RUN,
} from "../src/rename-config";
import {
  log,
  extractCode,
  identifyImageType,
  generateNewFileName,
  listImageFiles,
  moveFile,
  createReport,
  saveReport,
} from "../src/rename-utils";
import { updateCacheWithNewNames } from "../src/rename-processor";
import { analyzeImageType } from "../src/image-analyzer";
import { ProcessedImage, ImageType } from "../src/types";

/**
 * Função principal para processar e renomear imagens
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔄 RENOMEANDO E ORGANIZANDO IMAGENS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório de entrada: ${INPUT_DIR}`);
  console.log(`   - Diretório de saída: ${OUTPUT_DIR}`);
  console.log(`   - Busca recursiva: ${RECURSIVE_SEARCH ? "Sim" : "Não"}`);
  console.log(`   - Modo de simulação: ${DRY_RUN ? "Sim" : "Não"}`);
  console.log(`   - Atualizar cache: ${!DRY_RUN ? "Sim" : "Não"}`);
  console.log(`   - Análise visual com IA: Sim\n`);

  const processedFiles: ProcessedImage[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  try {
    // Verificar se o diretório de entrada existe
    if (!fsSync.existsSync(INPUT_DIR)) {
      throw new Error(`Diretório de entrada não encontrado: ${INPUT_DIR}`);
    }

    // Criar diretório de saída se não existir
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Listar todos os arquivos de imagem
    log("info", `Procurando imagens em ${INPUT_DIR}...`);
    const imageFiles = await listImageFiles(INPUT_DIR, RECURSIVE_SEARCH);

    if (imageFiles.length === 0) {
      log("warn", "Nenhuma imagem encontrada!");
      return;
    }

    log("info", `Encontradas ${imageFiles.length} imagens para processar\n`);

    // Processar cada imagem
    for (let i = 0; i < imageFiles.length; i++) {
      const imageInfo = imageFiles[i];
      log(
        "info",
        `[${i + 1}/${imageFiles.length}] Processando: ${imageInfo.fileName}`
      );

      try {
        // Extrair código do nome do arquivo
        const code = extractCode(imageInfo.fileName);

        if (!code) {
          const error = `Não foi possível extrair código do arquivo: ${imageInfo.fileName}`;
          log("error", error);
          errors.push({ file: imageInfo.fileName, error });
          processedFiles.push({ ...imageInfo, success: false, error });
          continue;
        }

        log("debug", `   Código extraído: ${code}`);

        // Identificar tipo de imagem usando IA
        let imageType: ImageType;
        try {
          log("debug", `   🔍 Analisando visualmente com IA...`);
          const aiAnalysis = await analyzeImageType(
            imageInfo.filePath,
            imageInfo.fileName
          );
          imageType =
            aiAnalysis.type === "VARIANT" ? aiAnalysis : aiAnalysis.type;
          log(
            "debug",
            `   Tipo identificado pela IA: ${JSON.stringify(
              imageType
            )} (confiança: ${(aiAnalysis.confidence * 100).toFixed(0)}%)`
          );
          log("debug", `   Justificativa: ${aiAnalysis.reasoning}`);
        } catch (error) {
          log(
            "warn",
            `   ⚠️ Erro na análise IA, usando fallback: ${
              (error as Error).message
            }`
          );
          imageType = identifyImageType(imageInfo.fileName, imageInfo.filePath);
          log(
            "debug",
            `   Tipo identificado (fallback): ${JSON.stringify(imageType)}`
          );
        }

        // Gerar novo nome do arquivo
        const newFileName = generateNewFileName(
          imageInfo.fileName,
          imageInfo.filePath,
          code,
          imageType,
          COUNTERS
        );

        log("debug", `   Novo nome: ${newFileName}`);

        // Criar caminho de destino
        const destFolder = path.join(OUTPUT_DIR, code);
        const destPath = path.join(destFolder, newFileName);

        // Mover/copiar arquivo
        await moveFile(imageInfo.filePath, destPath, COPY_FILES);

        processedFiles.push({
          ...imageInfo,
          success: true,
          code,
          imageType,
          newFileName,
          destinationPath: destPath,
        });
      } catch (error) {
        const errorMsg = `Erro ao processar ${imageInfo.fileName}: ${
          (error as Error).message
        }`;
        log("error", errorMsg);
        errors.push({ file: imageInfo.fileName, error: errorMsg });
        processedFiles.push({ ...imageInfo, success: false, error: errorMsg });
      }
    }

    // Criar e salvar relatório
    const report = createReport(processedFiles, errors);
    await saveReport(report, path.join(OUTPUT_DIR, "rename-reporton"));

    // Atualizar cache com novos nomes (se não for modo de simulação)
    if (!DRY_RUN && processedFiles.some((f) => f.success)) {
      const cacheResult = await updateCacheWithNewNames(processedFiles);
      report.cacheUpdate = cacheResult;

      // Atualizar relatório com informações do cache
      await saveReport(report, path.join(OUTPUT_DIR, "rename-reporton"));
    }

    // Exibir resumo final
    console.log("\n═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO!");
    console.log("═══════════════════════════════════════════");
    console.log(`\n📊 Estatísticas:`);
    console.log(`   ✅ Processados com sucesso: ${report.summary.success}`);
    console.log(`   ❌ Falhas: ${report.summary.failed}`);
    console.log(
      `   📁 Pastas criadas: ${
        new Set(processedFiles.filter((f) => f.success).map((f) => f.code)).size
      }`
    );
    console.log(`\n📂 Diretórios:`);
    console.log(`   📥 Entrada: ${INPUT_DIR}`);
    console.log(`   📤 Saída: ${OUTPUT_DIR}`);
    console.log(
      `\n📄 Relatório detalhado: ${path.join(OUTPUT_DIR, "rename-reporton")}`
    );

    if (errors.length > 0) {
      console.log(`\n⚠️ Erros encontrados:`);
      errors.slice(0, 5).forEach((err) => {
        console.log(`   - ${err.file}: ${err.error}`);
      });
      if (errors.length > 5) {
        console.log(
          `   ... e mais ${errors.length - 5} erros (veja o relatório completo)`
        );
      }
    }
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O PROCESSAMENTO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);

    if ((error as any).code === "ENOENT") {
      console.error(
        "💡 Verifique se o diretório de entrada existe e contém imagens."
      );
    }

    process.exit(1);
  }
}

// Executar o script
main();
