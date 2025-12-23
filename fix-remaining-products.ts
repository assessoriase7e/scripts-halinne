#!/usr/bin/env tsx
/**
 * Script para analisar e corrigir manualmente produtos com problemas
 * Executa um comando inline para cada produto problemático
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";

const DATABASE_URL =
  "postgresql://neondb_owner:npg_OQ8dKPF0SbiY@ep-soft-cake-ad36hicf.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const STORE_ID = 1;

// Mapeamento de tipos de produtos
const PRODUCT_TYPES = ["anel", "brinco", "colar", "pulseira", "pingente", "tornozeleira", "gargantilha", "conjunto", "bracelete"];
const MATERIALS = ["ouro", "prata", "rodio", "aco"];

interface ProblematicProduct {
  id: number;
  sku: string;
  name: string;
  currentCategoryName: string;
  currentParentName: string | null;
  detectedType: string | null;
  detectedMaterial: string | null;
  issue: string;
}

function analyzeProductName(productName: string): {
  type: string | null;
  material: string | null;
  confidence: string;
  analysis: string[];
} {
  const lowerName = productName.toLowerCase();
  const analysis: string[] = [];

  // Detectar tipo
  let type: string | null = null;
  for (const t of PRODUCT_TYPES) {
    if (lowerName.includes(t)) {
      type = t;
      analysis.push(`📌 Tipo detectado: "${type}" (encontrado em "${productName}")`);
      break;
    }
  }

  if (!type) {
    analysis.push(`⚠️ Tipo não identificado no nome`);
  }

  // Detectar material
  let material: string | null = null;
  let materialConfidence = "low";

  if (lowerName.includes("prata") || lowerName.includes("925")) {
    material = "prata";
    materialConfidence = "high";
    analysis.push(`💎 Material detectado: "prata" (alta confiança)`);
  } else if (lowerName.includes("rodio") || lowerName.includes("ródio")) {
    material = "rodio";
    materialConfidence = "high";
    analysis.push(`💎 Material detectado: "ródio" (alta confiança)`);
  } else if (lowerName.includes("ouro") || lowerName.includes("banh") || lowerName.includes("18k")) {
    material = "ouro";
    materialConfidence = "high";
    analysis.push(`💎 Material detectado: "ouro" (alta confiança)`);
  } else if (lowerName.includes("aco") || lowerName.includes("aço")) {
    material = "aco";
    materialConfidence = "high";
    analysis.push(`💎 Material detectado: "aço" (alta confiança)`);
  }

  if (!material) {
    analysis.push(`⚠️ Material não identificado no nome`);
    materialConfidence = "low";
  }

  let overallConfidence = "low";
  if (type && material) {
    overallConfidence = "high";
  } else if (type || material) {
    overallConfidence = "medium";
  }

  return { type, material, confidence: overallConfidence, analysis };
}

async function suggestCategory(
  type: string | null,
  material: string | null
): Promise<{ parentName: string; childName: string } | null> {
  if (!type) return null;

  // Mapeamento de tipos para categorias pai
  const typeMapping: Record<string, string> = {
    anel: "Aneis",
    brinco: "Brincos",
    colar: "Colares",
    pulseira: "Pulseiras",
    pingente: "Pingentes",
    tornozeleira: "Tornozeleiras",
    gargantilha: "Acessorios",
    conjunto: "Conjuntos",
    bracelete: "Braceletes",
  };

  const parentName = typeMapping[type] || type;
  let childName = `${type.charAt(0).toUpperCase() + type.slice(1)}`;

  // Adicionar material ao nome da categoria filha
  if (material === "prata" || material === "rodio") {
    childName = `${parentName} Prata Rodio`;
  } else if (material === "ouro") {
    childName = `${parentName} Ouro`;
  } else if (material === "aco") {
    childName = `${parentName} Aco`;
  } else {
    childName = `${parentName} Ouro`; // Default
  }

  return { parentName, childName };
}

async function displayProduct(product: ProblematicProduct): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log(`ANÁLISE: ${product.sku}`);
  console.log("=".repeat(80));
  console.log(`📦 Nome do produto: "${product.name}"`);
  console.log(
    `📂 Categoria atual: ${product.currentParentName ? `${product.currentParentName} > ` : ""}${product.currentCategoryName}`
  );
  console.log(`❌ Problema: ${product.issue}\n`);

  // Analisar nome
  const analysis = analyzeProductName(product.name);
  console.log("Análise do nome:");
  for (const line of analysis.analysis) {
    console.log(`  ${line}`);
  }
  console.log(`  Confiança geral: ${analysis.confidence}\n`);

  // Sugerir categoria
  const suggestion = await suggestCategory(analysis.type, analysis.material);
  if (suggestion) {
    console.log(`✅ Categoria sugerida: ${suggestion.parentName} > ${suggestion.childName}`);
  } else {
    console.log(`⚠️ Não foi possível sugerir uma categoria (tipo não identificado)`);
  }
}

async function promptForFix(
  prisma: PrismaClient,
  product: ProblematicProduct
): Promise<boolean> {
  // Analisar nome
  const analysis = analyzeProductName(product.name);
  const suggestion = await suggestCategory(analysis.type, analysis.material);

  if (!suggestion) {
    console.log(
      `\n⏭️  Pulando produto ${product.sku} (não foi possível determinar categoria)`
    );
    return false;
  }

  // Buscar ou criar categoria
  const parentSlug = suggestion.parentName.toLowerCase().replace(/\s+/g, "-");
  const childSlug = suggestion.childName.toLowerCase().replace(/\s+/g, "-");

  // Buscar categoria pai
  let parentCategory = await prisma.category.findFirst({
    where: {
      name: { equals: suggestion.parentName, mode: "insensitive" },
      parentId: null,
      storeId: STORE_ID,
      isDeleted: false,
    },
  });

  if (!parentCategory) {
    parentCategory = await prisma.category.create({
      data: {
        name: suggestion.parentName,
        slug: parentSlug,
        storeId: STORE_ID,
        cashbackValue: 0,
        cashbackPercent: 0,
        status: "active",
      },
    });
    console.log(`\n✅ Categoria pai criada: "${suggestion.parentName}"`);
  }

  // Buscar ou criar categoria filha
  let childCategory = await prisma.category.findFirst({
    where: {
      name: { equals: suggestion.childName, mode: "insensitive" },
      parentId: parentCategory.id,
      storeId: STORE_ID,
      isDeleted: false,
    },
  });

  if (!childCategory) {
    childCategory = await prisma.category.create({
      data: {
        name: suggestion.childName,
        slug: childSlug,
        storeId: STORE_ID,
        parentId: parentCategory.id,
        cashbackValue: 0,
        cashbackPercent: 0,
        status: "active",
      },
    });
    console.log(`✅ Categoria filha criada: "${suggestion.childName}"`);
  }

  // Atualizar produto
  await prisma.product.update({
    where: { id: product.id },
    data: { categoryId: childCategory.id },
  });

  console.log(
    `✅ ${product.sku} movido para "${suggestion.parentName} > ${suggestion.childName}"`
  );
  return true;
}

async function main() {
  console.log("\n========================================");
  console.log("   CORREÇÃO MANUAL DE PRODUTOS");
  console.log("========================================\n");

  // Carregar últimas análises
  const reportPath = path.join(process.cwd(), "category-analysis-2025-12-23.json");
  const reportContent = await fs.readFile(reportPath, "utf-8");
  const report = JSON.parse(reportContent);

  // Filtrar apenas produtos de média confiança (são os falsos positivos — ródio vs prata)
  const problematicProducts = report.issues
    .filter((issue: any) => issue.confidence === "medium")
    .slice(0, 50); // Limitar a 50 primeiros para não ser excessivo

  if (problematicProducts.length === 0) {
    console.log("✅ Nenhum produto para corrigir!\n");
    process.exit(0);
  }

  console.log(`Total de produtos para análise: ${problematicProducts.length}\n`);

  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log("✓ Conectado ao banco de dados\n");

    let corrected = 0;
    let skipped = 0;

    for (let i = 0; i < problematicProducts.length; i++) {
      const issue = problematicProducts[i];

      // Buscar produto no banco
      const product = await prisma.product.findUnique({
        where: { id: issue.id },
        include: {
          category: {
            include: {
              parent: true,
            },
          },
        },
      });

      if (!product) {
        console.log(`⏭️  Produto ${issue.sku} não encontrado`);
        skipped++;
        continue;
      }

      // Exibir análise
      const problematicProduct: ProblematicProduct = {
        id: product.id,
        sku: issue.sku,
        name: issue.name,
        currentCategoryName: product.category.name,
        currentParentName: product.category.parent?.name || null,
        detectedType: issue.detectedType,
        detectedMaterial: issue.detectedMaterial,
        issue: issue.issue,
      };

      await displayProduct(problematicProduct);

      // Corrigir
      const fixed = await promptForFix(prisma, problematicProduct);
      if (fixed) {
        corrected++;
      } else {
        skipped++;
      }

      // Mostrar progresso
      console.log(`\n[${i + 1}/${problematicProducts.length}] Processado`);

      // Pequeno delay para não sobrecarregar
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("\n" + "=".repeat(80));
    console.log("RESUMO");
    console.log("=".repeat(80));
    console.log(`Produtos corrigidos: ${corrected}`);
    console.log(`Produtos pulados: ${skipped}`);
    console.log("=".repeat(80) + "\n");
  } catch (error) {
    console.error("Erro:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();



