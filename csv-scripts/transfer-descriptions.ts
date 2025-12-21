import * as fs from "fs";
import * as path from "path";

interface JewelryItem {
  codigo: string;
  peso: string;
  tamanho: string;
  descricao_curta?: string;
}

interface ProductItem {
  codigo: string;
  descricao: string;
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
    if (row.length >= 3 && row[0]) {
      items.push({
        codigo: row[0],
        peso: row[1] || "",
        tamanho: row[2] || "",
        descricao_curta: "",
      });
    }
  }

  return items;
}

function readProductsCSV(filename: string): Map<string, string> {
  const filePath = path.join("listagem semi-joias", filename);
  const content = fs.readFileSync(filePath, "utf-8");
  const rows = parseCSV(content, ";");

  const productMap = new Map<string, string>();

  // Pula o cabeçalho
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length >= 3) {
      // Código está na coluna 1 (índice 1), Descrição na coluna 2 (índice 2)
      let codigo = row[1]?.trim();
      const descricao = row[2]?.trim();

      if (codigo && descricao) {
        // Remove tabs e espaços extras do código
        codigo = codigo.replace(/\s+/g, "");
        productMap.set(codigo, descricao);
      }
    }
  }

  return productMap;
}

function writeJewelryCSV(items: JewelryItem[]): void {
  const filePath = path.join("listagem semi-joias", "jewelry_codes.csv");

  // Cabeçalho com "codigo" sem acento e nova coluna "descricao_curta"
  let csvContent = "codigo,peso,tamanho,descricao_curta\n";

  items.forEach((item) => {
    csvContent += `${item.codigo},${item.peso},${item.tamanho},"${
      item.descricao_curta || ""
    }"\n`;
  });

  fs.writeFileSync(filePath, csvContent, "utf-8");
}

function main() {
  console.log("Iniciando transferência de descrições...");

  // Lê o arquivo jewelry_codes.csv
  const jewelryItems = readJewelryCSV();
  console.log(`Carregados ${jewelryItems.length} itens do jewelry_codes.csv`);

  // Lê os arquivos de produtos
  const productFiles = [
    "produtos_2025-10-14-11-53-46.csv",
    "produtos_2025-10-14-11-53-52.csv",
  ];

  const allProducts = new Map<string, string>();

  productFiles.forEach((filename) => {
    try {
      const products = readProductsCSV(filename);
      console.log(`Carregados ${products.size} produtos de ${filename}`);

      // Mescla os produtos no mapa principal
      products.forEach((descricao, codigo) => {
        allProducts.set(codigo, descricao);
      });
    } catch (error) {
      console.error(`Erro ao ler ${filename}:`, error);
    }
  });

  console.log(`Total de produtos únicos: ${allProducts.size}`);

  // Mapeia as descrições para os itens de jewelry
  let matchedCount = 0;
  let notFoundCount = 0;

  jewelryItems.forEach((item) => {
    const descricao = allProducts.get(item.codigo);
    if (descricao) {
      item.descricao_curta = descricao;
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
  console.log("Arquivo jewelry_codes.csv atualizado com sucesso!");

  // Mostra alguns exemplos de correspondências
  console.log("\nExemplos de correspondências encontradas:");
  jewelryItems.slice(0, 5).forEach((item) => {
    if (item.descricao_curta) {
      console.log(`${item.codigo}: ${item.descricao_curta}`);
    }
  });
}

main();
