#!/usr/bin/env tsx
/**
 * Script para analisar produtos e categorias no banco de dados
 * Identifica produtos que podem estar nas categorias incorretas
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs/promises";
import * as path from "path";

const DATABASE_URL =
  "postgresql://neondb_owner:npg_OQ8dKPF0SbiY@ep-soft-cake-ad36hicf.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Padrões de palavras-chave para identificar tipos de produtos
const PRODUCT_TYPE_KEYWORDS = {
  anel: ["anel", "anéis", "aneis"],
  brinco: ["brinco", "brincos"],
  colar: ["colar", "colares"],
  pulseira: ["pulseira", "pulseiras"],
  pingente: ["pingente", "pingentes"],
  tornozeleira: ["tornozeleira", "tornozeleiras"],
  gargantilha: ["gargantilha", "gargantilhas"],
  conjunto: ["conjunto", "conjuntos"],
};

// Padrões de palavras-chave para identificar materiais
const MATERIAL_KEYWORDS = {
  ouro: ["ouro", "gold"],
  prata: ["prata", "silver", "925"],
  rodio: ["rodio", "ródio", "rhodium"],
  banhado: ["banhado", "banho"],
};

interface ProductAnalysis {
  id: number;
  sku: string;
  name: string;
  categoryName: string;
  parentCategoryName: string | null;
  detectedType: string | null;
  detectedMaterial: string | null;
  categoryType: string | null;
  categoryMaterial: string | null;
  issue: string;
  confidence: "high" | "medium" | "low";
}

function detectProductType(productName: string): string | null {
  const lowerName = productName.toLowerCase();
  for (const [type, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => lowerName.includes(keyword))) {
      return type;
    }
  }
  return null;
}

function detectMaterial(productName: string): string | null {
  const lowerName = productName.toLowerCase();
  for (const [material, keywords] of Object.entries(MATERIAL_KEYWORDS)) {
    if (keywords.some((keyword) => lowerName.includes(keyword))) {
      return material;
    }
  }
  return null;
}

function extractCategoryInfo(categoryName: string): {
  type: string | null;
  material: string | null;
} {
  const lowerName = categoryName.toLowerCase();
  let type: string | null = null;
  let material: string | null = null;

  // Detectar tipo na categoria
  for (const [productType, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => lowerName.includes(keyword))) {
      type = productType;
      break;
    }
  }

  // Detectar material na categoria
  for (const [mat, keywords] of Object.entries(MATERIAL_KEYWORDS)) {
    if (keywords.some((keyword) => lowerName.includes(keyword))) {
      material = mat;
      break;
    }
  }

  return { type, material };
}

function analyzeProduct(
  product: {
    id: number;
    sku: string;
    name: string;
    category: {
      name: string;
      parent: { name: string } | null;
    };
  }
): ProductAnalysis | null {
  const detectedType = detectProductType(product.name);
  const detectedMaterial = detectMaterial(product.name);

  // Analisar categoria e categoria pai
  const categoryInfo = extractCategoryInfo(product.category.name);
  const parentCategoryInfo = product.category.parent
    ? extractCategoryInfo(product.category.parent.name)
    : { type: null, material: null };

  // Usar categoria pai para tipo se não encontrado na categoria filha
  const categoryType = categoryInfo.type || parentCategoryInfo.type;
  const categoryMaterial = categoryInfo.material || parentCategoryInfo.material;

  // Verificar inconsistências
  const issues: string[] = [];
  let confidence: "high" | "medium" | "low" = "low";

  // Verificar tipo do produto vs categoria
  if (detectedType && categoryType && detectedType !== categoryType) {
    issues.push(
      `Tipo detectado no nome ("${detectedType}") não corresponde à categoria ("${categoryType}")`
    );
    confidence = "high";
  }

  // Verificar se produto tem tipo mas categoria não tem tipo definido
  if (detectedType && !categoryType) {
    issues.push(
      `Produto parece ser "${detectedType}" mas categoria não indica tipo específico`
    );
    confidence = "medium";
  }

  // Verificar material do produto vs categoria
  if (detectedMaterial && categoryMaterial && detectedMaterial !== categoryMaterial) {
    // Exceção: "banhado" pode estar em categoria "ouro" ou "prata"
    if (
      !(
        detectedMaterial === "banhado" &&
        (categoryMaterial === "ouro" || categoryMaterial === "prata")
      )
    ) {
      issues.push(
        `Material detectado no nome ("${detectedMaterial}") não corresponde à categoria ("${categoryMaterial}")`
      );
      confidence = confidence === "high" ? "high" : "medium";
    }
  }

  // Verificar se categoria tem tipo mas produto não indica tipo
  if (categoryType && !detectedType) {
    issues.push(
      `Categoria indica tipo "${categoryType}" mas nome do produto não menciona tipo`
    );
    confidence = "low";
  }

  if (issues.length === 0) {
    return null;
  }

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryName: product.category.name,
    parentCategoryName: product.category.parent?.name || null,
    detectedType,
    detectedMaterial,
    categoryType,
    categoryMaterial,
    issue: issues.join("; "),
    confidence,
  };
}

async function main() {
  console.log("\n========================================");
  console.log("   ANÁLISE DE PRODUTOS E CATEGORIAS");
  console.log("========================================\n");

  // Inicializar Prisma
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log("✓ Conectado ao banco de dados\n");

    // Buscar todos os produtos ativos com suas categorias
    console.log("Buscando produtos do banco de dados...");
    const products = await prisma.product.findMany({
      where: {
        isDeleted: false,
        isActive: true,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        category: {
          select: {
            name: true,
            parent: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    console.log(`✓ ${products.length} produtos encontrados\n`);

    // Analisar cada produto
    console.log("Analisando produtos...");
    const issues: ProductAnalysis[] = [];
    const stats = {
      total: products.length,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      byCategory: {} as Record<string, number>,
    };

    for (const product of products) {
      const analysis = analyzeProduct(product);
      if (analysis) {
        issues.push(analysis);
        stats[`${analysis.confidence}Confidence`]++;
        const categoryKey = analysis.parentCategoryName
          ? `${analysis.parentCategoryName} > ${analysis.categoryName}`
          : analysis.categoryName;
        stats.byCategory[categoryKey] = (stats.byCategory[categoryKey] || 0) + 1;
      }
    }

    console.log(`✓ Análise concluída\n`);

    // Exibir estatísticas
    console.log("=".repeat(60));
    console.log("ESTATÍSTICAS");
    console.log("=".repeat(60));
    console.log(`Total de produtos analisados: ${stats.total}`);
    console.log(`Produtos com possíveis problemas: ${issues.length}`);
    console.log(`  - Alta confiança: ${stats.highConfidence}`);
    console.log(`  - Média confiança: ${stats.mediumConfidence}`);
    console.log(`  - Baixa confiança: ${stats.lowConfidence}`);
    console.log("");

    // Agrupar por categoria
    if (Object.keys(stats.byCategory).length > 0) {
      console.log("Problemas por categoria:");
      const sortedCategories = Object.entries(stats.byCategory).sort(
        (a, b) => b[1] - a[1]
      );
      for (const [category, count] of sortedCategories) {
        console.log(`  ${category}: ${count} produto(s)`);
      }
      console.log("");
    }

    // Exibir produtos com problemas (alta e média confiança primeiro)
    const sortedIssues = issues.sort((a, b) => {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    });

    console.log("=".repeat(60));
    console.log("PRODUTOS COM POSSÍVEIS PROBLEMAS");
    console.log("=".repeat(60));

    if (sortedIssues.length === 0) {
      console.log("\n✓ Nenhum problema detectado!\n");
    } else {
      // Agrupar por nível de confiança
      const highConfidenceIssues = sortedIssues.filter((i) => i.confidence === "high");
      const mediumConfidenceIssues = sortedIssues.filter(
        (i) => i.confidence === "medium"
      );
      const lowConfidenceIssues = sortedIssues.filter((i) => i.confidence === "low");

      if (highConfidenceIssues.length > 0) {
        console.log("\n🔴 ALTA CONFIANÇA (revisar prioritariamente):");
        console.log("-".repeat(60));
        for (const issue of highConfidenceIssues) {
          console.log(`\nSKU: ${issue.sku}`);
          console.log(`Nome: ${issue.name}`);
          console.log(
            `Categoria: ${issue.parentCategoryName ? `${issue.parentCategoryName} > ` : ""}${issue.categoryName}`
          );
          console.log(`Problema: ${issue.issue}`);
          console.log(
            `Detalhes: Tipo detectado="${issue.detectedType || "N/A"}", Material detectado="${issue.detectedMaterial || "N/A"}", Tipo categoria="${issue.categoryType || "N/A"}", Material categoria="${issue.categoryMaterial || "N/A"}"`
          );
        }
      }

      if (mediumConfidenceIssues.length > 0) {
        console.log("\n🟡 MÉDIA CONFIANÇA:");
        console.log("-".repeat(60));
        for (const issue of mediumConfidenceIssues.slice(0, 20)) {
          // Limitar a 20 para não sobrecarregar
          console.log(`\nSKU: ${issue.sku}`);
          console.log(`Nome: ${issue.name}`);
          console.log(
            `Categoria: ${issue.parentCategoryName ? `${issue.parentCategoryName} > ` : ""}${issue.categoryName}`
          );
          console.log(`Problema: ${issue.issue}`);
        }
        if (mediumConfidenceIssues.length > 20) {
          console.log(
            `\n... e mais ${mediumConfidenceIssues.length - 20} produto(s) com média confiança`
          );
        }
      }

      if (lowConfidenceIssues.length > 0) {
        console.log("\n🟢 BAIXA CONFIANÇA (apenas informativo):");
        console.log(`  ${lowConfidenceIssues.length} produto(s) com baixa confiança`);
        console.log("  (ver relatório completo para detalhes)");
      }
    }

    // Salvar relatório completo em JSON
    const reportPath = path.join(
      process.cwd(),
      `category-analysis-${new Date().toISOString().split("T")[0]}.json`
    );
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          stats,
          issues: sortedIssues,
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log(`\n✓ Relatório completo salvo em: ${reportPath}\n`);

    // Salvar relatório resumido em texto
    const textReportPath = path.join(
      process.cwd(),
      `category-analysis-${new Date().toISOString().split("T")[0]}.txt`
    );
    let textReport = "RELATÓRIO DE ANÁLISE DE CATEGORIAS\n";
    textReport += "=".repeat(60) + "\n\n";
    textReport += `Data: ${new Date().toISOString()}\n`;
    textReport += `Total de produtos: ${stats.total}\n`;
    textReport += `Produtos com problemas: ${issues.length}\n\n`;

    textReport += "ESTATÍSTICAS POR CONFIANÇA:\n";
    textReport += `- Alta: ${stats.highConfidence}\n`;
    textReport += `- Média: ${stats.mediumConfidence}\n`;
    textReport += `- Baixa: ${stats.lowConfidence}\n\n`;

    textReport += "PRODUTOS COM PROBLEMAS:\n";
    textReport += "=".repeat(60) + "\n\n";
    for (const issue of sortedIssues) {
      textReport += `[${issue.confidence.toUpperCase()}] SKU: ${issue.sku}\n`;
      textReport += `Nome: ${issue.name}\n`;
      textReport += `Categoria: ${issue.parentCategoryName ? `${issue.parentCategoryName} > ` : ""}${issue.categoryName}\n`;
      textReport += `Problema: ${issue.issue}\n`;
      textReport += `Detalhes: Tipo="${issue.detectedType || "N/A"}", Material="${issue.detectedMaterial || "N/A"}", Cat.Tipo="${issue.categoryType || "N/A"}", Cat.Material="${issue.categoryMaterial || "N/A"}"\n`;
      textReport += "\n";
    }

    await fs.writeFile(textReportPath, textReport, "utf-8");
    console.log(`✓ Relatório em texto salvo em: ${textReportPath}\n`);
  } catch (error) {
    console.error("Erro:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();



