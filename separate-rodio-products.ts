#!/usr/bin/env tsx
/**
 * Script para separar produtos de ródio em categorias próprias
 * Remove produtos de ródio da categoria "Prata Rodio" e cria categorias específicas para ródio
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL =
  "postgresql://neondb_owner:npg_OQ8dKPF0SbiY@ep-soft-cake-ad36hicf.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const STORE_ID = 1;

// Mapeamento de tipos de produtos para categorias pai
const TYPE_TO_PARENT: Record<string, string> = {
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

function detectProductType(productName: string): string | null {
  const lowerName = productName.toLowerCase();
  for (const [type] of Object.entries(TYPE_TO_PARENT)) {
    if (lowerName.includes(type)) {
      return type;
    }
  }
  return null;
}

function isRodioProduct(productName: string): boolean {
  const lowerName = productName.toLowerCase();
  return (
    lowerName.includes("rodio") ||
    lowerName.includes("ródio") ||
    (lowerName.includes("branco") && !lowerName.includes("prata"))
  );
}

function isPrataProduct(productName: string): boolean {
  const lowerName = productName.toLowerCase();
  return lowerName.includes("prata") || lowerName.includes("925");
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

  // Verificar se já existe
  let category = await prisma.category.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      parentId: parentId,
      storeId: STORE_ID,
      isDeleted: false,
    },
  });

  if (category) {
    return category.id;
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
  console.log("   SEPARAÇÃO DE PRODUTOS DE RÓDIO");
  console.log("========================================\n");

  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log("✓ Conectado ao banco de dados\n");

    // Buscar todas as categorias "Prata Rodio"
    const prataRodioCategories = await prisma.category.findMany({
      where: {
        name: { contains: "Prata Rodio", mode: "insensitive" },
        storeId: STORE_ID,
        isDeleted: false,
      },
      include: {
        parent: true,
        products: {
          where: { isDeleted: false },
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
    });

    console.log(`Encontradas ${prataRodioCategories.length} categorias "Prata Rodio"\n`);

    let totalRodioProducts = 0;
    let totalPrataProducts = 0;
    let createdCategories = 0;
    let movedProducts = 0;

    for (const category of prataRodioCategories) {
      const parentName = category.parent?.name || "ROOT";
      console.log(`\n📂 Processando: ${parentName} > ${category.name}`);
      console.log(`   Produtos nesta categoria: ${category.products.length}`);

      // Separar produtos de ródio e prata
      const rodioProducts: typeof category.products = [];
      const prataProducts: typeof category.products = [];

      for (const product of category.products) {
        const productType = detectProductType(product.name);
        const isRodio = isRodioProduct(product.name);
        const isPrata = isPrataProduct(product.name);

        if (isRodio && !isPrata) {
          rodioProducts.push(product);
        } else {
          prataProducts.push(product);
        }
      }

      console.log(`   - Produtos de ródio: ${rodioProducts.length}`);
      console.log(`   - Produtos de prata: ${prataProducts.length}`);

      totalRodioProducts += rodioProducts.length;
      totalPrataProducts += prataProducts.length;

      // Se houver produtos de ródio, criar categoria específica
      if (rodioProducts.length > 0 && category.parent) {
        const parentId = category.parent.id;
        const parentName = category.parent.name;

        // Determinar tipo de produto baseado no nome da categoria pai
        let productType: string | null = null;
        for (const [type, parent] of Object.entries(TYPE_TO_PARENT)) {
          if (parentName.toLowerCase().includes(type) || parentName === parent) {
            productType = type;
            break;
          }
        }

        // Se não encontrou pelo nome da categoria pai, tentar pelo primeiro produto
        if (!productType && rodioProducts.length > 0) {
          productType = detectProductType(rodioProducts[0].name);
        }

        if (productType) {
          const rodioCategoryName = `${parentName} Rodio`;
          // Verificar se categoria já existe antes de criar
          const existingRodioCategory = await prisma.category.findFirst({
            where: {
              name: { equals: rodioCategoryName, mode: "insensitive" },
              parentId: parentId,
              storeId: STORE_ID,
              isDeleted: false,
            },
          });

          const rodioCategoryId = existingRodioCategory
            ? existingRodioCategory.id
            : await getOrCreateCategory(prisma, rodioCategoryName, parentId);

          if (!existingRodioCategory) {
            createdCategories++;
            console.log(`   ✓ Categoria criada: "${rodioCategoryName}" (ID: ${rodioCategoryId})`);
          } else {
            console.log(`   ✓ Categoria encontrada: "${rodioCategoryName}" (ID: ${rodioCategoryId})`);
          }

          // Mover produtos de ródio para a nova categoria
          for (const product of rodioProducts) {
            await prisma.product.update({
              where: { id: product.id },
              data: { categoryId: rodioCategoryId },
            });
            movedProducts++;
            console.log(`     ✓ ${product.sku}: "${product.name.substring(0, 50)}..." → ${rodioCategoryName}`);
          }
        } else {
          console.log(`   ⚠️ Não foi possível determinar tipo de produto para criar categoria de ródio`);
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("RESUMO");
    console.log("=".repeat(60));
    console.log(`Produtos de ródio identificados: ${totalRodioProducts}`);
    console.log(`Produtos de prata mantidos: ${totalPrataProducts}`);
    console.log(`Categorias de ródio criadas: ${createdCategories}`);
    console.log(`Produtos movidos: ${movedProducts}`);
    console.log("=".repeat(60) + "\n");

    // Mostrar estatísticas finais
    console.log("📊 CATEGORIAS FINAIS:");
    console.log("-".repeat(60));
    const allCategories = await prisma.category.findMany({
      where: { storeId: STORE_ID, isDeleted: false },
      include: {
        parent: true,
        _count: { select: { products: true } },
      },
      orderBy: { name: "asc" },
    });

    const parentCategories = allCategories.filter((c) => !c.parentId);
    for (const parent of parentCategories) {
      const children = allCategories.filter((c) => c.parentId === parent.id);
      if (children.length > 0) {
        console.log(`\n${parent.name}:`);
        for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
          console.log(`  └─ ${child.name}: ${child._count.products} produtos`);
        }
      }
    }
  } catch (error) {
    console.error("Erro:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

