import {
  PATH_BRANCO,
  PATH_MODELO,
  MIN_SIMILARITY,
  TOP_N,
  MAX_IMAGE_SIZE,
  MAX_CONCURRENT_REQUESTS,
  REQUEST_DELAY,
  CACHE_DB,
  COPY_FILES,
  RECURSIVE_SEARCH,
  KEEP_ORIGINAL_NAMES,
  MOTHER_FOLDER,
} from "../src/config.js";
import { initDatabase, EmbeddingCache } from "../src/cache.js";
import {
  processImages,
  compareAndGroup,
  prepareOutputFolders,
  displayFinalSummary,
} from "../src/processor.js";
import { Database } from "sqlite3";

/**
 * Função principal
 */
async function main(): Promise<void> {
  let db: Database | null = null;
  let cache: EmbeddingCache | null = null;

  try {
    console.log(
      "🚀 Iniciando processamento de joias (PARALELO COM CACHE)...\n"
    );
    console.log(`⚙️  Configurações:`);
    console.log(
      `   - Similaridade mínima: ${(MIN_SIMILARITY * 100).toFixed(0)}%`
    );
    console.log(`   - Top matches por imagem: ${TOP_N}`);
    console.log(`   - Tamanho máximo de imagem: ${MAX_IMAGE_SIZE}px`);
    console.log(`   - Requisições simultâneas: ${MAX_CONCURRENT_REQUESTS}`);
    console.log(`   - Delay entre requisições: ${REQUEST_DELAY}ms`);
    console.log(`   - Cache SQLite: ${CACHE_DB}`);
    console.log(`   - Copiar arquivos: ${COPY_FILES ? "Sim" : "Não (mover)"}`);
    console.log(`   - Busca recursiva: ${RECURSIVE_SEARCH ? "Sim" : "Não"}`);
    console.log(
      `   - Manter nomes originais: ${KEEP_ORIGINAL_NAMES ? "Sim" : "Não"}`
    );
    console.log(`   - Pasta mãe: ${MOTHER_FOLDER}\n`);

    // Inicializar banco de dados e cache
    console.log("═══════════════════════════════════════════");
    console.log("💾 INICIALIZANDO CACHE");
    console.log("═══════════════════════════════════════════\n");

    db = await initDatabase();
    cache = new EmbeddingCache(db);

    // Opcional: limpar cache antigo
    // await cache.clearOld(30);

    // Preparar pastas de saída
    await prepareOutputFolders();

    // 1. Gerar embeddings para imagens em fundo branco (processamento paralelo com cache)
    const embBranco = await processImages(
      PATH_BRANCO,
      cache,
      "em fundo branco"
    );

    // 2. Gerar embeddings para imagens com modelo (processamento paralelo)
    const embModelo = await processImages(PATH_MODELO, cache, "com modelo");

    // 3. Comparar e agrupar (processamento paralelo com controle de concorrência)
    const results = await compareAndGroup(embBranco, embModelo);

    // 4. Exibir resumo final
    displayFinalSummary(
      results.successfulMatches,
      results.notFoundCount,
      results.unpairedModelo
    );
  } catch (error: any) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE O PROCESSAMENTO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${error.message}\n`);

    if (error.code === "ENOENT") {
      console.error(
        "💡 Verifique se as pastas de entrada existem e contêm imagens."
      );
    }

    process.exit(1);
  } finally {
    // Fechar conexão com o banco de dados
    if (cache) {
      cache.close();
    }
  }
}

// Executar o script
main();
