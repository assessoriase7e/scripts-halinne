# Match Images - Projeto Refatorado

Este projeto foi refatorado para melhorar a organização e manutenibilidade do código. O objetivo é comparar imagens de joias e agrupar as similares usando embeddings e análise visual.

## Estrutura do Projeto

```
match-images/
├── index.js                 # Arquivo principal de entrada
├── src/                     # Diretório com os módulos refatorados
│   ├── config.js           # Configurações do aplicativo
│   ├── cache.js            # Módulo de cache SQLite
│   ├── concurrency.js      # Controle de concorrência
│   ├── imageProcessor.js   # Processamento de imagem
│   ├── openaiAPI.js        # Integração com API OpenAI
│   ├── utils.js            # Funções utilitárias
│   └── processor.js        # Lógica principal de processamento
├── input-folder-1/         # Imagens em fundo branco
├── input-folder-2/         # Imagens com modelo
├── match/                  # Saída: imagens agrupadas (criado automaticamente)
├── not_found/              # Saída: imagens sem match (criado automaticamente)
└── image_cache.db          # Cache SQLite (criado automaticamente)
```

## Módulos

### 1. config.js

Contém todas as configurações do aplicativo:

- Chaves de API
- Caminhos das pastas
- Parâmetros de processamento
- Configurações de cache
- **KEEP_MOTHER_FOLDER**: Preserva a estrutura da pasta mãe no destino (padrão: true)

### 2. cache.js

Gerencia o cache SQLite para embeddings: -初始化 banco de dados

- Armazenamento e recuperação de embeddings
- Limpeza de cache antigo

### 3. concurrency.js

Controla a concorrência de requisições:

- Limitador de requisições simultâneas
- Configuração de delay entre requisições

### 4. imageProcessor.js

Processamento de imagens:

- Otimização de imagens
- Cálculo de similaridade de cosseno

### 5. openaiAPI.js

Integração com a API OpenAI:

- Análise de imagens
- Geração de embeddings
- Verificação de similaridade visual

### 6. utils.js

Funções utilitárias:

- Movimentação de arquivos
- Listagem de imagens
- Geração de nomes de destino
- Obtenção de embeddings com cache

### 7. processor.js

Lógica principal de processamento:

- Processamento em lote de imagens
- Comparação e agrupamento
- Preparação de pastas de saída
- Exibição de resumo final

## Como Usar

1. Instale as dependências:

```bash
npm install
```

2. Coloque as imagens nas pastas:

- `input-folder-1/`: Imagens em fundo branco
- `input-folder-2/`: Imagens com modelo

3. Execute o script:

```bash
node index.js
```

## Configurações

As configurações podem ser ajustadas no arquivo `match-images/match-config.ts`:

- `MIN_SIMILARITY`: Similaridade mínima para considerar um match (padrão: 0.75)
- `MAX_CONCURRENT_REQUESTS`: Número máximo de requisições simultâneas (padrão: 3)
- `COPY_FILES`: Se true, copia arquivos; se false, move arquivos (padrão: true)
- `RECURSIVE_SEARCH`: Busca imagens em subpastas (padrão: true)
- `KEEP_ORIGINAL_NAMES`: Mantém nomes originais das pastas (padrão: true)
- `KEEP_MOTHER_FOLDER`: Preserva estrutura da pasta mãe no destino (padrão: true)

### Exemplo de KEEP_MOTHER_FOLDER

**Com KEEP_MOTHER_FOLDER = true:**
```
input-folder-1/
  └── ANEIS - Ouro/
      └── 1054.png

match/
  └── ANEIS - Ouro/    ← Pasta mãe preservada
      └── 1054/
          ├── 1054.png
          └── 1054_modelo.png
```

**Com KEEP_MOTHER_FOLDER = false:**
```
input-folder-1/
  └── ANEIS - Ouro/
      └── 1054.png

match/
  └── 1054/           ← Pasta mãe removida
      ├── 1054.png
      └── 1054_modelo.png
```

## Saída

O processo gera duas pastas principais:

1. `match/`: Contém subpastas com imagens agrupadas por similaridade
2. `not_found/`: Contém imagens que não encontraram correspondências

Cada pasta em `match/` contém:

- Imagem branca e seu correspondente mais similar
- Arquivo `analysis.json` com detalhes da análise

## Benefícios da Refatoração

- **Modularidade**: Código organizado em módulos com responsabilidades claras
- **Manutenibilidade**: Mais fácil de entender, modificar e estender
- **Reutilização**: Módulos podem ser reutilizados em outros projetos
- **Testabilidade**: Mais fácil de testar unidades individuais
- **Escalabilidade**: Estrutura preparada para futuras expansões
