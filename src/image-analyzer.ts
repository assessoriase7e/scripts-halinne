import { apiLimiter } from "./concurrency.js";
import { optimizeImage } from "./imageProcessor.js";
import { API_KEY } from "./shared-config.js";
import { ImageAnalysis } from "./types.js";
import { EmbeddingCache, getFileHash } from "./cache.js";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: API_KEY });

// Cache em memória para análises de tipo de imagem
const typeAnalysisCache = new Map<string, ImageAnalysis>();

/**
 * Analisa uma imagem e identifica seu tipo usando IA com cache
 */
export async function analyzeImageType(
  imagePath: string,
  fileName: string,
  cache?: EmbeddingCache
): Promise<ImageAnalysis> {
  // Gerar chave de cache baseada no hash do arquivo
  const fileHash = await getFileHash(imagePath);
  const cacheKey = fileHash ? `${fileName}-${fileHash}` : fileName;
  
  // Verificar cache em memória primeiro
  if (typeAnalysisCache.has(cacheKey)) {
    console.log(`    🎯 Cache hit (tipo): ${fileName}`);
    return typeAnalysisCache.get(cacheKey)!;
  }
  
  // Verificar cache SQLite se disponível
  if (cache && fileHash) {
    try {
      const cached = await cache.get(imagePath);
      if (cached && cached.analysis) {
        // Tentar parsear a análise como ImageAnalysis
        try {
          const parsed = JSON.parse(cached.analysis);
          if (parsed.type) {
            console.log(`    🎯 Cache hit SQLite (tipo): ${fileName}`);
            typeAnalysisCache.set(cacheKey, parsed);
            return parsed as ImageAnalysis;
          }
        } catch {
          // Se não for JSON válido, continuar com análise nova
        }
      }
    } catch (error) {
      console.log(`    ⚠️ Erro ao buscar cache: ${(error as Error).message}`);
    }
  }
  return apiLimiter.execute(async () => {
    try {
      const base64Image = await optimizeImage(imagePath);

      // Extrair código do nome do arquivo para contexto
      const codeMatch = fileName.match(/^(\d+)/);
      const code = codeMatch ? codeMatch[1] : "desconhecido";

      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Você é um especialista em joias que precisa analisar imagens e classificá-las em categorias específicas.
            
            Responda APENAS no formato JSON com os seguintes campos:
            - "type": um dos seguintes valores: "MAIN_IMAGE", "PRODUCT_ON_STONE", "ADDITIONAL_PHOTO", "VARIANT"
            - "variantType": (apenas para variantes) o tipo da variante (ex: "cor")
            - "variantOption": (apenas para variantes) o valor da variante (ex: "vermelho", "azul")
            - "confidence": número de 0 a 1 indicando sua confiança na classificação
            - "reasoning": breve explicação da sua classificação
            
            Categorias:
            - MAIN_IMAGE: Imagem principal da joia em fundo branco, sem variações de cor ou material
            - PRODUCT_ON_STONE: Imagem mostrando a joia posicionada sobre uma pedra ou com elemento "nano"
            - ADDITIONAL_PHOTO: Foto adicional da mesma joia no mesmo material/cor, apenas em ângulo diferente ou contexto diferente (ex: na mão)
            - VARIANT: Mesma joia mas em COR DIFERENTE ou MATERIAL DIFERENTE (ex: ouro amarelo vs ouro branco, pedra vermelha vs azul). 
              Se a joia tem uma cor/material visivelmente diferente do padrão dourado/amarelo, classifique como VARIANT.
              Identifique a cor/material específico (vermelho, azul, verde, prata, ouro branco, etc.)
            
            O código do produto é: ${code}`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise esta imagem de joia e classifique-a according às categorias. Nome do arquivo: ${fileName}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_completion_tokens: 300,
        response_format: { type: "json_object" },
      } as any);

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Resposta da API não contém conteúdo");
      }
      const result = JSON.parse(content);

      // Validar e normalizar o resultado
      if (
        !result.type ||
        ![
          "MAIN_IMAGE",
          "PRODUCT_ON_STONE",
          "ADDITIONAL_PHOTO",
          "VARIANT",
        ].includes(result.type)
      ) {
        throw new Error("Tipo de imagem inválido retornado pela IA");
      }

      // Para variantes, garantir que temos variantType e variantOption
      if (result.type === "VARIANT") {
        if (!result.variantType) result.variantType = "cor";
        if (!result.variantOption) {
          // Tentar extrair do nome do arquivo
          const lowerFileName = fileName.toLowerCase();
          const colorMap: Record<string, string> = {
            vermelho: "vermelho",
            red: "vermelho",
            azul: "azul",
            blue: "azul",
            verde: "verde",
            green: "verde",
            amarelo: "amarelo",
            yellow: "amarelo",
            preto: "preto",
            black: "preto",
            branco: "branco",
            white: "branco",
            dourado: "dourado",
            gold: "dourado",
            prata: "prata",
            silver: "prata",
            rosa: "rosa",
            pink: "rosa",
            roxo: "roxo",
            purple: "roxo",
            laranja: "laranja",
            orange: "laranja",
            marrom: "marrom",
            brown: "marrom",
            cinza: "cinza",
            gray: "cinza",
            grey: "cinza",
            "ouro branco": "ouro-branco",
            "white gold": "ouro-branco",
            "ouro rose": "ouro-rose",
            "rose gold": "ouro-rose",
          };

          for (const [key, value] of Object.entries(colorMap)) {
            if (lowerFileName.includes(key)) {
              result.variantOption = value;
              break;
            }
          }

          if (!result.variantOption) {
            result.variantOption = "desconhecida";
          }
        }
      }

      // Salvar no cache em memória
      typeAnalysisCache.set(cacheKey, result as ImageAnalysis);
      
      // Salvar no cache SQLite se disponível
      if (cache && fileHash) {
        try {
          await cache.set(imagePath, JSON.stringify(result), []);
        } catch (error) {
          console.log(`    ⚠️ Erro ao salvar no cache: ${(error as Error).message}`);
        }
      }
      
      return result as ImageAnalysis;
    } catch (error) {
      console.error(
        `    ❌ Erro na análise de imagem: ${(error as Error).message}`
      );

      // Em caso de erro, retornar classificação padrão baseada no nome
      const lowerFileName = fileName.toLowerCase();

      if (
        lowerFileName.includes("nano") ||
        lowerFileName.includes("banana") ||
        lowerFileName.includes("pedra") ||
        lowerFileName.includes("stone")
      ) {
        return {
          type: "PRODUCT_ON_STONE",
          confidence: 0.5,
          reasoning: "Classificação fallback baseada no nome do arquivo",
        };
      }

      if (
        lowerFileName.includes("cópia") ||
        lowerFileName.includes("copy") ||
        lowerFileName.includes("adicional") ||
        lowerFileName.includes("additional")
      ) {
        return {
          type: "ADDITIONAL_PHOTO",
          confidence: 0.5,
          reasoning: "Classificação fallback baseada no nome do arquivo",
        };
      }

      // Verificar cores no nome
      const colorMap: Record<string, string> = {
        vermelho: "vermelho",
        red: "vermelho",
        azul: "azul",
        blue: "azul",
        verde: "verde",
        green: "verde",
        amarelo: "amarelo",
        yellow: "amarelo",
        preto: "preto",
        black: "preto",
        branco: "branco",
        white: "branco",
        dourado: "dourado",
        gold: "dourado",
        prata: "prata",
        silver: "prata",
        rosa: "rosa",
        pink: "rosa",
        roxo: "roxo",
        purple: "roxo",
        laranja: "laranja",
        orange: "laranja",
        marrom: "marrom",
        brown: "marrom",
        cinza: "cinza",
        gray: "cinza",
        grey: "cinza",
        "ouro branco": "ouro-branco",
        "white gold": "ouro-branco",
        "ouro rose": "ouro-rose",
        "rose gold": "ouro-rose",
      };

      for (const [key, value] of Object.entries(colorMap)) {
        if (lowerFileName.includes(key)) {
          return {
            type: "VARIANT",
            variantType: "cor",
            variantOption: value,
            confidence: 0.5,
            reasoning: "Classificação fallback baseada no nome do arquivo",
          };
        }
      }

      // Padrão: imagem principal
      const fallbackResult = {
        type: "MAIN_IMAGE" as const,
        confidence: 0.5,
        reasoning: "Classificação fallback padrão",
      };
      
      // Salvar fallback no cache em memória
      typeAnalysisCache.set(cacheKey, fallbackResult);
      
      return fallbackResult;
    }
  });
}
