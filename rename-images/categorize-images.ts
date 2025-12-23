import "dotenv/config";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import OpenAI from "openai";
import { optimizeImage } from "../src/imageProcessor.js";
import { apiLimiter } from "../src/concurrency.js";

/**
 * Script para categorizar imagens usando OpenAI Vision API
 * Identifica: imagem principal, -P (pedra), -M (modelo), AD<x>, V<x>-<nome>
 */

const INPUT_DIR = "rename-images/input";
const API_KEY = process.env.OPENAI_API_KEY || "";
const DRY_RUN = false; // true para simular sem renomear
const CACHE_FILE = "rename-images/categorization-cache.json";
const CLEAR_CACHE = process.argv.includes("--clear-cache");

const client = new OpenAI({ apiKey: API_KEY });

interface CategorizationCache {
  [folderPath: string]: {
    categorizations: CategorizationResult[];
    imagesHash: string; // hash dos nomes de arquivos para verificar se mudou
    timestamp: string;
  };
}

interface ImageFile {
  path: string;
  fileName: string;
  code: string;
}

interface CategorizationResult {
  fileName: string;
  category: "MAIN" | "PEDRA" | "MODELO" | "AD" | "VARIANT" | "VARIANT_AD";
  adNumber?: number; // Para AD<x> ou VARIANT_AD
  variantNumber?: number; // Para V<x>
  variantName?: string; // Para V<x>-<nome>
  confidence: number;
}

/**
 * Carrega cache de categorizações
 */
async function loadCache(): Promise<CategorizationCache> {
  if (CLEAR_CACHE) {
    console.log("🗑️  Cache limpo solicitado, ignorando cache existente\n");
    return {};
  }

  try {
    if (fsSync.existsSync(CACHE_FILE)) {
      const content = await fs.readFile(CACHE_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`⚠️ Erro ao carregar cache: ${(error as Error).message}`);
  }
  return {};
}

/**
 * Salva cache de categorizações
 */
async function saveCache(cache: CategorizationCache): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    console.error(`❌ Erro ao salvar cache: ${(error as Error).message}`);
  }
}

/**
 * Categoriza todas as imagens de uma pasta usando OpenAI
 */
async function categorizeImagesInFolder(
  folderPath: string,
  images: ImageFile[],
  cache: CategorizationCache
): Promise<CategorizationResult[]> {
  if (images.length === 0) return [];

  // Verificar cache
  const cacheKey = folderPath;
  const cached = cache[cacheKey];
  const imageNamesHash = images
    .map((img) => img.fileName)
    .sort()
    .join(",");

  if (cached && cached.imagesHash === imageNamesHash) {
    console.log(`   🎯 Usando cache (${images.length} imagens)`);
    return cached.categorizations;
  }

  console.log(`   🔍 Analisando ${images.length} imagem(ns) com IA...`);

  // Preparar imagens para análise
  const imageContents: Array<{
    type: "image_url";
    image_url: { url: string };
  }> = [];

  for (const img of images) {
    try {
      const base64Image = await optimizeImage(img.path);
      imageContents.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
        },
      });
    } catch (error) {
      console.error(
        `      ❌ Erro ao processar ${img.fileName}: ${
          (error as Error).message
        }`
      );
    }
  }

  if (imageContents.length === 0) {
    return [];
  }

  // Criar prompt com lista de arquivos
  const fileList = images
    .map((img, idx) => `${idx + 1}. ${img.fileName}`)
    .join("\n");

  const prompt = `Você é um especialista em categorização de imagens de joias para e-commerce.

Analise as ${images.length} imagens desta pasta e categorize cada uma conforme o tipo:

TIPOS DE IMAGEM:
1. MAIN - Imagem principal do produto em fundo BRANCO PURO (deve ter apenas o código, ex: 1234.png)
   - Apenas UMA imagem deve ser MAIN
   - FUNDO DEVE SER BRANCO PURO (#FFFFFF ou muito próximo) - SEM cores, texturas, padrões ou elementos decorativos
   - NÃO é MAIN se o fundo tiver: bege, creme, marrom, cinza, texturas, padrões, linhas, elementos decorativos, sombras coloridas
   - Produto isolado, fundo limpo e branco como em catálogos de e-commerce profissionais
   - Se houver qualquer cor, textura ou elemento visual no fundo além de branco puro, NÃO é MAIN

2. PEDRA - Imagem mostrando o produto sobre superfície de pedra/mármore/textura de pedra (deve ter sufixo -P, ex: 1234-P.png)
   - Produto posicionado sobre superfície de pedra, mármore, granito, ou textura de pedra
   - Produto sobre base de pedra decorativa, cerâmica com textura de pedra, ou superfície rochosa
   - Fundo ou suporte com aparência de pedra natural ou textura de pedra
   - Se o produto está sobre pedra/mármore/cerâmica com textura de pedra, é PEDRA, não AD
   - Exemplos: produto sobre mármore, granito, pedra decorativa, cerâmica com textura de pedra, superfície rochosa

3. MODELO - Imagem do produto sendo usado/modelado (deve ter sufixo -M, ex: 1234-M.png)
   - Produto sendo usado por modelo ou pessoa

4. VARIANT - Variação com nome específico (cor, material, etc) (deve ter sufixo V<x>-<NOME>, ex: 1234-V1-AMARELO.png)
   - Primeira foto de uma variação específica (cor diferente, material diferente, etc)
   - Identifique a cor/material da variação e use em MAIÚSCULAS sem espaços (ex: AMARELO, VERMELHO, PRETO, BRANCO, ROSA, OURO, PRATA)
   - Numere sequencialmente (V1, V2, V3...)

5. VARIANT_AD - Múltiplas fotos da mesma variação (deve ter sufixo V<x>-<NOME>-AD<x>, ex: 1234-V1-AMARELO-AD1.png)
   - Quando há mais de uma foto da mesma variação (mesma cor/material)
   - Use o mesmo número de variante e nome da primeira foto da variação
   - Numere as fotos adicionais sequencialmente (AD1, AD2, AD3...)

6. AD - Variação adicional do mesmo produto SEM variante específica (deve ter sufixo -AD<x>, ex: 1234-AD1.png)
   - Apenas se NÃO for uma variante com nome específico
   - Use apenas quando não conseguir identificar uma variação específica
   - NÃO é AD se a imagem mostra o produto sobre pedra/mármore/textura de pedra (isso é PEDRA)
   - NÃO é AD se a imagem mostra o produto sendo usado por modelo/pessoa (isso é MODELO)
   - AD é para fotos adicionais do mesmo produto sem características específicas (PEDRA, MODELO, VARIANT)

ARQUIVOS NA PASTA:
${fileList}

REGRAS CRÍTICAS:

1. ANÁLISE COMPLETA DE TODAS AS IMAGENS:
   - Analise TODAS as imagens da pasta juntas para entender o contexto completo
   - Compare o conteúdo visual de cada imagem com seu nome atual
   - Determine se o nome atual está CORRETO ou INCORRETO baseado no conteúdo visual
   - Se o nome estiver incorreto, corrija-o baseado no que você vê na imagem
   - Exemplo: Se um arquivo se chama "11-P.png" mas a imagem mostra fundo branco puro (MAIN), corrija para "11.png"
   - Exemplo: Se um arquivo se chama "11.png" mas a imagem mostra pedra/brilho destacado (PEDRA), corrija para "11-P.png"
   - Use o nome atual como REFERÊNCIA, mas a análise visual é a FONTE PRIMÁRIA DE VERDADE

2. REGRAS DE CATEGORIZAÇÃO:
   - Apenas UMA imagem deve ser MAIN (fundo BRANCO PURO, sem cores/texturas/elementos decorativos)
   - MAIN = FUNDO BRANCO PURO APENAS. Se houver bege, creme, textura, padrão, linha decorativa, ou qualquer cor no fundo, NÃO é MAIN
   - Se não houver nenhuma imagem com fundo branco puro, escolha a melhor imagem como MAIN mesmo assim, mas seja rigoroso: fundos bege/creme/texturizados NÃO são brancos
   - PEDRA = Produto sobre pedra/mármore/textura de pedra. Se a imagem mostra produto sobre superfície de pedra, cerâmica com textura de pedra, ou base de pedra decorativa, é PEDRA, NÃO AD
   - AD só deve ser usado para fotos adicionais sem características específicas (sem pedra, sem modelo, sem variante de cor)
   - Se uma variação tem múltiplas fotos da MESMA COR/MATERIAL, a primeira é VARIANT e as outras são VARIANT_AD
   - Para VARIANT, identifique a cor/material visível na imagem (AMARELO, VERMELHO, PRETO, BRANCO, ROSA, OURO, PRATA, ROSE, etc)
   - Para VARIANT_AD, use o mesmo variantNumber e variantName da primeira foto daquela variação específica
   - ATENÇÃO ESPECIAL: Imagens com fundo bege, creme, texturizado, ou com elementos decorativos devem ser classificadas como VARIANT (se houver variação de cor/material) ou AD (se não houver variação específica), NUNCA como MAIN

3. CONSERVAÇÃO DE NOMES:
   - Se o nome do arquivo já segue um padrão correto (ex: 1287-V1-ROSE.png, 1287-V1-PRETO-AD1.png), MANTENHA esse padrão
   - Seja CONSERVADOR: se o nome atual já está bem formatado, apenas confirme a categoria sem alterar o nome
   - Apenas corrija nomes que estão claramente errados ou fora do padrão
   - Se houver múltiplas fotos da mesma variante (mesma cor), identifique qual é a primeira (VARIANT) e quais são adicionais (VARIANT_AD)

Retorne um JSON object com chave "categorizations" contendo um array no formato:
{
  "categorizations": [
    {
      "fileName": "nome-do-arquivo.png",
      "category": "MAIN|PEDRA|MODELO|AD|VARIANT|VARIANT_AD",
      "adNumber": 1,  // apenas se category for "AD" ou "VARIANT_AD"
      "variantNumber": 1,  // apenas se category for "VARIANT" ou "VARIANT_AD"
      "variantName": "ROSE",  // apenas se category for "VARIANT" ou "VARIANT_AD" (em MAIÚSCULAS, sem espaços)
      "confidence": 0.95  // confiança de 0 a 1
    }
  ]
}`;

  return apiLimiter.execute(async () => {
    try {
      const messages: any[] = [
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageContents],
        },
      ];

      const response = await client.chat.completions.create({
        model: "gpt-5.1-2025-11-13",
        messages,
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Resposta da API não contém conteúdo");
      }

      // Tentar extrair JSON (pode estar em code block ou direto)
      let jsonString = content.trim();
      const codeBlockMatch = jsonString.match(
        /```(?:json)?\s*([\s\S]*?)\s*```/
      );
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1].trim();
      }

      // Tentar parsear como objeto com array dentro
      const parsed = JSON.parse(jsonString);

      // Pode retornar como objeto com chave "results" ou "categorizations" ou direto como array
      let results: any[] = [];
      if (Array.isArray(parsed)) {
        results = parsed;
      } else if (parsed.results && Array.isArray(parsed.results)) {
        results = parsed.results;
      } else if (
        parsed.categorizations &&
        Array.isArray(parsed.categorizations)
      ) {
        results = parsed.categorizations;
      } else {
        // Tentar encontrar qualquer array no objeto
        for (const key in parsed) {
          if (Array.isArray(parsed[key])) {
            results = parsed[key];
            break;
          }
        }
      }

      const categorizationResults = results as CategorizationResult[];

      // Atualizar cache com os resultados
      if (categorizationResults.length > 0) {
        cache[cacheKey] = {
          categorizations: categorizationResults,
          imagesHash: imageNamesHash,
          timestamp: new Date().toISOString(),
        };
      }

      return categorizationResults;
    } catch (error: any) {
      console.error(`      ❌ Erro na API: ${error.message}`);
      if (error.response) {
        console.error(`      📄 Detalhes:`, error.response.data);
      }
      return [];
    }
  });
}

/**
 * Verifica se um nome de arquivo já está no padrão correto
 */
function isFileNameValid(fileName: string, code: string): boolean {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);

  // Padrão 1: codigo.ext (MAIN)
  if (baseName === code) {
    return true;
  }

  // Padrão 2: codigo-P.ext (PEDRA)
  if (baseName === `${code}-P`) {
    return true;
  }

  // Padrão 3: codigo-M.ext (MODELO)
  if (baseName === `${code}-M`) {
    return true;
  }

  // Padrão 4: codigo-AD<n>.ext (AD)
  const adPattern = new RegExp(`^${code}-AD\\d+$`);
  if (adPattern.test(baseName)) {
    return true;
  }

  // Padrão 5: codigo-V<n>-<nome>.ext (VARIANT)
  const variantPattern = new RegExp(`^${code}-V\\d+-[A-Z0-9-]+$`);
  if (variantPattern.test(baseName)) {
    // Verificar se não é VARIANT_AD (não deve ter -AD no final)
    if (!baseName.endsWith("-AD") && !/-AD\d+$/.test(baseName)) {
      return true;
    }
  }

  // Padrão 6: codigo-V<n>-<nome>-AD<n>.ext (VARIANT_AD)
  const variantAdPattern = new RegExp(`^${code}-V\\d+-[A-Z0-9-]+-AD\\d+$`);
  if (variantAdPattern.test(baseName)) {
    return true;
  }

  return false;
}

/**
 * Verifica se uma pasta já está completamente organizada
 */
async function isFolderAlreadyOrganized(
  folderPath: string,
  code: string
): Promise<boolean> {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const imageFiles: string[] = [];

    // Coletar todas as imagens
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
          imageFiles.push(entry.name);
        }
      }
    }

    if (imageFiles.length === 0) {
      return true; // Pasta vazia considerada como organizada
    }

    // Verificar se todos os arquivos estão no padrão correto
    for (const fileName of imageFiles) {
      if (!isFileNameValid(fileName, code)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(
      `   ⚠️ Erro ao verificar organização da pasta: ${
        (error as Error).message
      }`
    );
    return false;
  }
}

/**
 * Gera o novo nome do arquivo baseado na categorização
 */
function generateNewFileName(
  code: string,
  originalName: string,
  categorization: CategorizationResult
): string {
  const ext = path.extname(originalName);

  switch (categorization.category) {
    case "MAIN":
      return `${code}${ext}`;

    case "PEDRA":
      return `${code}-P${ext}`;

    case "MODELO":
      return `${code}-M${ext}`;

    case "AD":
      const adNum = categorization.adNumber || 1;
      return `${code}-AD${adNum}${ext}`;

    case "VARIANT":
      const vNum = categorization.variantNumber || 1;
      const vName = categorization.variantName || "VAR";
      return `${code}-V${vNum}-${vName}${ext}`;

    case "VARIANT_AD":
      const vAdNum = categorization.variantNumber || 1;
      const vAdName = categorization.variantName || "VAR";
      const adVNum = categorization.adNumber || 1;
      return `${code}-V${vAdNum}-${vAdName}-AD${adVNum}${ext}`;

    default:
      return originalName;
  }
}

/**
 * Processa uma pasta de código
 */
async function processCodeFolder(
  folderPath: string,
  cache: CategorizationCache
): Promise<{
  processed: number;
  renamed: number;
  errors: number;
}> {
  const code = path.basename(folderPath);
  let processed = 0;
  let renamed = 0;
  let errors = 0;

  try {
    // PRIMEIRO: Verificar se a pasta já está completamente organizada
    // MAS apenas se o cache NÃO foi limpo (quando limpo, queremos reanalisar tudo)
    const alreadyOrganized =
      !CLEAR_CACHE && (await isFolderAlreadyOrganized(folderPath, code));

    if (alreadyOrganized) {
      // Verificar se já está no cache como organizada
      const cacheKey = folderPath;
      const cached = cache[cacheKey];

      // Ler arquivos para criar hash
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const imageFiles: ImageFile[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (
            [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)
          ) {
            imageFiles.push({
              path: path.join(folderPath, entry.name),
              fileName: entry.name,
              code,
            });
          }
        }
      }

      if (imageFiles.length === 0) {
        return { processed: 0, renamed: 0, errors: 0 };
      }

      const imageNamesHash = imageFiles
        .map((img) => img.fileName)
        .sort()
        .join(",");

      // Se não está no cache ou o hash mudou, atualizar cache
      if (!cached || cached.imagesHash !== imageNamesHash) {
        // Criar categorizações vazias (não precisa categorizar, já está organizado)
        const categorizations: CategorizationResult[] = imageFiles.map(
          (img) => ({
            fileName: img.fileName,
            category: "MAIN" as const, // Valor padrão, não será usado
            confidence: 1.0,
          })
        );

        cache[cacheKey] = {
          categorizations,
          imagesHash: imageNamesHash,
          timestamp: new Date().toISOString(),
        };
      }

      console.log(`   ✅ Pasta já organizada (${imageFiles.length} arquivos)`);
      return { processed: imageFiles.length, renamed: 0, errors: 0 };
    }

    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const imageFiles: ImageFile[] = [];

    // Coletar todas as imagens
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
          imageFiles.push({
            path: path.join(folderPath, entry.name),
            fileName: entry.name,
            code,
          });
        }
      }
    }

    if (imageFiles.length === 0) {
      return { processed: 0, renamed: 0, errors: 0 };
    }

    processed = imageFiles.length;

    // Categorizar imagens
    const categorizations = await categorizeImagesInFolder(
      folderPath,
      imageFiles,
      cache
    );

    if (categorizations.length === 0) {
      console.log(`      ⚠️ Não foi possível categorizar as imagens`);
      return { processed, renamed: 0, errors: processed };
    }

    // Renomear arquivos
    for (const img of imageFiles) {
      const categorization = categorizations.find(
        (c) => c.fileName === img.fileName
      );

      if (!categorization) {
        console.log(
          `      ⚠️ Categorização não encontrada para ${img.fileName}`
        );
        errors++;
        continue;
      }

      const newName = generateNewFileName(code, img.fileName, categorization);
      const newPath = path.join(folderPath, newName);

      // Se o nome não mudou (case-sensitive), pular
      if (img.fileName === newName) {
        console.log(`      ⏭️  ${img.fileName} (já está correto)`);
        continue;
      }

      // Verificar se já existe arquivo com o novo nome (case-insensitive no Windows)
      let finalNewPath = newPath;
      let hasConflict = false;

      try {
        const entries = await fs.readdir(folderPath);
        // Verificar se existe arquivo DIFERENTE com mesmo nome (case-insensitive)
        // Se o arquivo atual já tem o nome correto (apenas case diferente), não é conflito
        const existingFile = entries.find(
          (entry) =>
            entry.toLowerCase() === newName.toLowerCase() &&
            entry !== img.fileName
        );

        if (existingFile) {
          // Há conflito: existe outro arquivo com o mesmo nome
          hasConflict = true;
        } else if (img.fileName.toLowerCase() === newName.toLowerCase()) {
          // Apenas mudança de case, não há conflito - pode renomear diretamente
          hasConflict = false;
        }
      } catch {
        // Se der erro ao ler diretório, verificar se é apenas mudança de case
        if (img.fileName.toLowerCase() === newName.toLowerCase()) {
          hasConflict = false;
        } else {
          hasConflict =
            fsSync.existsSync(finalNewPath) &&
            path.basename(finalNewPath) !== img.fileName;
        }
      }

      // Se há conflito real (arquivo diferente com mesmo nome), resolver inteligentemente
      if (hasConflict) {
        const ext = path.extname(newName);
        const baseName = path.basename(newName, ext);

        // Se o conflito é com uma variante (V<x>-<nome>), converter para VARIANT_AD
        const variantMatch = baseName.match(
          new RegExp(`^${code}-V(\\d+)-(.+)$`)
        );
        if (variantMatch && categorization.category === "VARIANT") {
          // Encontrar o próximo número AD disponível para esta variante
          const variantNum = variantMatch[1];
          const variantName = variantMatch[2];
          let adCounter = 1;

          while (true) {
            const testName = `${code}-V${variantNum}-${variantName}-AD${adCounter}${ext}`;
            const testPath = path.join(folderPath, testName);

            try {
              const entries = await fs.readdir(folderPath);
              const exists = entries.some(
                (e) =>
                  e.toLowerCase() === testName.toLowerCase() &&
                  e !== img.fileName
              );

              if (!exists && !fsSync.existsSync(testPath)) {
                finalNewPath = testPath;
                console.log(
                  `      ⚠️ Conflito: ${img.fileName} → ${path.basename(
                    finalNewPath
                  )} (convertido para VARIANT_AD)`
                );
                break;
              }
            } catch {
              if (!fsSync.existsSync(testPath)) {
                finalNewPath = testPath;
                console.log(
                  `      ⚠️ Conflito: ${img.fileName} → ${path.basename(
                    finalNewPath
                  )} (convertido para VARIANT_AD)`
                );
                break;
              }
            }
            adCounter++;
          }
        } else {
          // Para outros tipos de conflito, usar sufixo _1, _2, etc.
          let counter = 1;

          while (true) {
            const testName = `${baseName}_${counter}${ext}`;
            const testPath = path.join(folderPath, testName);

            try {
              const entries = await fs.readdir(folderPath);
              const exists = entries.some(
                (e) =>
                  e.toLowerCase() === testName.toLowerCase() &&
                  e !== img.fileName
              );

              if (!exists && !fsSync.existsSync(testPath)) {
                finalNewPath = testPath;
                break;
              }
            } catch {
              if (!fsSync.existsSync(testPath)) {
                finalNewPath = testPath;
                break;
              }
            }
            counter++;
          }

          console.log(
            `      ⚠️ Conflito: ${img.fileName} → ${path.basename(
              finalNewPath
            )}`
          );
        }
      } else {
        console.log(
          `      ✅ ${img.fileName} → ${newName} (${categorization.category})`
        );
      }

      try {
        if (!DRY_RUN) {
          await fs.rename(img.path, finalNewPath);
        }
        renamed++;
      } catch (error) {
        console.error(
          `      ❌ Erro ao renomear ${img.fileName}: ${
            (error as Error).message
          }`
        );
        errors++;
      }
    }

    return { processed, renamed, errors };
  } catch (error) {
    console.error(
      `   ❌ Erro ao processar pasta ${code}: ${(error as Error).message}`
    );
    return { processed, renamed: 0, errors: processed };
  }
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🤖 CATEGORIZAÇÃO DE IMAGENS COM IA");
  console.log("═══════════════════════════════════════════\n");

  if (!API_KEY) {
    console.error("❌ OPENAI_API_KEY não configurada!");
    console.error("   Configure a variável de ambiente OPENAI_API_KEY\n");
    process.exit(1);
  }

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${INPUT_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(INPUT_DIR)) {
    console.error(`❌ Diretório não encontrado: ${INPUT_DIR}`);
    process.exit(1);
  }

  try {
    // Encontrar todas as pastas de código
    const codeFolders: string[] = [];

    async function scanCategoryFolders(categoryPath: string): Promise<void> {
      const entries = await fs.readdir(categoryPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(categoryPath, entry.name);

        if (entry.isDirectory()) {
          // Verificar se é uma pasta de código (apenas números)
          if (/^\d+$/.test(entry.name)) {
            codeFolders.push(entryPath);
          } else {
            // Continuar escaneando subpastas
            await scanCategoryFolders(entryPath);
          }
        }
      }
    }

    // Escanear todas as categorias
    const categoryEntries = await fs.readdir(INPUT_DIR, {
      withFileTypes: true,
    });
    for (const entry of categoryEntries) {
      if (entry.isDirectory() && /^\[.+\]\[.+\]$/.test(entry.name)) {
        await scanCategoryFolders(path.join(INPUT_DIR, entry.name));
      }
    }

    console.log(`📂 Encontradas ${codeFolders.length} pastas de código\n`);

    if (codeFolders.length === 0) {
      console.log("⚠️ Nenhuma pasta de código encontrada!\n");
      return;
    }

    // Carregar cache
    console.log("📦 Carregando cache de categorizações...");
    const cache = await loadCache();
    const cacheSize = Object.keys(cache).length;
    console.log(`   ✅ Cache carregado: ${cacheSize} entradas\n`);

    // Processar cada pasta em grupos de 10
    console.log("🔄 Processando pastas em grupos de 10...\n");
    let totalProcessed = 0;
    let totalRenamed = 0;
    let totalErrors = 0;

    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_REQUESTS = 500; // 0.5s em milissegundos

    // Dividir pastas em grupos de 10
    for (
      let batchStart = 0;
      batchStart < codeFolders.length;
      batchStart += BATCH_SIZE
    ) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, codeFolders.length);
      const batch = codeFolders.slice(batchStart, batchEnd);
      const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(codeFolders.length / BATCH_SIZE);

      console.log(`═══════════════════════════════════════════`);
      console.log(
        `📦 GRUPO ${batchNumber}/${totalBatches} (${batch.length} pastas)`
      );
      console.log(`═══════════════════════════════════════════\n`);

      // Processar cada pasta do grupo com delay
      for (let i = 0; i < batch.length; i++) {
        const folderPath = batch[i];
        const code = path.basename(folderPath);
        const relativePath = path.relative(INPUT_DIR, folderPath);
        const globalIndex = batchStart + i + 1;

        console.log(`[${globalIndex}/${codeFolders.length}] ${relativePath}`);

        const result = await processCodeFolder(folderPath, cache);
        totalProcessed += result.processed;
        totalRenamed += result.renamed;
        totalErrors += result.errors;

        console.log();

        // Delay de 0.5s entre requisições (exceto na última do grupo)
        if (i < batch.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_REQUESTS)
          );
        }
      }

      // Pausa entre grupos (exceto no último grupo)
      if (batchEnd < codeFolders.length) {
        console.log(`⏸️  Pausa entre grupos...\n`);
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_REQUESTS)
        );
      }
    }

    // Salvar cache
    console.log("\n💾 Salvando cache...");
    await saveCache(cache);
    console.log(
      `   ✅ Cache salvo com ${Object.keys(cache).length} entradas\n`
    );

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Pastas processadas: ${codeFolders.length}`);
    console.log(`   Imagens processadas: ${totalProcessed}`);
    console.log(`   Imagens renomeadas: ${totalRenamed}`);
    console.log(`   Erros: ${totalErrors}\n`);

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhum arquivo foi renomeado\n");
    }
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
