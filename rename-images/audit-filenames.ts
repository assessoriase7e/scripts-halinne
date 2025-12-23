import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para auditar nomes de arquivos e identificar aqueles fora do padrão
 * Padrão esperado: [código]-[sufixo].ext (ex: 1287-AD-1.png, 466-pedra.jpg)
 */

const INPUT_DIR = "rename-images/input";

/**
 * Verifica se o nome do arquivo está dentro do padrão
 */
function isValidFileName(fileName: string): {
  isValid: boolean;
  issues: string[];
  expectedPattern: string;
} {
  const issues: string[] = [];
  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(fileName, ext);

  // 1. Verificar extensão minúscula
  if (ext !== ext.toLowerCase()) {
    issues.push(`Extensão maiúscula: ${ext}`);
  }

  // 2. Verificar se não contém espaços
  if (nameWithoutExt.includes(" ")) {
    issues.push("Contém espaços");
  }

  // 3. Verificar se começa com dígito
  if (!/^\d/.test(nameWithoutExt)) {
    issues.push("Não começa com dígito (código)");
  }

  // 4. Verificar formato geral: código[-sufixo]
  // Padrão: começa com dígito, pode ter traços, mas não deve ter letras grudadas ao código
  if (/^\d+[A-Za-z]/.test(nameWithoutExt)) {
    issues.push("Código grudado a letras (deve ter traço)");
  }

  // 5. Verificar se tem caracteres especiais estranhos
  if (/[^a-zA-Z0-9\-_.]/.test(nameWithoutExt)) {
    issues.push("Contém caracteres especiais não permitidos");
  }

  // 6. Verificar se tem múltiplos traços consecutivos
  if (nameWithoutExt.includes("--")) {
    issues.push("Múltiplos traços consecutivos");
  }

  // 7. Verificar se começa ou termina com traço
  if (nameWithoutExt.startsWith("-") || nameWithoutExt.endsWith("-")) {
    issues.push("Começa ou termina com traço");
  }

  const isValid = issues.length === 0;
  const expectedPattern = isValid ? "válido" : `[código]-[sufixo].${ext.toLowerCase()}`;

  return { isValid, issues, expectedPattern };
}

/**
 * Processa uma pasta recursivamente
 */
async function processDirectory(dirPath: string): Promise<{
  valid: number;
  invalid: Array<{
    fullPath: string;
    fileName: string;
    issues: string[];
    expectedPattern: string;
  }>;
  total: number;
}> {
  const invalid: Array<{
    fullPath: string;
    fileName: string;
    issues: string[];
    expectedPattern: string;
  }> = [];

  let valid = 0;
  let total = 0;

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Continuar escaneando subpastas
          await scan(fullPath);
        } else if (entry.isFile()) {
          // Verificar se é imagem
          const ext = path.extname(entry.name).toLowerCase();
          if (![".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
            continue;
          }

          total++;

          const { isValid, issues, expectedPattern } = isValidFileName(entry.name);

          if (isValid) {
            valid++;
          } else {
            invalid.push({
              fullPath,
              fileName: entry.name,
              issues,
              expectedPattern,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Erro ao processar ${currentPath}: ${(error as Error).message}`);
    }
  }

  await scan(dirPath);
  return { valid, invalid, total };
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🔍 AUDITORIA DE NOMES DE ARQUIVOS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`📂 Diretório analisado: ${INPUT_DIR}\n`);

  console.log("📋 Padrão esperado:");
  console.log("   ✅ [código]-[sufixo].ext (ex: 1287-AD-1.png, 466-pedra.jpg)");
  console.log("   ✅ Começa com dígito");
  console.log("   ✅ Sem espaços");
  console.log("   ✅ Extensão minúscula");
  console.log("   ✅ Traço entre código e sufixo\n");

  if (!fsSync.existsSync(INPUT_DIR)) {
    console.error(`❌ Diretório não encontrado: ${INPUT_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔍 Analisando arquivos...\n");

    const result = await processDirectory(INPUT_DIR);

    console.log("═══════════════════════════════════════════");
    console.log("📊 RESULTADO DA AUDITORIA");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Total de arquivos: ${result.total}`);
    console.log(`   ✅ Arquivos válidos: ${result.valid}`);
    console.log(`   ❌ Arquivos inválidos: ${result.invalid.length}\n`);

    if (result.invalid.length > 0) {
      console.log("═══════════════════════════════════════════");
      console.log("🚨 ARQUIVOS FORA DO PADRÃO");
      console.log("═══════════════════════════════════════════\n");

      // Agrupar por tipo de problema
      const issuesByType: Map<string, Array<{
        fileName: string;
        fullPath: string;
        issues: string[];
      }>> = new Map();

      for (const file of result.invalid) {
        for (const issue of file.issues) {
          if (!issuesByType.has(issue)) {
            issuesByType.set(issue, []);
          }
          issuesByType.get(issue)!.push({
            fileName: file.fileName,
            fullPath: file.fullPath,
            issues: file.issues,
          });
        }
      }

      // Mostrar resumo por tipo de problema
      for (const [issueType, files] of issuesByType) {
        console.log(`🔴 ${issueType}: ${files.length} arquivos`);
      }

      console.log("\n═══════════════════════════════════════════");
      console.log("📋 DETALHES DOS ARQUIVOS INVÁLIDOS");
      console.log("═══════════════════════════════════════════\n");

      // Mostrar até 50 arquivos inválidos
      const maxShow = 50;
      for (let i = 0; i < Math.min(result.invalid.length, maxShow); i++) {
        const file = result.invalid[i];
        const relativePath = path.relative(INPUT_DIR, file.fullPath);

        console.log(`   ${i + 1}. ${file.fileName}`);
        console.log(`      📍 ${relativePath}`);
        console.log(`      🚨 Problemas: ${file.issues.join(", ")}`);
        console.log(`      💡 Sugestão: ${file.expectedPattern}\n`);
      }

      if (result.invalid.length > maxShow) {
        console.log(`   ... e mais ${result.invalid.length - maxShow} arquivos\n`);
      }

      // Estatísticas finais
      console.log("═══════════════════════════════════════════");
      console.log("📈 ESTATÍSTICAS POR TIPO DE PROBLEMA");
      console.log("═══════════════════════════════════════════\n");

      for (const [issueType, files] of issuesByType) {
        console.log(`   ${issueType}: ${files.length} arquivos`);
        // Mostrar alguns exemplos
        const examples = files.slice(0, 3).map(f => f.fileName);
        console.log(`      Exemplos: ${examples.join(", ")}`);
        console.log();
      }

    } else {
      console.log("🎉 Todos os arquivos estão dentro do padrão!\n");
    }

    console.log("═══════════════════════════════════════════");
    console.log("✅ AUDITORIA CONCLUÍDA");
    console.log("═══════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("❌ ERRO DURANTE A AUDITORIA");
    console.error("═══════════════════════════════════════════");
    console.error(`Mensagem: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Executar o script
main();



