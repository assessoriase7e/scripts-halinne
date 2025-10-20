# Sistema de Processamento de Imagens de Joias

Este projeto contém dois scripts principais para processamento de imagens de semi joias, organizados em pastas separadas para melhor manutenção.

## Estrutura do Projeto

```
match-images/
├── src/                    # Módulos compartilhados
│   ├── config.js          # Configurações do script de match
│   ├── cache.js           # Sistema de cache de embeddings
│   ├── concurrency.js     # Controle de concorrência
│   ├── imageProcessor.js  # Processamento de imagens
│   ├── openaiAPI.js       # Integração com OpenAI
│   ├── processor.js       # Lógica principal de matching
│   ├── utils.js           # Utilitários gerais
│   ├── rename-config.js   # Configurações do script de rename
│   ├── rename-utils.js    # Utilitários do script de rename
│   ├── rename-processor.js # Processador com cache para rename
│   └── image-analyzer.js  # Análise visual com IA
├── match-images/          # Script de matching de imagens
│   ├── match-images.js    # Script principal
│   ├── input-folder-1/    # Imagens em fundo branco
│   ├── input-folder-2/    # Imagens com modelo
│   ├── match/             # Saída dos matches encontrados
│   └── not_found/         # Imagens sem match
├── rename-images/         # Script de renomeamento
│   ├── rename-images.js   # Script principal
│   ├── images/            # Entrada das imagens a renomear
│   └── organized/         # Saída das imagens renomeadas
├── image_cache.db         # Cache de embeddings
├── package.json           # Dependências e scripts
├── README.md              # Documentação original
├── README-RENAME.md       # Documentação do script de rename
└── README-MAIN.md         # Este arquivo
```

## Scripts Disponíveis

### 1. Script de Matching de Imagens (`match-images`)

Este script compara imagens de joias em fundo branco com imagens de joias com modelo, usando IA para determinar similaridade e agrupá-las.

**Como usar:**

```bash
npm start
# ou
npm run dev
```

**Funcionalidades:**

- Análise visual com GPT-4o
- Geração de embeddings para comparação
- Cache de resultados para otimização
- Agrupamento automático por similaridade
- Verificação visual adicional

### 2. Script de Renomeamento (`rename-images`)

Este script renomeia e organiza imagens de joias seguindo um padrão específico, utilizando análise visual para identificar corretamente o tipo de cada imagem.

**Como usar:**

```bash
npm run rename
```

**Padrão de nomenclatura:**

- Imagem principal: `[código]`
- Produto na pedra: `[código] - P`
- Foto adicional: `[código] - AD - [número]`
- Variante: `[código] - V - [tipo] - [opção]`

## Fluxo de Trabalho Sugerido

1. **Renomear e Organizar**: Primeiro execute o script de rename para organizar suas imagens
2. **Matching**: Depois use o script de match para encontrar correspondências

## Configurações

As configurações podem ser ajustadas nos arquivos:

- `src/config.js` - Para o script de matching
- `src/rename-config.js` - Para o script de renomeamento

## Cache Compartilhado

Ambos os scripts compartilham o mesmo cache de embeddings (`image_cache.db`), o que significa que:

- Análises feitas em um script podem ser reutilizadas no outro
- Economia de custos com API da OpenAI
- Processamento mais rápido para imagens já analisadas

## Requisitos

- Node.js 18+
- API Key da OpenAI configurada em `src/config.js`
- Dependências instaladas via `npm install`

## Instalação

```bash
npm install
```

## Documentação Adicional

- [`README.md`](README.md) - Documentação original do projeto
- [`README-RENAME.md`](README-RENAME.md) - Documentação detalhada do script de renomeamento
- [`match-images/match-images.js`](match-images/match-images.js) - Script de matching
- [`rename-images/rename-images.js`](rename-images/rename-images.js) - Script de renomeamento

## Notas Importantes

- Os scripts utilizam a API da OpenAI, o que pode gerar custos
- O cache é compartilhado entre os scripts para otimizar o processamento
- Cada script tem suas próprias pastas de entrada e saída para evitar conflitos
- Os scripts podem ser executados independentemente ou em sequência
