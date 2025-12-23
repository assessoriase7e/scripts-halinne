import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para padronizar nomes de pastas de categorias
 * Padrão: [categoria][categoria-subcategoria]
 * Exemplo: "ANEIS - Ouro" -> "[aneis][aneis-ouro]"
 */

// Configurações
const IMAGES_DIR = "rename-images/images";
const DRY_RUN = false; // true para simular sem renomear

// Mapeamento de categorias antigas para novas
interface CategoryMapping {
  category: string; // categoria no plural (aneis, brincos, etc)
  patterns: Array<{
    oldPattern: RegExp;
    newSubcategory: string;
  }>;
}

const CATEGORY_MAPPINGS: CategoryMapping[] = [
  {
    category: "aneis",
    patterns: [
      { oldPattern: /^ANEIS\s*-\s*Ouro$/i, newSubcategory: "aneis-ouro" },
      {
        oldPattern: /^ANEIS\s*-\s*Prata\s*[_\s]*Rodio$/i,
        newSubcategory: "aneis-prata-rodio",
      },
      { oldPattern: /^anel-ouro$/i, newSubcategory: "aneis-ouro" },
      { oldPattern: /^anel-prata$/i, newSubcategory: "aneis-prata-rodio" },
    ],
  },
  {
    category: "brincos",
    patterns: [
      { oldPattern: /^BRINCO\s*-\s*Ouro$/i, newSubcategory: "brincos-ouro" },
      {
        oldPattern: /^BRINCO\s*-\s*Prata\s*[_\s]*Rodio$/i,
        newSubcategory: "brincos-prata-rodio",
      },
      { oldPattern: /^brinco-ouro$/i, newSubcategory: "brincos-ouro" },
      { oldPattern: /^brinco-prata$/i, newSubcategory: "brincos-prata-rodio" },
    ],
  },
  {
    category: "colares",
    patterns: [
      { oldPattern: /^COLAR\s*-\s*Ouro$/i, newSubcategory: "colares-ouro" },
      {
        oldPattern: /^COLAR\s*-\s*Prata\s*[_\s]*Rodio$/i,
        newSubcategory: "colares-prata-rodio",
      },
      { oldPattern: /^COLAR\s*-\s*Aço$/i, newSubcategory: "colares-aco" },
      { oldPattern: /^colar-ouro$/i, newSubcategory: "colares-ouro" },
      { oldPattern: /^colar-prata$/i, newSubcategory: "colares-prata-rodio" },
    ],
  },
  {
    category: "conjuntos",
    patterns: [
      {
        oldPattern: /^CONJJ?UNTO\s+colar\s+e\s+brinco\s+OURO$/i,
        newSubcategory: "conjuntos-ouro",
      },
      {
        oldPattern: /^CONJJ?UNTO\s+colar\s+e\s+brinco\s+PRATA$/i,
        newSubcategory: "conjuntos-prata",
      },
      {
        oldPattern: /^CONJUNTOS?\s*-\s*Ouro$/i,
        newSubcategory: "conjuntos-ouro",
      },
      {
        oldPattern: /^CONJUNTO\s*-\s*Prata\s*[_\s]*Rodio$/i,
        newSubcategory: "conjuntos-prata-rodio",
      },
      { oldPattern: /^conjunto-ouro$/i, newSubcategory: "conjuntos-ouro" },
      { oldPattern: /^conjunto-prata$/i, newSubcategory: "conjuntos-prata" },
    ],
  },
  {
    category: "pulseiras",
    patterns: [
      {
        oldPattern: /^PULSEIRA\s*-\s*Ouro$/i,
        newSubcategory: "pulseiras-ouro",
      },
      {
        oldPattern: /^PULSEIRA\s*-\s*Prata\s*[_\s]*Rodio$/i,
        newSubcategory: "pulseiras-prata-rodio",
      },
      { oldPattern: /^pulseira-ouro$/i, newSubcategory: "pulseiras-ouro" },
      {
        oldPattern: /^pulseira-prata$/i,
        newSubcategory: "pulseiras-prata-rodio",
      },
    ],
  },
  {
    category: "tornezeleiras",
    patterns: [
      {
        oldPattern: /^TORNOZELEIRA\s*-\s*Ouro$/i,
        newSubcategory: "tornezeleiras-ouro",
      },
      {
        oldPattern: /^TORNOZELEIRA\s*-\s*Prata\s*[_\s]*Rodio$/i,
        newSubcategory: "tornezeleiras-prata-rodio",
      },
      {
        oldPattern: /^tornozeleira-ouro$/i,
        newSubcategory: "tornezeleiras-ouro",
      },
      {
        oldPattern: /^tornozeleira-prata$/i,
        newSubcategory: "tornezeleiras-prata-rodio",
      },
    ],
  },
  {
    category: "pingentes",
    patterns: [
      {
        oldPattern: /^PINGENTE\s*-\s*Ouro$/i,
        newSubcategory: "pingentes-ouro",
      },
      {
        oldPattern: /^PINGENTE\s*-\s*Prata\s*[_\s]*Rodio$/i,
        newSubcategory: "pingentes-prata-rodio",
      },
      { oldPattern: /^pingente-ouro$/i, newSubcategory: "pingentes-ouro" },
      {
        oldPattern: /^pingente-prata$/i,
        newSubcategory: "pingentes-prata-rodio",
      },
    ],
  },
  {
    category: "acessorios",
    patterns: [
      { oldPattern: /^ACESSORIOS?$/i, newSubcategory: "acessorios" },
    ],
  },
  {
    category: "braceletes",
    patterns: [
      { oldPattern: /^bracelete-ouro$/i, newSubcategory: "braceletes-ouro" },
      { oldPattern: /^bracelete-prata$/i, newSubcategory: "braceletes-prata" },
    ],
  },
];

/**
 * Normaliza string para formato de pasta (minúsculas, sem espaços extras)
 */
function normalizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Encontra o mapeamento correto para um nome de pasta
 */
function findMapping(folderName: string): {
  category: string;
  subcategory: string;
} | null {
  for (const mapping of CATEGORY_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (pattern.oldPattern.test(folderName)) {
        return {
          category: mapping.category,
          subcategory: pattern.newSubcategory,
        };
      }
    }
  }
  return null;
}

/**
 * Gera o novo nome da pasta no formato [categoria][categoria-subcategoria]
 */
function generateNewName(category: string, subcategory: string): string {
  return `[${category}][${subcategory}]`;
}

/**
 * Lista todos os diretórios recursivamente
 */
async function getAllDirectories(
  rootDir: string,
  currentDir: string = rootDir
): Promise<string[]> {
  const directories: string[] = [];
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      directories.push(fullPath);
      // Recursivamente buscar subdiretórios
      const subDirs = await getAllDirectories(rootDir, fullPath);
      directories.push(...subDirs);
    }
  }

  return directories;
}

/**
 * Renomeia uma pasta
 */
async function renameFolder(
  oldPath: string,
  newPath: string
): Promise<boolean> {
  try {
    if (fsSync.existsSync(newPath)) {
      console.error(
        `   ❌ Destino já existe: ${path.basename(newPath)}`
      );
      return false;
    }

    if (!DRY_RUN) {
      await fs.rename(oldPath, newPath);
    }
    return true;
  } catch (error) {
    console.error(
      `   ❌ Erro ao renomear: ${(error as Error).message}`
    );
    return false;
  }
}

/**
 * Processa uma pasta e retorna se precisa renomear
 */
function processFolder(folderPath: string): {
  shouldRename: boolean;
  newName?: string;
  category?: string;
  subcategory?: string;
} {
  const folderName = path.basename(folderPath);
  const parentDir = path.dirname(folderPath);

  // Ignorar pastas que já estão no formato correto
  if (/^\[.+\]\[.+\]$/.test(folderName)) {
    // Verificar se há uma pasta duplicada dentro (ex: [colares][colares-aco]/[colares][colares-aco])
    // Isso não deve acontecer, mas vamos ignorar por enquanto
    return { shouldRename: false };
  }

  // Ignorar pastas numéricas (códigos de produtos)
  if (/^\d+$/.test(folderName)) {
    return { shouldRename: false };
  }

  // Ignorar pastas especiais
  const specialFolders = [
    "images",
    "cadastradas-parte-1",
    "geradas-novas",
    "transfer",
    "prontas2",
    "prontas3",
    "modelo",
    "pedra",
    "organized",
  ];
  if (specialFolders.includes(folderName.toLowerCase())) {
    return { shouldRename: false };
  }

  // Tentar encontrar mapeamento
  const mapping = findMapping(folderName);
  if (!mapping) {
    // Se não encontrou mapeamento, verificar se é uma subpasta que não precisa renomear
    return { shouldRename: false };
  }

  const newName = generateNewName(mapping.category, mapping.subcategory);
  const newPath = path.join(parentDir, newName);

  return {
    shouldRename: true,
    newName,
    category: mapping.category,
    subcategory: mapping.subcategory,
  };
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("📁 PADRONIZAÇÃO DE PASTAS");
  console.log("═══════════════════════════════════════════\n");

  console.log(`⚙️ Configurações:`);
  console.log(`   - Diretório: ${IMAGES_DIR}`);
  console.log(`   - Modo simulação: ${DRY_RUN ? "Sim" : "Não"}\n`);

  if (!fsSync.existsSync(IMAGES_DIR)) {
    console.error(`❌ Diretório não encontrado: ${IMAGES_DIR}`);
    process.exit(1);
  }

  try {
    // Listar todos os diretórios
    console.log("📂 Escaneando diretórios...");
    const allDirs = await getAllDirectories(IMAGES_DIR);
    console.log(`   ✅ Encontrados ${allDirs.length} diretórios\n`);

    // Processar cada diretório
    console.log("🔍 Analisando pastas...\n");
    const toRename: Array<{
      oldPath: string;
      newPath: string;
      oldName: string;
      newName: string;
      category: string;
      subcategory: string;
    }> = [];

    for (const dirPath of allDirs) {
      const result = processFolder(dirPath);
      if (result.shouldRename) {
        const parentDir = path.dirname(dirPath);
        const newPath = path.join(parentDir, result.newName!);
        toRename.push({
          oldPath: dirPath,
          newPath,
          oldName: path.basename(dirPath),
          newName: result.newName!,
          category: result.category!,
          subcategory: result.subcategory!,
        });
      }
    }

    // Agrupar por categoria para exibição
    const byCategory = new Map<
      string,
      Array<{ oldName: string; newName: string }>
    >();
    for (const item of toRename) {
      if (!byCategory.has(item.category)) {
        byCategory.set(item.category, []);
      }
      byCategory.get(item.category)!.push({
        oldName: item.oldName,
        newName: item.newName,
      });
    }

    // Exibir resumo
    console.log("═══════════════════════════════════════════");
    console.log("📊 RESUMO DE RENOMEAÇÕES");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Total de pastas a renomear: ${toRename.length}\n`);

    for (const [category, items] of Array.from(byCategory.entries()).sort()) {
      console.log(`   📁 ${category.toUpperCase()} (${items.length} pastas):`);
      for (const item of items) {
        console.log(`      "${item.oldName}" → "${item.newName}"`);
      }
      console.log();
    }

    if (toRename.length === 0) {
      console.log("✅ Nenhuma pasta precisa ser renomeada!\n");
      return;
    }

    if (DRY_RUN) {
      console.log("🔍 MODO DE SIMULAÇÃO - Nenhuma pasta foi renomeada\n");
      return;
    }

    // Executar renomeações
    console.log("🔄 Renomeando pastas...\n");
    let successCount = 0;
    let errorCount = 0;

    // Ordenar por profundidade (mais profundas primeiro) para evitar problemas
    const sortedToRename = toRename.sort((a, b) => {
      const depthA = a.oldPath.split(path.sep).length;
      const depthB = b.oldPath.split(path.sep).length;
      return depthB - depthA;
    });

    for (const item of sortedToRename) {
      const relativeOld = path.relative(process.cwd(), item.oldPath);
      const relativeNew = path.relative(process.cwd(), item.newPath);

      console.log(`   🔄 "${item.oldName}" → "${item.newName}"`);
      console.log(`      ${relativeOld}`);
      console.log(`      → ${relativeNew}`);

      const success = await renameFolder(item.oldPath, item.newPath);
      if (success) {
        successCount++;
        console.log(`      ✅ Renomeado com sucesso\n`);
      } else {
        errorCount++;
        console.log(`      ❌ Erro ao renomear\n`);
      }
    }

    // Resumo final
    console.log("═══════════════════════════════════════════");
    console.log("✅ PROCESSAMENTO CONCLUÍDO");
    console.log("═══════════════════════════════════════════\n");
    console.log(`   Pastas renomeadas: ${successCount}`);
    console.log(`   Erros: ${errorCount}\n`);
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

