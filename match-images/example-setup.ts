/**
 * Script de exemplo para configurar e testar o sistema agnóstico
 * Este script cria uma estrutura de exemplo para demonstrar o funcionamento
 */

import fs from "fs/promises";
import path from "path";

async function createExampleStructure(): Promise<void> {
  console.log("🏗️  Criando estrutura de exemplo...\n");

  // Criar pastas base com descrições
  const baseCategories = [
    {
      name: "Aneis",
      description: "Categoria para anéis e alianças de diversos materiais",
    },
    {
      name: "Brincos",
      description: "Categoria para brincos, argolas e piercings",
    },
    {
      name: "Colares",
      description: "Categoria para colares, correntes e gargantilhas",
    },
    {
      name: "Pulseiras",
      description: "Categoria para pulseiras, braceletes e tornozeleiras",
    },
  ];

  // Criar pastas e arquivos de descrição
  for (const category of baseCategories) {
    const categoryPath = path.join("match-images", "base", category.name);
    await fs.mkdir(categoryPath, { recursive: true });

    // Criar arquivo README para cada categoria
    const readmeContent = `# ${category.name}

${category.description}

## Imagens de Referência

Adicione aqui imagens representativas desta categoria para que o sistema possa fazer matches precisos.

### Dicas:
- Use imagens claras e bem iluminadas
- Inclua diferentes ângulos e estilos
- Mantenha qualidade consistente
- Evite imagens muito similares entre si

### Formatos Suportados:
- JPG/JPEG
- PNG
- GIF
- BMP
- WEBP
`;

    await fs.writeFile(path.join(categoryPath, "README.md"), readmeContent);

    console.log(`✅ Categoria criada: ${category.name}`);
  }

  // Criar pasta join
  const joinPath = path.join("match-images", "join");
  await fs.mkdir(joinPath, { recursive: true });

  const joinReadme = `# Pasta JOIN - Imagens para Classificar

Esta pasta contém imagens desordenadas que serão automaticamente classificadas pelo sistema.

## Como Usar:

1. **Adicione suas imagens aqui**: Copie todas as imagens que precisam ser classificadas
2. **Execute o script**: \`node match-images/agnostic-match.js\`
3. **Verifique os resultados**: As imagens classificadas estarão em \`organized/\`

## Processo Automático:

O sistema irá:
- Analisar cada imagem usando IA
- Comparar com imagens de referência nas pastas base
- Encontrar a melhor correspondência
- Renomear seguindo o padrão configurado
- Mover para a pasta apropriada

## Nomenclatura Final:

As imagens serão renomeadas seguindo o padrão:
\`[nome_da_pasta] - [M] - [número]\`

Exemplos:
- \`Aneis - M - 001.jpg\`
- \`Brincos - M - 002.png\`
- \`Colares - M - 001.jpg\`
`;

  await fs.writeFile(path.join(joinPath, "README.md"), joinReadme);

  console.log(`✅ Pasta JOIN criada`);

  // Criar arquivo de configuração de exemplo
  const exampleConfig = `# Configuração de Exemplo

## Estrutura Criada:

\`\`\`
match-images/
├── base/           # ✅ Pastas de referência criadas
│   ├── Aneis/      # Para anéis e alianças
│   ├── Brincos/    # Para brincos e argolas  
│   ├── Colares/    # Para colares e correntes
│   └── Pulseiras/  # Para pulseiras e braceletes
├── join/           # ✅ Pasta para imagens desordenadas
└── agnostic-match.ts # ✅ Script principal
\`\`\`

## Próximos Passos:

### 1. Adicionar Imagens de Referência
\`\`\`bash
# Exemplo: adicionar referências para anéis
cp suas_fotos_de_aneis/* match-images/base/Aneis/

# Exemplo: adicionar referências para brincos  
cp suas_fotos_de_brincos/* match-images/base/Brincos/
\`\`\`

### 2. Adicionar Imagens para Classificar
\`\`\`bash
# Copiar todas as imagens desordenadas
cp suas_imagens_desordenadas/* match-images/join/
\`\`\`

### 3. Executar o Sistema
\`\`\`bash
# Compilar TypeScript
npx tsc

# Executar classificação
node match-images/agnostic-match.js
\`\`\`

### 4. Verificar Resultados
\`\`\`bash
# Ver imagens organizadas
ls -la match-images/organized/

# Ver detalhes de cada match
cat match-images/organized/*/\*_info.json
\`\`\`

## Personalização:

Edite \`match-images/match-config.ts\` para:
- Alterar padrão de nomenclatura
- Ajustar similaridade mínima
- Modificar caminhos das pastas
- Configurar operações (copiar vs mover)
`;

  await fs.writeFile(
    path.join("match-images", "EXAMPLE-SETUP.md"),
    exampleConfig
  );

  console.log(`✅ Documentação de exemplo criada`);

  console.log("\n🎉 Estrutura de exemplo criada com sucesso!");
  console.log("\n📋 Próximos passos:");
  console.log("1. Adicione imagens de referência nas pastas base/");
  console.log("2. Adicione imagens para classificar na pasta join/");
  console.log("3. Execute: npx tsc && node match-images/agnostic-match.js");
  console.log(
    "\n📖 Leia os arquivos README.md em cada pasta para mais detalhes."
  );
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  createExampleStructure().catch(console.error);
}

export { createExampleStructure };
