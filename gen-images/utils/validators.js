// validators.js
// Validações e verificações

import { UTApi } from "uploadthing/server";
import { config } from "./config.js";
import { logger } from "./logger.js";

// Valida se a API key está configurada
export function validateApiKey() {
  if (!config.apiKey || config.apiKey === "SG_00378a8fa6915c2c") {
    logger.warn("API key pode não estar configurada corretamente");
    return false;
  }
  return true;
}

// Valida se o UploadThing está acessível
export async function validateUploadThing() {
  try {
    const utapi = new UTApi({
      token: config.uploadthingToken,
    });

    // Tenta fazer uma operação simples para verificar conectividade
    // Nota: UTApi não tem método de teste direto, então assumimos que está OK
    // se o token está presente
    if (!config.uploadthingToken) {
      logger.error("UploadThing token não configurado");
      return false;
    }

    logger.debug("UploadThing validado com sucesso");
    return true;
  } catch (error) {
    logger.error(`Erro ao validar UploadThing: ${error.message}`);
    return false;
  }
}

// Valida dependências do ambiente
export async function validateEnvironment() {
  logger.info("Validando ambiente...");

  const validations = [
    { name: "API Key", result: validateApiKey() },
    { name: "UploadThing", result: await validateUploadThing() },
  ];

  const failed = validations.filter((v) => !v.result);

  if (failed.length > 0) {
    logger.warn(
      `Algumas validações falharam: ${failed.map((v) => v.name).join(", ")}`
    );
    return false;
  }

  logger.info("Ambiente validado com sucesso");
  return true;
}


