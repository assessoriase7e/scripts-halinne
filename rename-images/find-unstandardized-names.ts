import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para encontrar arquivos com nomes não padronizados
 * Verifica padrões irregulares nos nomes dos arquivos
 */

const ORGANIZED_DIR = "rename-images/organized";

/**
 * Analisa um nome de arquivo e retorna informações sobre padronização
 */
function analyzeFileName(fileName: string): {
  isStandardized: boolean;
  issues: string[];
  extractedCode: string | null;
} {
  const issues: string[] = [];
  const nameWithoutExt = path.basename(fileName, path.extname(fileName));
  let extractedCode: string | null = null;

  // Extrair código (número no início)
  const codeMatch = nameWithoutExt.match(/^(\d+)/);
  if (codeMatch) {
    extractedCode = codeMatch[1];
  } else {
    issues.push("Não começa com código numérico");
    return { isStandardized: false, issues, extractedCode };
  }

  // Verificar caracteres especiais indesejados
  // Permitir: letras, números, espaços, hífen, underline, ponto, parênteses, AD
  if (/[^\w\s\-._()AD]/.test(nameWithoutExt)) {
    issues.push("Contém caracteres especiais não permitidos");
  }

  // Verificar sequências de espaços ou hífens
  if (/\s{2,}/.test(nameWithoutExt)) {
    issues.push("Múltiplos espaços consecutivos");
  }

  if (/-{2,}/.test(nameWithoutExt)) {
    issues.push("Múltiplos hífens consecutivos");
  }

  // Verificar se o código está repetido no nome
  const afterCode = nameWithoutExt.substring(extractedCode.length);
  if (afterCode.includes(extractedCode)) {
    issues.push("Código repetido no nome");
  }

  // Verificar nomes muito longos
  if (nameWithoutExt.length > 100) {
    issues.push("Nome muito longo (>100 caracteres)");
  }

  // Verificar nomes muito curtos (além do código)
  // Permitir nomes simples como "-p", "-M", etc.
  if (afterCode.trim().length === 0) {
    // OK - apenas código
  } else if (afterCode.trim().length === 1 && !/[a-zA-Z]/.test(afterCode.trim())) {
    // OK - caracteres especiais simples
  } else if (afterCode.trim().length < 2 && afterCode.trim() !== "-" && afterCode.trim() !== "p" && afterCode.trim() !== "M") {
    issues.push("Nome muito curto após código");
  }

  // Verificar padrões suspeitos ou muito estranhos
  const suspiciousPatterns = [
    /\btest\b/i,
    /\btemp\b/i,
    /\bcopy\b/i,
    /\bbackup\b/i,
    /\bold\b/i,
    /\bnew\b/i,
    /\bduplicate\b/i,
    /\bduplicata\b/i,
    /\bcopia\b/i,
    /\boriginal\b/i,
    /\bfinal\b/i,
    /\bversion\b/i,
    /\bv\d+\b/i, // v1, v2, etc.
    /\b\d{8,}\b/, // datas longas como 20241222
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(nameWithoutExt)) {
      issues.push("Contém palavra suspeita: " + pattern.source.replace(/\\b/g, "").replace(/\\/g, ""));
      break;
    }
  }

  // Remover esta verificação - nomes simples como "1287.png" são aceitáveis

  return {
    isStandardized: issues.length === 0,
    issues,
    extractedCode,
  };
}

/**
 * Processa uma pasta recursivamente
 */
async function processDirectory(dirPath: string): Promise<Array<{
  fullPath: string;
  relativePath: string;
  fileName: string;
  issues: string[];
  extractedCode: string | null;
}>> {
  const nonStandardizedFiles: Array<{
    fullPath: string;
    relativePath: string;
    fileName: string;
    issues: string[];
    extractedCode: string | null;
  }> = [];

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          // Verificar se é imagem
          const ext = path.extname(entry.name).toLowerCase();
          if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
            const analysis = analyzeFileName(entry.name);
            if (!analysis.isStandardized) {
              const relativePath = path.relative(ORGANIZED_DIR, fullPath);
              nonStandardizedFiles.push({
                fullPath,
                relativePath,
                fileName: entry.name,
                issues: analysis.issues,
                extractedCode: analysis.extractedCode,
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
  return nonStandardizedFiles;
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔍 BUSCA DE NOMES NÃO PADRONIZADOS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`📂 Diretório: ${ORGANIZED_DIR}\n`);

  if (!fsSync.existsSync(ORGANIZED_DIR)) {
    console.error(`❌ Diretório não encontrado: ${ORGANIZED_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔄 Analisando nomes de arquivos...\n");

    const nonStandardizedFiles = await processDirectory(ORGANIZED_DIR);

    if (nonStandardizedFiles.length === 0) {
      console.log("✅ Todos os arquivos têm nomes padronizados!\n");
      return;
    }

    // Agrupar por tipo de problema
    const issuesByType = new Map<string, Array<{
      fileName: string;
      relativePath: string;
      issues: string[];
    }>>();

    for (const file of nonStandardizedFiles) {
      for (const issue of file.issues) {
        if (!issuesByType.has(issue)) {
          issuesByType.set(issue, []);
        }
        issuesByType.get(issue)!.push({
          fileName: file.fileName,
          relativePath: file.relativePath,
          issues: file.issues,
        });
      }
    }

    // Resumo
    console.log("═══════════════════════════════════════════");
    console.log("📊 RESUMO DOS PROBLEMAS");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Total de arquivos com problemas: ${nonStandardizedFiles.length}\n`);

    // Mostrar estatísticas por tipo de problema
    for (const [issueType, files] of issuesByType.entries()) {
      console.log(`   🔴 ${issueType}: ${files.length} arquivo(s)`);
    }

    console.log("\n═══════════════════════════════════════════");
    console.log("📋 DETALHES DOS ARQUIVOS");
    console.log("═══════════════════════════════════════════\n");

    // Mostrar detalhes dos arquivos (limitando para não sobrecarregar)
    const maxFilesToShow = 50;
    const filesToShow = nonStandardizedFiles.slice(0, maxFilesToShow);

    for (const file of filesToShow) {
      console.log(`   📄 ${file.relativePath}`);
      console.log(`      Problemas: ${file.issues.join(", ")}`);
      console.log();
    }

    if (nonStandardizedFiles.length > maxFilesToShow) {
      console.log(`   ... e mais ${nonStandardizedFiles.length - maxFilesToShow} arquivos`);
      console.log();
    }

    // Sugestões
    console.log("═══════════════════════════════════════════");
    console.log("💡 SUGESTÕES PARA CORREÇÃO");
    console.log("═══════════════════════════════════════════\n");

    console.log("   1. Remover caracteres especiais desnecessários");
    console.log("   2. Padronizar espaços (máximo 1 espaço entre palavras)");
    console.log("   3. Evitar repetição do código no nome");
    console.log("   4. Manter nomes descritivos mas concisos");
    console.log("   5. Usar apenas letras, números, espaços, hífens e underscores");
    console.log("\n");
  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A ANÁLISE");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();

