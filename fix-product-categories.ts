#!/usr/bin/env tsx
/**
 * Script para corrigir categorias de produtos baseado no levantamento
 * Corrige manualmente cada produto, criando categorias quando necessário
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs/promises";
import * as path from "path";

const DATABASE_URL =
  "postgresql://neondb_owner:npg_OQ8dKPF0SbiY@ep-soft-cake-ad36hicf.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const STORE_ID = 1;

// Mapeamento de tipos de produtos para nomes de categorias
const CATEGORY_MAPPING: Record<string, { parent: string; child: string }> = {
  anel: { parent: "Aneis", child: "Aneis" },
  brinco: { parent: "Brincos", child: "Brincos" },
  colar: { parent: "Colares", child: "Colares" },
  pulseira: { parent: "Pulseiras", child: "Pulseiras" },
  pingente: { parent: "Pingentes", child: "Pingentes" },
  tornozeleira: { parent: "Tornozeleiras", child: "Tornozeleiras" },
  gargantilha: { parent: "Acessorios", child: "Gargantilhas" },
  conjunto: { parent: "Conjuntos", child: "Conjuntos" },
  bracelete: { parent: "Braceletes", child: "Braceletes" },
};

// Mapeamento de materiais para sufixos de categoria
// Baseado na estrutura de pastas: [tipo][tipo-material]
const MATERIAL_MAPPING: Record<string, string> = {
  prata: "Prata Rodio", // Produtos de prata vão para categoria "Prata Rodio"
  rodio: "Prata Rodio", // Produtos de ródio também vão para "Prata Rodio"
  ouro: "Ouro",
  banhado: "Ouro", // Banhado a ouro vai para categoria Ouro
};

function detectProductType(productName: string): string | null {
  const lowerName = productName.toLowerCase();
  for (const [type] of Object.entries(CATEGORY_MAPPING)) {
    if (lowerName.includes(type)) {
      return type;
    }
  }
  return null;
}

function detectMaterial(productName: string): string | null {
  const lowerName = productName.toLowerCase();

  // Verificar prata primeiro (mais específico)
  if (lowerName.includes("prata") || lowerName.includes("925")) {
    return "prata";
  }

  // Verificar ródio
  if (lowerName.includes("rodio") || lowerName.includes("ródio")) {
    return "rodio";
  }

  // Verificar ouro/banhado
  if (lowerName.includes("ouro") || lowerName.includes("banh") || lowerName.includes("gold")) {
    return "ouro";
  }

  return null;
}

function getTargetCategory(
  productType: string | null,
  material: string | null,
  currentCategory: string,
  currentParent: string | null
): { parentName: string; childName: string } | null {
  if (!productType) {
    return null;
  }

  const mapping = CATEGORY_MAPPING[productType];
  if (!mapping) {
    return null;
  }

  const parentName = mapping.parent;
  let childName = mapping.child;

  // Adicionar sufixo de material
  if (material) {
    const materialSuffix = MATERIAL_MAPPING[material] || "Ouro";
    childName = `${childName} ${materialSuffix}`;
  } else {
    // Se não detectou material, manter o padrão (assumir Ouro se não especificado)
    childName = `${childName} Ouro`;
  }

  return { parentName, childName };
}

async function getOrCreateCategory(
  prisma: PrismaClient,
  name: string,
  parentId: number | null
): Promise<number> {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  // Verificar se já existe por slug
  let category = await prisma.category.findUnique({
    where: { slug },
  });

  if (category) {
    return category.id;
  }

  // Verificar se existe por nome (case-insensitive) e mesmo parentId
  const existing = await prisma.category.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      parentId: parentId,
      storeId: STORE_ID,
      isDeleted: false,
    },
  });

  if (existing) {
    return existing.id;
  }

  // Criar nova categoria
  category = await prisma.category.create({
    data: {
      name,
      slug,
      storeId: STORE_ID,
      cashbackValue: 0,
      cashbackPercent: 0,
      status: "active",
      parentId,
    },
  });

  return category.id;
}

async function main() {
  console.log("\n========================================");
  console.log("   CORREÇÃO DE CATEGORIAS DE PRODUTOS");
  console.log("========================================\n");

  // Carregar relatório
  const reportPath = path.join(
    process.cwd(),
    "category-analysis-2025-12-23.json"
  );
  const reportContent = await fs.readFile(reportPath, "utf-8");
  const report = JSON.parse(reportContent);

  // Inicializar Prisma
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log("✓ Conectado ao banco de dados\n");

    // Filtrar apenas produtos de alta e média confiança
    const issuesToFix = report.issues.filter(
      (issue: any) => issue.confidence === "high" || issue.confidence === "medium"
    );

    console.log(`Total de produtos para corrigir: ${issuesToFix.length}\n`);

    // Agrupar por tipo de correção
    const corrections: Array<{
      productId: number;
      sku: string;
      name: string;
      currentCategoryId: number;
      currentCategoryName: string;
      currentParentName: string | null;
      targetParentName: string;
      targetChildName: string;
      reason: string;
    }> = [];

    // Processar cada produto
    for (const issue of issuesToFix) {
      const productType = issue.detectedType;
      const material = issue.detectedMaterial;

      // Buscar categoria atual do produto
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
        console.log(`⚠️  Produto ${issue.sku} não encontrado, pulando...`);
        continue;
      }

      const targetCategory = getTargetCategory(
        productType,
        material,
        product.category.name,
        product.category.parent?.name || null
      );

      if (!targetCategory) {
        console.log(`⚠️  Não foi possível determinar categoria para ${issue.sku}, pulando...`);
        continue;
      }

      // Verificar se realmente precisa mudar
      const currentChildName = product.category.name;
      const currentParentName = product.category.parent?.name || null;

      if (
        currentParentName === targetCategory.parentName &&
        currentChildName === targetCategory.childName
      ) {
        console.log(`✓ ${issue.sku} já está na categoria correta, pulando...`);
        continue;
      }

      corrections.push({
        productId: product.id,
        sku: issue.sku,
        name: issue.name,
        currentCategoryId: product.categoryId,
        currentCategoryName: currentChildName,
        currentParentName,
        targetParentName: targetCategory.parentName,
        targetChildName: targetCategory.childName,
        reason: issue.issue,
      });
    }

    console.log(`\nTotal de correções necessárias: ${corrections.length}\n`);

    // Agrupar correções por categoria alvo para mostrar resumo
    const byTargetCategory: Record<string, number> = {};
    for (const correction of corrections) {
      const key = `${correction.targetParentName} > ${correction.targetChildName}`;
      byTargetCategory[key] = (byTargetCategory[key] || 0) + 1;
    }

    console.log("Resumo das correções:");
    console.log("-".repeat(60));
    for (const [category, count] of Object.entries(byTargetCategory).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${category}: ${count} produto(s)`);
    }
    console.log("");

    // Confirmar antes de prosseguir
    console.log("=".repeat(60));
    console.log("ATENÇÃO: Este script irá:");
    console.log("  1. Criar categorias que não existem");
    console.log("  2. Atualizar produtos para as categorias corretas");
    console.log("=".repeat(60));
    console.log("\nPressione Ctrl+C para cancelar ou Enter para continuar...");
    await new Promise((resolve) => {
      process.stdin.once("data", () => resolve(null));
    });

    // Criar categorias necessárias e atualizar produtos
    let createdCategories = 0;
    let updatedProducts = 0;
    let errors = 0;

    // Primeiro, criar todas as categorias necessárias
    const categoriesToCreate = new Set<string>();
    for (const correction of corrections) {
      categoriesToCreate.add(`${correction.targetParentName}|${correction.targetChildName}`);
    }

    console.log("\nCriando/verificando categorias...");
    const categoryMap = new Map<string, number>();

    for (const categoryKey of categoriesToCreate) {
      const [parentName, childName] = categoryKey.split("|");

      // Criar/buscar categoria pai
      let parentId: number | null = null;
      if (parentName) {
        const parentKey = `parent|${parentName}`;
        if (!categoryMap.has(parentKey)) {
          parentId = await getOrCreateCategory(prisma, parentName, null);
          categoryMap.set(parentKey, parentId);
          console.log(`  ✓ Categoria pai: "${parentName}" (ID: ${parentId})`);
        } else {
          parentId = categoryMap.get(parentKey)!;
        }
      }

      // Criar/buscar categoria filha
      const childKey = `${parentId}|${childName}`;
      if (!categoryMap.has(childKey)) {
        // Verificar se já existe antes de criar
        const childSlug = childName.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
        const existing = await prisma.category.findFirst({
          where: {
            name: { equals: childName, mode: "insensitive" },
            parentId: parentId,
            storeId: STORE_ID,
            isDeleted: false,
          },
        });

        if (existing) {
          categoryMap.set(childKey, existing.id);
          console.log(`  ✓ Categoria encontrada: "${childName}" (ID: ${existing.id})`);
        } else {
          const childId = await getOrCreateCategory(prisma, childName, parentId);
          categoryMap.set(childKey, childId);
          createdCategories++;
          console.log(`  ✓ Categoria criada: "${childName}" (ID: ${childId})`);
        }
      }
    }

    console.log(`\n✓ ${createdCategories} categoria(s) nova(s) criada(s)\n`);

    // Agora atualizar produtos
    console.log("Atualizando produtos...");
    for (const correction of corrections) {
      try {
        const categoryKey = `${correction.targetParentName}|${correction.targetChildName}`;
        const [parentName, childName] = categoryKey.split("|");

        // Buscar ID da categoria filha
        let parentId: number | null = null;
        if (parentName) {
          const parentKey = `parent|${parentName}`;
          parentId = categoryMap.get(parentKey) || null;
        }

        const childKey = `${parentId}|${childName}`;
        const targetCategoryId = categoryMap.get(childKey);

        if (!targetCategoryId) {
          console.log(`⚠️  Erro: Categoria não encontrada para ${correction.sku}`);
          errors++;
          continue;
        }

        // Atualizar produto
        await prisma.product.update({
          where: { id: correction.productId },
          data: { categoryId: targetCategoryId },
        });

        console.log(
          `✓ ${correction.sku}: "${correction.currentParentName || ""} > ${correction.currentCategoryName}" → "${correction.targetParentName} > ${correction.targetChildName}"`
        );
        updatedProducts++;
      } catch (error) {
        console.error(`✗ Erro ao atualizar ${correction.sku}:`, error);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("RESUMO");
    console.log("=".repeat(60));
    console.log(`Categorias criadas/verificadas: ${createdCategories}`);
    console.log(`Produtos atualizados: ${updatedProducts}`);
    console.log(`Erros: ${errors}`);
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("Erro:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

