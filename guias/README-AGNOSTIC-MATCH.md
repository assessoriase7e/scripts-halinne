# Sistema Agnóstico de Match de Imagens

Este sistema permite classificar automaticamente imagens desordenadas baseado em correspondências visuais com pastas organizadas de referência.

## Estrutura de Pastas

```
match-images/
├── base/           # Pastas organizadas de referência
│   ├── categoria1/ # Cada pasta representa uma categoria
│   ├── categoria2/
│   └── categoria3/
├── join/           # Imagens desordenadas para classificar
│   ├── img1.jpg
│   ├── img2.png
│   └── ...
├── organized/      # Resultado final (criado automaticamente)
└── not_found/      # Imagens que não encontraram match
```

## Como Funciona

1. **Análise das Pastas Base**: O sistema analisa todas as imagens nas pastas dentro de `base/` e gera embeddings visuais
2. **Processamento das Imagens Join**: Analisa cada imagem em `join/` e gera seus embeddings
3. **Matching Inteligente**: Compara cada imagem de `join` com todas as imagens das pastas `base` usando:
   - Similaridade por embeddings (cosine similarity)
   - Verificação visual adicional via LLM
4. **Organização Automática**: Move/copia imagens para pastas correspondentes com nomenclatura padronizada

## Configuração

### Padrão de Nomenclatura

O padrão é configurável no arquivo `match-config.ts`:

```typescript
export const NAMING_PATTERN: string = "[folder_name] - [M] - [number]";
```

**Variáveis disponíveis:**

- `[folder_name]`: Nome da pasta de destino
- `[M]`: Literal "M" (pode ser alterado)
- `[number]`: Número sequencial (001, 002, 003...)

**Exemplo de resultado:**

- `Aneis - M - 001.jpg`
- `Aneis - M - 002.png`
- `Brincos - M - 001.jpg`

### Outras Configurações

```typescript
// Pastas
export const PATH_BASE: string = "match-images/base";
export const PATH_JOIN: string = "match-images/join";
export const PATH_OUT: string = "match-images/organized";

// Similaridade mínima (0.0 a 1.0)
export const MIN_SIMILARITY: number = 0.75;

// Operação (true = copiar, false = mover)
export const COPY_FILES: boolean = true;

// Busca recursiva em subpastas
export const RECURSIVE_SEARCH: boolean = true;
```

## Uso

### 1. Preparar Estrutura

```bash
# Criar pastas base organizadas
mkdir -p match-images/base/Aneis
mkdir -p match-images/base/Brincos
mkdir -p match-images/base/Colares

# Adicionar imagens de referência nas pastas base
cp referencia_anel1.jpg match-images/base/Aneis/
cp referencia_brinco1.jpg match-images/base/Brincos/
# ...

# Adicionar imagens desordenadas para classificar
cp imagem_desconhecida1.jpg match-images/join/
cp imagem_desconhecida2.jpg match-images/join/
# ...
```

### 2. Executar o Script

```bash
# Compilar TypeScript (se necessário)
npx tsc

# Executar o matching agnóstico
node match-images/agnostic-match.js
```

### 3. Verificar Resultados

```bash
# Ver imagens organizadas
ls -la match-images/organized/

# Ver imagens não classificadas
ls -la match-images/not_found/

# Ver informações detalhadas
cat match-images/organized/Aneis/Aneis\ -\ M\ -\ 001_info.json
```

## Arquivos de Informação

### Matches Bem-sucedidos

Para cada imagem classificada, é criado um arquivo `*_info.json` com:

```json
{
  "original_filename": "imagem_desconhecida1.jpg",
  "new_filename": "Aneis - M - 001.jpg",
  "matched_folder": "Aneis",
  "similarity_score": 0.87,
  "similarity_percentage": "87.00%",
  "join_image_analysis": "Descrição da imagem...",
  "matched_image": {
    "filename": "referencia_anel1.jpg",
    "analysis": "Descrição da referência..."
  },
  "verification": "visual_confirmed",
  "operation": "copy",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Imagens Não Classificadas

Para imagens em `not_found/`, é criado um arquivo `*_info.json` com:

```json
{
  "original_filename": "imagem_problema.jpg",
  "reason": "no_match_found",
  "join_image_analysis": "Descrição da imagem...",
  "failed_match": {
    "folder": "Aneis",
    "similarity": 0.65,
    "required_minimum": 0.75
  },
  "operation": "copy",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Vantagens do Sistema Agnóstico

1. **Flexibilidade**: Funciona com qualquer estrutura de categorias
2. **Escalabilidade**: Adicione novas categorias simplesmente criando pastas em `base/`
3. **Múltiplos Matches**: Uma imagem pode dar match com várias categorias
4. **Nomenclatura Consistente**: Padrão configurável e numeração automática
5. **Rastreabilidade**: Informações detalhadas sobre cada decisão
6. **Cache Inteligente**: Reutiliza análises anteriores para melhor performance

## Casos de Uso

- **E-commerce**: Classificar produtos por categoria
- **Organização de Fotos**: Agrupar fotos por evento/tema
- **Controle de Qualidade**: Separar produtos por tipo
- **Arquivo Digital**: Organizar documentos visuais

## Troubleshooting

### Nenhum Match Encontrado

- Verifique se `MIN_SIMILARITY` não está muito alto
- Adicione mais imagens de referência nas pastas base
- Verifique se as imagens são visualmente similares

### Performance Lenta

- Reduza `MAX_CONCURRENT_REQUESTS` se houver limitações de API
- Use cache para evitar reprocessamento
- Considere redimensionar imagens muito grandes

### Erros de Pasta

- Verifique se as pastas `base/` e `join/` existem
- Confirme permissões de leitura/escrita
- Verifique se há imagens válidas nas pastas
