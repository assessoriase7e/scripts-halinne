import { apiLimiter } from "./concurrency.js";
import { optimizeImage } from "./imageProcessor.js";
import { API_KEY } from "./config.js";
import OpenAI from "openai";
const client = new OpenAI({ apiKey: API_KEY });
/**
 * Analisa uma imagem e identifica seu tipo usando IA
 */
export async function analyzeImageType(imagePath, fileName) {
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
            - MAIN_IMAGE: Imagem principal da joia em fundo branco, sem variações
            - PRODUCT_ON_STONE: Imagem mostrando a joia posicionada sobre uma pedra ou com elemento "nano"
            - ADDITIONAL_PHOTO: Foto adicional da mesma joia, talvez em ângulo diferente
            - VARIANT: Mesma joia mas com variação de cor ou outra característica
            
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
            });
            const content = response.choices[0].message.content;
            if (!content) {
                throw new Error("Resposta da API não contém conteúdo");
            }
            const result = JSON.parse(content);
            // Validar e normalizar o resultado
            if (!result.type ||
                ![
                    "MAIN_IMAGE",
                    "PRODUCT_ON_STONE",
                    "ADDITIONAL_PHOTO",
                    "VARIANT",
                ].includes(result.type)) {
                throw new Error("Tipo de imagem inválido retornado pela IA");
            }
            // Para variantes, garantir que temos variantType e variantOption
            if (result.type === "VARIANT") {
                if (!result.variantType)
                    result.variantType = "cor";
                if (!result.variantOption) {
                    // Tentar extrair do nome do arquivo
                    const lowerFileName = fileName.toLowerCase();
                    const colorMap = {
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
            return result;
        }
        catch (error) {
            console.error(`    ❌ Erro na análise de imagem: ${error.message}`);
            // Em caso de erro, retornar classificação padrão baseada no nome
            const lowerFileName = fileName.toLowerCase();
            if (lowerFileName.includes("nano") ||
                lowerFileName.includes("banana") ||
                lowerFileName.includes("pedra") ||
                lowerFileName.includes("stone")) {
                return {
                    type: "PRODUCT_ON_STONE",
                    confidence: 0.5,
                    reasoning: "Classificação fallback baseada no nome do arquivo",
                };
            }
            if (lowerFileName.includes("cópia") ||
                lowerFileName.includes("copy") ||
                lowerFileName.includes("adicional") ||
                lowerFileName.includes("additional")) {
                return {
                    type: "ADDITIONAL_PHOTO",
                    confidence: 0.5,
                    reasoning: "Classificação fallback baseada no nome do arquivo",
                };
            }
            // Verificar cores no nome
            const colorMap = {
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
            return {
                type: "MAIN_IMAGE",
                confidence: 0.5,
                reasoning: "Classificação fallback padrão",
            };
        }
    });
}
//# sourceMappingURL=image-analyzer.js.map