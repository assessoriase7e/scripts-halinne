import fs from "fs";
import path from "path";

// Interface para o produto de entrada
interface InputProduct {
  code: string;
  name: string;
  unit: string;
  price: string;
  description: string;
  length: string;
}

// Interface para o produto de saída
interface OutputProduct {
  code: string;
  name: string;
  unit: string;
  price: string;
  description: string;
  length: string;
}

// Função para parsear o CSV
function parseCSV(filePath: string): InputProduct[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Remove a linha de cabeçalho (se existir)
  const dataLines = lines.filter((line) => line.trim() !== "");

  const products: InputProduct[] = [];

  for (const line of dataLines) {
    // Dividir a linha por ponto e vírgula, mas tratando campos entre aspas
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ";" && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    // Adicionar o último campo
    if (current) {
      fields.push(current);
    }

    // Extrair os dados necessários
    if (fields.length >= 100) {
      const code = fields[0]?.replace(/"/g, "").trim() || "";
      const name = fields[2]?.replace(/"/g, "").trim() || "";
      const unit = fields[3]?.replace(/"/g, "").trim() || "";
      const price = fields[7]?.replace(/"/g, "").trim() || "";
      const description = fields[27]?.replace(/"/g, "").trim() || "";
      const length = fields[100]?.replace(/"/g, "").trim() || "";

      products.push({
        code,
        name,
        unit,
        price,
        description,
        length,
      });
    }
  }

  return products;
}

// Função para gerar o arquivo de saída
function generateOutputFile(
  products: InputProduct[],
  outputPath: string
): void {
  const outputProducts: OutputProduct[] = products.map((product) => ({
    code: product.code,
    name: product.name,
    unit: product.unit,
    price: product.price,
    description: product.description,
    length: product.length,
  }));

  // Criar o conteúdo do arquivo de saída
  let outputContent = "Código;Nome;Unidade;Preço;Descrição;Comprimento\n";

  for (const product of outputProducts) {
    outputContent += `"${product.code}";"${product.name}";"${product.unit}";"${product.price}";"${product.description}";"${product.length}"\n`;
  }

  fs.writeFileSync(outputPath, outputContent, "utf-8");
  console.log(`Arquivo de saída gerado em: ${outputPath}`);
}

// Função principal
function main(): void {
  const inputPath = path.join(
    __dirname,
    "listagem semi-joias",
    "produtos_2025-10-14-11-53-46.csv"
  );
  const outputPath = path.join(__dirname, "produtos_formatados.csv");

  try {
    const products = parseCSV(inputPath);
    console.log(`Processados ${products.length} produtos`);

    generateOutputFile(products, outputPath);
  } catch (error) {
    console.error("Erro ao processar o arquivo:", error);
  }
}

// Executar a função principal
main();
