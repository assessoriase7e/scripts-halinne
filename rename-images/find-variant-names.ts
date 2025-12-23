import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/**
 * Script para encontrar arquivos com nomes que parecem ser variantes
 * (cores, materiais, estilos, etc.)
 */

const ORGANIZED_DIR = "rename-images/organized";

/**
 * Lista de palavras-chave que indicam variantes
 */
const VARIANT_KEYWORDS = {
  // Cores
  colors: [
    'vermelho', 'vermelha', 'red',
    'azul', 'blue',
    'verde', 'green',
    'amarelo', 'amarela', 'yellow',
    'preto', 'preta', 'black',
    'branco', 'branca', 'white',
    'rosa', 'pink',
    'roxo', 'roxa', 'purple',
    'laranja', 'orange',
    'marrom', 'brown',
    'cinza', 'grey', 'gray',
    'prata', 'silver',
    'ouro', 'gold',
    'dourado', 'dourada',
    'bege',
    'turquesa',
    'coral',
    'bordô',
    'vinho',
    'navy',
    'indigo',
    'ciano',
    'magenta',
    'lilas',
    'salmon',
    'teal',
    'olive',
    'khaki',
    'cream',
    'ivory',
    'champagne',
    'nude',
    'pastel'
  ],

  // Materiais/Tipos
  materials: [
    'pedra', 'stone',
    'cristal', 'crystal',
    'vidro', 'glass',
    'ceramica', 'ceramic',
    'metal', 'metalico',
    'aco', 'steel',
    'inox',
    'bronze',
    'cobre', 'copper',
    'platina', 'platinum',
    'titanio', 'titanium',
    'zirconio', 'zirconium',
    'quartzo', 'quartz',
    'madreperola', 'mother',
    'concha', 'shell',
    'couro', 'leather',
    'tecido', 'fabric',
    'seda', 'silk',
    'algodao', 'cotton',
    'lã', 'wool',
    'feltro', 'felt'
  ],

  // Estilos/Formas
  styles: [
    'redondo', 'round',
    'quadrado', 'square',
    'retangular', 'rectangular',
    'oval', 'ovalado',
    'coracao', 'heart',
    'estrela', 'star',
    'flor', 'flower',
    'folha', 'leaf',
    'sol', 'sun',
    'lua', 'moon',
    'animal',
    'geometria', 'geometric',
    'abstrato', 'abstract',
    'classico', 'classic',
    'moderno', 'modern',
    'vintage',
    'antigo', 'old',
    'novo', 'new',
    'delicado', 'delicate',
    'fino', 'fine',
    'grosso', 'thick',
    'leve', 'light',
    'pesado', 'heavy',
    'pequeno', 'small',
    'grande', 'large',
    'medio', 'medium'
  ],

  // Outros descritores
  other: [
    'brilhante', 'brilliant', 'shiny',
    'fosco', 'matte', 'dull',
    'transparente', 'transparent',
    'opaco', 'opaque',
    'brilhoso', 'glossy',
    'acetinado', 'satin',
    'polid', 'polished',
    'gravado', 'engraved',
    'esculpido', 'sculpted',
    'talhado', 'carved',
    'pintado', 'painted',
    'bordado', 'embroidered',
    'cravejado', 'set',
    'incrustado', 'inlaid',
    'folhado', 'gold-plated',
    'banhado', 'plated',
    'revestido', 'coated',
    'esmaltado', 'enameled',
    'glitter', 'brilhoso',
    'lustroso', 'lustrous',
    'iridescente', 'iridescent'
  ],

  // Sufixos especiais
  special: [
    'ad', 'AD',
    'p', 'P',
    'm', 'M',
    't', 'T',
    'g', 'G',
    'tp', 'Tp',
    'png', 'Png', // casos estranhos
    'trans', 'TRANS'
  ]
};

/**
 * Analisa um nome de arquivo e identifica variantes
 */
function analyzeVariant(fileName: string): {
  variants: string[];
  variantTypes: string[];
} {
  const variants: string[] = [];
  const variantTypes: string[] = [];
  const nameWithoutExt = path.basename(fileName, path.extname(fileName)).toLowerCase();

  // Verificar todas as categorias de variantes
  for (const [category, keywords] of Object.entries(VARIANT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (nameWithoutExt.includes(keyword.toLowerCase())) {
        if (!variants.includes(keyword)) {
          variants.push(keyword);
          if (!variantTypes.includes(category)) {
            variantTypes.push(category);
          }
        }
      }
    }
  }

  return { variants, variantTypes };
}

/**
 * Processa uma pasta recursivamente
 */
async function processDirectory(dirPath: string): Promise<Array<{
  fullPath: string;
  relativePath: string;
  fileName: string;
  variants: string[];
  variantTypes: string[];
}>> {
  const variantFiles: Array<{
    fullPath: string;
    relativePath: string;
    fileName: string;
    variants: string[];
    variantTypes: string[];
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
            const analysis = analyzeVariant(entry.name);
            if (analysis.variants.length > 0) {
              const relativePath = path.relative(ORGANIZED_DIR, fullPath);
              variantFiles.push({
                fullPath,
                relativePath,
                fileName: entry.name,
                variants: analysis.variants,
                variantTypes: analysis.variantTypes,
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
  return variantFiles;
}

/**
 * Função principal
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("🎨 BUSCA DE ARQUIVOS COM VARIANTES");
  console.log("═══════════════════════════════════════════\n");

  console.log(`📂 Diretório: ${ORGANIZED_DIR}\n`);

  if (!fsSync.existsSync(ORGANIZED_DIR)) {
    console.error(`❌ Diretório não encontrado: ${ORGANIZED_DIR}`);
    process.exit(1);
  }

  try {
    console.log("🔄 Analisando nomes de arquivos...\n");

    const variantFiles = await processDirectory(ORGANIZED_DIR);

    if (variantFiles.length === 0) {
      console.log("⚠️ Nenhum arquivo com variantes encontrado!\n");
      return;
    }

    // Agrupar por tipo de variante
    const variantsByType = new Map<string, Array<{
      fileName: string;
      relativePath: string;
      variants: string[];
    }>>();

    for (const file of variantFiles) {
      for (const type of file.variantTypes) {
        if (!variantsByType.has(type)) {
          variantsByType.set(type, []);
        }
        variantsByType.get(type)!.push({
          fileName: file.fileName,
          relativePath: file.relativePath,
          variants: file.variants,
        });
      }
    }

    // Resumo
    console.log("═══════════════════════════════════════════");
    console.log("📊 RESUMO DAS VARIANTES ENCONTRADAS");
    console.log("═══════════════════════════════════════════\n");

    console.log(`   Total de arquivos com variantes: ${variantFiles.length}\n`);

    // Mostrar estatísticas por tipo
    for (const [type, files] of variantsByType.entries()) {
      console.log(`   🎨 ${type.toUpperCase()}: ${files.length} arquivo(s)`);
    }

    console.log("\n═══════════════════════════════════════════");
    console.log("📋 DETALHES DOS ARQUIVOS");
    console.log("═══════════════════════════════════════════\n");

    // Filtrar apenas arquivos com variantes reais (excluindo apenas sufixos especiais)
    const realVariantFiles = variantFiles.filter(file => {
      // Excluir arquivos que têm apenas sufixos especiais
      const realVariants = file.variants.filter(v =>
        !['p', 'P', 'm', 'M', 't', 'T', 'g', 'G', 'ad', 'AD', 'tp', 'Tp', 'png', 'Png'].includes(v)
      );
      return realVariants.length > 0;
    });

    console.log(`   Arquivos com variantes reais (excluindo sufixos): ${realVariantFiles.length}\n`);

    // Mostrar detalhes dos arquivos com variantes reais
    const maxFilesToShow = 50;
    const filesToShow = realVariantFiles.slice(0, maxFilesToShow);

    for (const file of filesToShow) {
      console.log(`   📄 ${file.relativePath}`);
      console.log(`      Variantes encontradas: ${file.variants.join(", ")}`);
      console.log(`      Tipos: ${file.variantTypes.join(", ")}`);
      console.log();
    }

    if (variantFiles.length > maxFilesToShow) {
      console.log(`   ... e mais ${variantFiles.length - maxFilesToShow} arquivos`);
      console.log();
    }

    // Estatísticas gerais
    console.log("═══════════════════════════════════════════");
    console.log("📈 ESTATÍSTICAS GERAIS");
    console.log("═══════════════════════════════════════════\n");

    // Contar variantes mais comuns (apenas variantes reais)
    const variantCount = new Map<string, number>();
    for (const file of realVariantFiles) {
      for (const variant of file.variants) {
        variantCount.set(variant, (variantCount.get(variant) || 0) + 1);
      }
    }

    console.log("   Variantes reais mais comuns:");
    const sortedVariants = Array.from(variantCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    for (const [variant, count] of sortedVariants) {
      console.log(`      ${variant}: ${count} ocorrência(s)`);
    }

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

