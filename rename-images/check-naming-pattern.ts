import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para verificar quais arquivos estão fora do padrão de nomenclatura
 * Padrão esperado:
 * - codigo
 * - codigo-P
 * - codigo-M
 * - codigo-V<x> (onde x é um número)
 * - codigo-AD<x> (onde x é um número)
 */

const INPUT_DIR = "rename-images/input";
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];

interface InvalidFile {
  path: string;
  fileName: string;
  relativePath: string;
  reason: string;
  suggestion: string;
}

/**
 * Verifica se o nome do arquivo está dentro do padrão
 */
function isValidFileName(fileName: string): {
  isValid: boolean;
  reason?: string;
  suggestion?: string;
} {
  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(fileName, ext);

  // Padrões válidos:
  // 1. codigo (apenas números)
  // 2. codigo-P
  // 3. codigo-M
  // 4. codigo-V<x> (onde x é um número)
  // 5. codigo-AD<x> (onde x é um número)

  // Verificar se começa com número
  if (!/^\d+/.test(nameWithoutExt)) {
    return {
      isValid: false,
      reason: "Não começa com código numérico",
      suggestion: `[código][-sufixo].${ext}`,
    };
  }

  // Padrão 1: apenas código (números)
  if (/^\d+$/.test(nameWithoutExt)) {
    return { isValid: true };
  }

  // Padrão 2: codigo-P
  if (/^\d+-P$/.test(nameWithoutExt)) {
    return { isValid: true };
  }

  // Padrão 3: codigo-M
  if (/^\d+-M$/.test(nameWithoutExt)) {
    return { isValid: true };
  }

  // Padrão 4: codigo-V<x> (onde x é um número)
  if (/^\d+-V\d+$/.test(nameWithoutExt)) {
    return { isValid: true };
  }

  // Padrão 5: codigo-AD<x> (onde x é um número)
  if (/^\d+-AD\d+$/.test(nameWithoutExt)) {
    return { isValid: true };
  }

  // Se não corresponde a nenhum padrão válido, é inválido
  // Extrair código para sugestão
  const codeMatch = nameWithoutExt.match(/^(\d+)/);
  const code = codeMatch ? codeMatch[1] : "codigo";

  // Tentar identificar o que está errado
  let reason = "Não corresponde aos padrões válidos";
  let suggestion = `${code}[-P|-M|-V<x>|-AD<x>].${ext}`;

  // Verificar se tem caracteres inválidos
  if (/[^a-zA-Z0-9\-]/.test(nameWithoutExt)) {
    reason = "Contém caracteres especiais não permitidos";
  } else if (nameWithoutExt.includes("_")) {
    reason = "Contém underscore (deve usar traço)";
    suggestion = `${code}-AD1.${ext}`;
  } else if (nameWithoutExt.includes(" ")) {
    reason = "Contém espaços";
    suggestion = `${code}-P.${ext}`;
  } else if (/^\d+-[a-z]/.test(nameWithoutExt)) {
    reason = "Sufixo em minúscula (deve ser maiúscula: P, M, V, AD)";
    const match = nameWithoutExt.match(/^\d+-([a-z]+)/);
    if (match) {
      const suffix = match[1].toUpperCase();
      suggestion = `${code}-${suffix}.${ext}`;
    }
  } else if (/^\d+-[A-Z][a-z]/.test(nameWithoutExt) && !/^\d+-(P|M|V|AD)/.test(nameWithoutExt)) {
    reason = "Sufixo não é P, M, V ou AD";
    suggestion = `${code}-P.${ext}`;
  }

  return {
    isValid: false,
    reason,
    suggestion,
  };
}

/**
 * Processa uma pasta recursivamente
 */
async function processDirectory(dirPath: string): Promise<{
  total: number;
  valid: number;
  invalid: InvalidFile[];
}> {
  const invalid: InvalidFile[] = [];
  let total = 0;
  let valid = 0;

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTENSIONS.includes(ext) || IMAGE_EXTENSIONS.includes(path.extname(entry.name))) {
            total++;

            const { isValid, reason, suggestion } = isValidFileName(entry.name);

            if (isValid) {
              valid++;
            } else {
              const relativePath = path.relative(INPUT_DIR, fullPath);
              invalid.push({
                path: fullPath,
                fileName: entry.name,
                relativePath,
                reason: reason || "Padrão inválido",
                suggestion: suggestion || entry.name,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Erro ao processar ${currentPath}: ${(error as Error).message}`);
    }
  }

  await scan(dirPath);
  return { total, valid, invalid };
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔍 VERIFICAÇÃO DE PADRÃO DE NOMENCLATURA");
  console.log("═══════════════════════════════════════════\n");

  console.log("📋 Padrões válidos:");
  console.log("   ✅ codigo (ex: 123.png)");
  console.log("   ✅ codigo-P (ex: 123-P.png)");
  console.log("   ✅ codigo-M (ex: 123-M.png)");
  console.log("   ✅ codigo-V<x> (ex: 123-V1.png, 123-V2.png)");
  console.log("   ✅ codigo-AD<x> (ex: 123-AD1.png, 123-AD2.png)\n");

  console.log(`📂 Diretório: ${INPUT_DIR}\n`);

  if (!fsSync.existsSync(INPUT_DIR)) {
    console.error(`❌ Diretório não encontrado: ${INPUT_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔍 Analisando arquivos...\n");

    const result = await processDirectory(INPUT_DIR);

    console.log("═══════════════════════════════════════════");
    console.log("📊 RESULTADO DA VERIFICAÇÃO");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Total de arquivos: ${result.total}`);
    console.log(`   ✅ Arquivos válidos: ${result.valid}`);
    console.log(`   ❌ Arquivos inválidos: ${result.invalid.length}\n`);

    if (result.invalid.length === 0) {
      console.log("🎉 Todos os arquivos estão dentro do padrão!\n");
      return;
    }

    // Agrupar por tipo de problema
    const byReason = new Map<string, InvalidFile[]>();
    for (const file of result.invalid) {
      if (!byReason.has(file.reason)) {
        byReason.set(file.reason, []);
      }
      byReason.get(file.reason)!.push(file);
    }

    console.log("═══════════════════════════════════════════");
    console.log("🚨 ARQUIVOS FORA DO PADRÃO");
    console.log("═══════════════════════════════════════════\n");

    // Mostrar estatísticas por tipo de problema
    console.log("📈 Estatísticas por tipo de problema:\n");
    for (const [reason, files] of byReason) {
      console.log(`   ${reason}: ${files.length} arquivos`);
    }
    console.log();

    // Mostrar detalhes (até 50 arquivos)
    const maxShow = 50;
    console.log("═══════════════════════════════════════════");
    console.log("📋 DETALHES DOS ARQUIVOS INVÁLIDOS");
    console.log("═══════════════════════════════════════════\n");

    for (let i = 0; i < Math.min(result.invalid.length, maxShow); i++) {
      const file = result.invalid[i];
      console.log(`   ${i + 1}. ${file.fileName}`);
      console.log(`      📍 ${file.relativePath}`);
      console.log(`      🚨 ${file.reason}`);
      console.log(`      💡 Sugestão: ${file.suggestion}\n`);
    }

    if (result.invalid.length > maxShow) {
      console.log(`   ... e mais ${result.invalid.length - maxShow} arquivos\n`);
    }

    // Agrupar por categoria
    console.log("═══════════════════════════════════════════");
    console.log("📊 DISTRIBUIÇÃO POR CATEGORIA");
    console.log("═══════════════════════════════════════════\n");

    const byCategory = new Map<string, number>();
    for (const file of result.invalid) {
      const categoryMatch = file.relativePath.match(/^\[([^\]]+)\]\[([^\]]+)\]/);
      if (categoryMatch) {
        const category = `[${categoryMatch[1]}][${categoryMatch[2]}]`;
        byCategory.set(category, (byCategory.get(category) || 0) + 1);
      }
    }

    for (const [category, count] of byCategory) {
      console.log(`   ${category}: ${count} arquivos`);
    }
    console.log();

  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A VERIFICAÇÃO");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();



