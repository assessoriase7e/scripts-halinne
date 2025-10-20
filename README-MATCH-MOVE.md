# Match and Move - Comparação e Movimentação Inteligente

## Descrição

Este script compara imagens novas da pasta `images` (input) com as imagens já organizadas na pasta `organized` (output) para identificar automaticamente a qual grupo/código elas pertencem, mesmo sem ter o código no nome do arquivo.

## Como Funciona

1. **Carrega imagens organizadas**: Lista todas as imagens já processadas e organizadas por código
2. **Gera embeddings**: Cria representações vetoriais das imagens usando IA
3. **Compara similaridade**: Para cada imagem nova, compara com todas as organizadas
4. **Move automaticamente**: Se encontrar match com similaridade ≥ 75%, move para a pasta correta

## Uso

```bash
yarn match-move
```

## Configurações

As configurações são compartilhadas com o script de rename em `src/rename-config.ts`:

- **INPUT_DIR**: Pasta com imagens novas para processar
- **OUTPUT_DIR**: Pasta com imagens já organizadas
- **DRY_RUN**: `true` para simular, `false` para executar
- **COPY_FILES**: `true` para copiar, `false` para mover
- **RECURSIVE_SEARCH**: `true` para buscar em subpastas

## Exemplo de Fluxo

### Situação Inicial

```
rename-images/
├── images/                    # Imagens novas sem código
│   ├── joia_bonita.png
│   ├── anel_dourado.jpg
│   └── brinco_prata.png
│
└── organized/                 # Imagens já organizadas
    └── ANEIS - Ouro/
        ├── 1054/
        │   ├── 1054.png
        │   └── 1054 - P.png
        └── 1055/
            ├── 1055.png
            └── 1055 - P.png
```

### Após Executar `yarn match-move`

```
rename-images/
├── images/                    # Vazio ou com imagens sem match
│
└── organized/
    └── ANEIS - Ouro/
        ├── 1054/
        │   ├── 1054.png
        │   ├── 1054 - P.png
        │   └── joia_bonita.png      # ✅ Movida (match com 1054)
        └── 1055/
            ├── 1055.png
            ├── 1055 - P.png
            └── anel_dourado.jpg      # ✅ Movida (match com 1055)
```

## Relatório

O script gera um relatório JSON em `organized/match-and-move-report.json`:

```json
{
  "timestamp": "2025-10-20T19:30:00.000Z",
  "summary": {
    "total": 3,
    "moved": 2,
    "notFound": 1
  },
  "results": [
    {
      "fileName": "joia_bonita.png",
      "matchedCode": "1054",
      "matchedFile": "1054.png",
      "similarity": 0.89,
      "moved": true
    },
    {
      "fileName": "anel_dourado.jpg",
      "matchedCode": "1055",
      "matchedFile": "1055.png",
      "similarity": 0.82,
      "moved": true
    },
    {
      "fileName": "brinco_prata.png",
      "matchedCode": null,
      "matchedFile": null,
      "similarity": 0.45,
      "moved": false
    }
  ]
}
```

## Casos de Uso

### 1. Imagens sem código no nome
Você recebeu imagens de produtos mas elas não têm o código no nome do arquivo.

### 2. Fotos adicionais
Você tirou novas fotos de produtos já cadastrados e quer adicioná-las automaticamente às pastas corretas.

### 3. Organização retroativa
Você tem uma pasta com centenas de imagens antigas e quer organizá-las com base nas já categorizadas.

## Vantagens

- ✅ **Automático**: Não precisa renomear manualmente
- ✅ **Inteligente**: Usa IA para comparar visualmente as imagens
- ✅ **Seguro**: Não sobrescreve arquivos existentes
- ✅ **Rastreável**: Gera relatório detalhado de todas as operações
- ✅ **Cache**: Reutiliza embeddings já gerados para economizar tempo e custos

## Limitações

- Requer que já existam imagens organizadas para comparação
- Similaridade mínima de 75% (configurável no código)
- Consome API da OpenAI (embeddings)
- Pode ser lento com muitas imagens (usa cache para otimizar)

## Dicas

1. **Execute o rename primeiro**: Organize algumas imagens manualmente antes de usar o match-move
2. **Use DRY_RUN**: Teste primeiro em modo simulação
3. **Verifique o relatório**: Sempre confira os matches antes de confiar 100%
4. **Ajuste a similaridade**: Se necessário, edite o valor `minSimilarity` no código
