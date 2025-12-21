import * as fs from "fs";
import * as path from "path";

interface JewelryItem {
  codigo: string;
  peso: string;
  tamanho: string;
  descricao_curta: string;
  preco?: string;
  unidade?: string;
}

interface ProductItem {
  codigo: string;
  unidade: string;
  preco: string;
}

function parseCSV(content: string, delimiter: string = ","): string[][] {
  const lines = content.split("\n").filter((line) => line.trim());
  return lines.map((line) => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    return fields.map((field) => field.replace(/^"|"$/g, ""));
  });
}

function readJewelryCSV(): JewelryItem[] {
  const filePath = path.join("listagem semi-joias", "jewelry_codes.csv");
  const content = fs.readFileSync(filePath, "utf-8");
  const rows = parseCSV(content);

  const items: JewelryItem[] = [];

  // Pula o cabeçalho
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length >= 4 && row[0]) {
      items.push({
        codigo: row[0],
        peso: row[1] || "",
        tamanho: row[2] || "",
        descricao_curta: row[3] || "",
        preco: "",
        unidade: "",
      });
    }
  }

  return items;
}

function readProductsCSV(filename: string): Map<string, ProductItem> {
  const filePath = path.join("listagem semi-joias", filename);
  const content = fs.readFileSync(filePath, "utf-8");
  const rows = parseCSV(content, ";");

  const productMap = new Map<string, ProductItem>();

  // Pula o cabeçalho
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length >= 7) {
      // Código está na coluna 1 (índice 1)
      // Unidade está na coluna 3 (índice 3)
      // Preço está na coluna 6 (índice 6)
      let codigo = row[1]?.trim();
      const unidade = row[3]?.trim();
      const preco = row[6]?.trim();

      if (codigo && unidade && preco) {
        // Remove tabs e espaços extras do código
        codigo = codigo.replace(/\s+/g, "");
        productMap.set(codigo, {
          codigo,
          unidade,
          preco,
        });
      }
    }
  }

  return productMap;
}

function writeJewelryCSV(items: JewelryItem[]): void {
  const filePath = path.join("listagem semi-joias", "jewelry_codes.csv");

  // Cabeçalho com as novas colunas "preco" e "unidade"
  let csvContent = "codigo,peso,tamanho,descricao_curta,preco,unidade\n";

  items.forEach((item) => {
    csvContent += `${item.codigo},${item.peso},${item.tamanho},"${
      item.descricao_curta || ""
    }","${item.preco || ""}","${item.unidade || ""}"\n`;
  });

  fs.writeFileSync(filePath, csvContent, "utf-8");
}

function main() {
  console.log("Iniciando transferência de preços e unidades...");

  // Lê o arquivo jewelry_codes.csv
  const jewelryItems = readJewelryCSV();
  console.log(`Carregados ${jewelryItems.length} itens do jewelry_codes.csv`);

  // Lê os arquivos de produtos
  const productFiles = [
    "produtos_2025-10-14-11-53-46.csv",
    "produtos_2025-10-14-11-53-52.csv",
  ];

  const allProducts = new Map<string, ProductItem>();

  productFiles.forEach((filename) => {
    try {
      const products = readProductsCSV(filename);
      console.log(`Carregados ${products.size} produtos de ${filename}`);

      // Mescla os produtos no mapa principal
      products.forEach((product, codigo) => {
        allProducts.set(codigo, product);
      });
    } catch (error) {
      console.error(`Erro ao ler ${filename}:`, error);
    }
  });

  console.log(`Total de produtos únicos: ${allProducts.size}`);

  // Mapeia os preços e unidades para os itens de jewelry
  let matchedCount = 0;
  let notFoundCount = 0;

  jewelryItems.forEach((item) => {
    const product = allProducts.get(item.codigo);
    if (product) {
      item.preco = product.preco;
      item.unidade = product.unidade;
      matchedCount++;
    } else {
      notFoundCount++;
      console.log(`Código não encontrado: ${item.codigo}`);
    }
  });

  console.log(`Códigos encontrados: ${matchedCount}`);
  console.log(`Códigos não encontrados: ${notFoundCount}`);

  // Salva o arquivo atualizado
  writeJewelryCSV(jewelryItems);
  console.log("Arquivo jewelry_codes.csv atualizado com preços e unidades!");

  // Mostra alguns exemplos de correspondências
  console.log("\nExemplos de correspondências encontradas:");
  jewelryItems.slice(0, 5).forEach((item) => {
    if (item.preco && item.unidade) {
      console.log(
        `${item.codigo}: ${item.preco} (${
          item.unidade
        }) - ${item.descricao_curta?.substring(0, 50)}...`
      );
    }
  });

  // Estatísticas de preços
  const precos = jewelryItems
    .filter((item) => item.preco)
    .map((item) => parseFloat(item.preco!.replace(",", ".")))
    .filter((preco) => !isNaN(preco));

  if (precos.length > 0) {
    const precoMin = Math.min(...precos);
    const precoMax = Math.max(...precos);
    const precoMedio = precos.reduce((a, b) => a + b, 0) / precos.length;

    console.log("\nEstatísticas de preços:");
    console.log(`Preço mínimo: R$ ${precoMin.toFixed(2).replace(".", ",")}`);
    console.log(`Preço máximo: R$ ${precoMax.toFixed(2).replace(".", ",")}`);
    console.log(`Preço médio: R$ ${precoMedio.toFixed(2).replace(".", ",")}`);
  }

  // Estatísticas de unidades
  const unidades = new Map<string, number>();
  jewelryItems.forEach((item) => {
    if (item.unidade) {
      unidades.set(item.unidade, (unidades.get(item.unidade) || 0) + 1);
    }
  });

  console.log("\nTipos de unidades encontradas:");
  unidades.forEach((count, unidade) => {
    console.log(`${unidade}: ${count} produtos`);
  });
}

main();
