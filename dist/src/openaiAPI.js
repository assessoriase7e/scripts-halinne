import OpenAI from "openai";
import { API_KEY, MIN_SIMILARITY } from "./config.js";
import { apiLimiter } from "./concurrency.js";
import { optimizeImage } from "./imageProcessor.js";
const client = new OpenAI({ apiKey: API_KEY });
/**
 * Analisa a imagem e extrai características visuais detalhadas
 */
export async function analyzeImage(imagePath) {
    return apiLimiter.execute(async () => {
        try {
            const base64Image = await optimizeImage(imagePath);
            const response = await client.chat.completions.create({
                model: "gpt-5",
                messages: [
                    {
                        role: "system",
                        content: "Você é um especialista em joias. Analise as imagens com foco em características visuais precisas que permitam identificar peças idênticas ou muito similares.",
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Analise esta joia e descreva em DETALHES:
1. Tipo de joia (anel, colar, brinco, pulseira, etc)
2. Material principal (ouro amarelo, branco, rosê, prata, etc)
3. Tipo de pedra principal (se houver) - cor, formato, tamanho aproximado
4. Design principal (formato, estilo, texturas)
5. Elementos distintivos (gravuras, detalhes únicos, assinaturas)
6. Padrões ou repetições no design
7. Qualquer outra característica visual única

Seja extremamente detalhado e técnico (máximo 300 palavras). Foque em características que seriam idênticas em duas joias iguais.`,
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
                max_completion_tokens: 500,
            });
            return response.choices[0].message.content || "";
        }
        catch (error) {
            console.error(`    ❌ Erro na API Vision: ${error.message}`);
            if (error.response) {
                console.error(`    📄 Detalhes:`, error.response.data);
            }
            throw error;
        }
    });
}
/**
 * Gera embedding da descrição textual
 */
export async function getTextEmbedding(text) {
    return apiLimiter.execute(async () => {
        try {
            const response = await client.embeddings.create({
                model: "text-embedding-3-large",
                input: text.substring(0, 8000), // garantir que não exceda o limite
                encoding_format: "float",
            });
            return response.data[0].embedding;
        }
        catch (error) {
            console.error(`    ❌ Erro ao gerar embedding:`, error.message);
            throw error;
        }
    });
}
/**
 * Verificação adicional de similaridade usando análise comparativa
 */
export async function verifySimilarity(imagePath1, imagePath2, expectedSimilarity) {
    return apiLimiter.execute(async () => {
        try {
            const base64Image1 = await optimizeImage(imagePath1);
            const base64Image2 = await optimizeImage(imagePath2);
            const response = await client.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Você é um especialista em joias que precisa determinar se duas imagens mostram a mesma joia ou joias muito similares.",
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Compare estas duas imagens de joias e responda:
1. São a mesma joia exata? (sim/não)
2. Se não forem idênticas, são muito similares? (sim/não)
3. Justifique sua resposta em até 100 palavras, focando nas diferenças e similaridades.

Responda no formato:
RESPOSTA: [SIM/NÃO/MUITO_SIMILAR]
JUSTIFICATIVA: [sua justificativa]`,
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image1}`,
                                },
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image2}`,
                                },
                            },
                        ],
                    },
                ],
                max_completion_tokens: 200,
            });
            const result = response.choices[0].message.content || "";
            console.log(`    🔍 Verificação visual: ${result}`);
            // Extrair resposta do formato esperado
            const match = result.match(/RESPOSTA:\s*(SIM|NÃO|MUITO_SIMILAR)/i);
            if (match) {
                const answer = match[1].toUpperCase();
                return answer === "SIM" || answer === "MUITO_SIMILAR";
            }
            // Se não conseguir extrair resposta, confiar na similaridade calculada
            return expectedSimilarity >= MIN_SIMILARITY;
        }
        catch (error) {
            console.error(`    ⚠️ Erro na verificação adicional: ${error.message}`);
            // Em caso de erro, confiar na similaridade calculada
            return expectedSimilarity >= MIN_SIMILARITY;
        }
    });
}
//# sourceMappingURL=openaiAPI.js.map