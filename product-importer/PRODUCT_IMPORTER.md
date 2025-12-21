# Product Importer - Guia de Uso

## Visão Geral

Script Node.js para importação automática de produtos com imagens, integrando:
- **OpenAI**: Geração automática de descrições (com cache)
- **Uploadthing**: Upload de imagens
- **Prisma**: Persistência no banco PostgreSQL
- **CLI Interativa**: Revisão manual antes de salvar

## Estrutura de Pastas Esperada

```
data/input/imagens-separadas-01/
├── [categoria][subcategoria]/
│   ├── código_1/
│   │   ├── imagem1.jpg
│   │   ├── imagem2.jpg
│   │   └── imagem3.jpg
│   └── código_2/
│       └── imagem1.jpg
├── [aneis][aneis-ouro]/
│   ├── 1798/
│   │   └── img.jpg
│   └── 1799/
│       └── img.jpg
```

**Formato de Pasta**: `[NomeCategoria][NomeSubcategoria]`

## Arquivo de Cache

Cache de descrições geradas:
```
.cache/product-descriptions.json
```

Estrutura:
```json
{
  "version": "1.0",
  "lastUpdated": "2025-12-16T12:00:00Z",
  "entries": {
    "1798": {
      "code": "1798",
      "productName": "PINGENTE PET BANHO OURO 18K",
      "shortDescription": "Delicado pingente em ouro 18k com acabamento brilhante",
      "longDescription": "Pingente em formato de pet feito em ouro 18k com acabamento perfeito e detalhes refinados",
      "generatedAt": "2025-12-16T12:00:00Z"
    }
  }
}
```

## Configuração

### Variáveis de Ambiente

Adicione ao `.env`:

```env
# OpenAI
OPENAI_API_KEY=sk_test_...

# Uploadthing (já configurado)
UPLOADTHING_TOKEN=eyJhcGlLZXk...

# Database (já configurado)
DATABASE_URL=postgresql://...
```

### Constantes do Script

Edite `scripts/product-importer.ts` para customizar:

```typescript
const CONFIG = {
  STORE_ID: 1,                           // Store ID no banco
  OPENAI_MODEL: 'gpt-5-mini-2025-08-07', // Modelo OpenAI
  NCM: '71131900',                       // NCM sempre constante
  CFOP: '5102',                          // CFOP sempre constante
  FREIGHT_MODE: '1',                     // Modalidade de frete
  ICMS_ORIGIN: '0',                      // Origem ICMS
  ICMS_TAX: '102',                       // ICMS CSOSN
  PACKAGING_ID: 2,                       // Embalagem padrão
  STATUS: 'active',                      // Status padrão
  CACHE_FILE: '.cache/product-descriptions.json',
  INPUT_FOLDER: 'data/input/imagens-separadas-01',
  CSV_FOLDER: 'data/table',
};
```

## Uso

### Modo Normal (com cache)

```bash
yarn import:products
# ou
npx ts-node scripts/product-importer.ts
```

Usa descrições em cache quando disponível, gera novas se necessário.

### Revalidar Cache Completo

```bash
yarn import:products --refresh-cache
```

Regenera todas as descrições, sobrescrevendo o cache existente.

### Revalidar Códigos Específicos

```bash
npx ts-node scripts/product-importer.ts --refresh-cache=1798,1799
```

Regenera apenas os códigos especificados.

### Modo Dry-Run (simulação)

```bash
npx ts-node scripts/product-importer.ts --dry-run
```

Simula toda a importação sem salvar no banco.

### Modelo OpenAI Customizado

```bash
npx ts-node scripts/product-importer.ts --openai-model=gpt-4o
```

Define modelo diferente (padrão: gpt-5-mini-2025-08-07).

### Pasta de Entrada Customizada

```bash
npx ts-node scripts/product-importer.ts --folder-path=./data/input/imagens-separadas-02
```

### Combinar Opções

```bash
npx ts-node scripts/product-importer.ts --refresh-cache --openai-model=gpt-4o --dry-run
```

### Ver Ajuda

```bash
yarn import:products:help
# ou
npx ts-node scripts/product-importer.ts --help
```

## Fluxo de Importação

### 1. Exploração
- Lê todas as pastas em `data/input/imagens-separadas-01/`
- Valida formato `[categoria][subcategoria]`
- Conta imagens e produtos

### 2. Carregamento de Dados
- Lê todos os CSVs em `data/table/`
- Mapeia dados por código do produto
- Verifica produtos já existentes no banco

### 3. Processamento por Produto
Para cada produto encontrado:
- ✓ Valida se já existe (por barcode)
- ✓ Busca dados no CSV
- ✓ Extrai código, nome, preço
- ✓ Cria/obtém categorias (pai e subcategoria)
- ✓ Gera/busca descrições com cache
- ✓ Faz upload de imagens
- ✓ Apresenta para revisão
- ✓ Aguarda confirmação do usuário
- ✓ Salva no banco de dados

### 4. Revisão Interativa

Ao revisar cada produto:

```
✓ Nome: PINGENTE PET BANHO OURO 18K
✓ Código: 1798
✓ SKU: HLN-1798
✓ Barcode: 1798
✓ Preço: R$ 35,90
✓ Categoria: Aneis > Aneis Ouro
✓ Imagens: 3 encontradas

📝 Descrição Curta (gerada) (85 chars):
   Pingente em ouro 18k com acabamento brilhante e detalhes refinados

📝 Descrição Longa (gerada) (250 chars):
   Pingente em formato de pet feito em ouro 18k. Este é um produto premium 
   de nossa coleção exclusive. Oferece o melhor em qualidade e design...

================================================================================
Opções: (y)es continuar | (n)o cancelar | (e)dit descrições
================================================================================
```

Responda:
- `y` ou `s`: Continua e salva o produto
- `n`: Cancela e pula para o próximo
- `e`: Abre editor para editar descrições (em desenvolvimento)

## Dados Cadastrados Automaticamente

Campos preenchidos automaticamente:

| Campo | Valor |
|-------|-------|
| NCM | 71131900 |
| CFOP | 5102 |
| Modalidade de Frete | 1 |
| Origem ICMS | 0 |
| ICMS (CSOSN) | 102 |
| PIS | (vazio) |
| COFINS | (vazio) |
| IBS/CBS | (vazio) |
| Status | active |
| Packaging | ID 2 |
| Dimensões | (vazias) |
| Nome Interno | Mesmo que Nome Externo |
| SKU | HLN-<código> |
| Barcode (GTIN) | <código da pasta> |

## Geração de Descrições

### Prompt da IA

O script envia este prompt para OpenAI:

```
Você é um especialista em criar descrições de produtos de semijoia (ouro e prata).

Produto: PINGENTE PET BANHO OURO 18K
Preço: R$ 35,90

Gere EXATAMENTE 2 descrições em JSON válido, sem markdown:
1. "short": descrição curta (máximo 150 caracteres, objetiva e atrativa)
2. "long": descrição longa (máximo 500 caracteres, com formatação legível mas SEM emojis)

Requisitos:
- Linguagem objetiva e direta
- Sem emojis
- Sem quebras de linha desnecessárias
- Foco em qualidade e acabamento
- Mencione o material (ouro/prata) se aplicável

Retorne APENAS o JSON válido sem explicações extras.
```

### Cache de Descrições

Após geração, descrições são salvas em `.cache/product-descriptions.json` para:
- Evitar chamadas desnecessárias à API
- Reutilizar em múltiplas execuções
- Permitir refresh seletivo com `--refresh-cache`

## Upload de Imagens

### Via Uploadthing

Imagens são enviadas para Uploadthing usando:
- API endpoint: `https://api.uploadthing.com/api/uploadFiles`
- Autenticação: Token via header `x-uploadthing-token`
- Retorno: URLs dos arquivos

### Fallback

Se o upload falhar:
- ❌ Imagem individual é pulada
- ✓ Processo continua com próximas imagens
- ⚠️ Se nenhuma imagem funcionar, usa placeholders

## Tratamento de Erros

### Erro de Validação

```
⚠️ Produto 1798: não encontrado no CSV, pulando
```

Verificações:
- Arquivo CSV contém o código
- Preço é número válido
- Pasta tem imagens

### Erro de API

```
❌ Erro ao gerar descrições com OpenAI
```

Fallback: Usa descrição padrão de qualidade genérica

### Erro de Upload

```
⚠️ Erro ao fazer upload de imagem: filename.jpg
```

Continua com próximas imagens.

### Erro de Banco de Dados

```
❌ Erro ao criar produto: PINGENTE PET
```

Valida:
- Slug único
- Categoria existe
- Dados válidos

## Saída do Script

Exemplo:

```
╔════════════════════════════════════════════════════════════╗
║       IMPORTADOR DE PRODUTOS - INICIANDO                   ║
╚════════════════════════════════════════════════════════════╝

📂 Carregando dados dos CSVs...
✓ 1042 registros carregados dos CSVs

💾 Carregando cache de descrições...
✓ Cache carregado com 45 entradas

📁 Escaneando pastas de produtos...
✓ 7 categorias encontradas

🔄 Processando: [aneis][aneis-ouro]
   2 produtos encontrados
   ✓ Produto 1798: ✓ (3 imagens, descrição do cache)
   ✓ Produto 1799: ✓ (2 imagens, descrição gerada)

🔄 Processando: [brincos][brincos-ouro]
   3 produtos encontrados
   ⊘ Produto 1720: já existe, pulando
   ✓ Produto 1721: ✓ (1 imagem, descrição gerada)
   ✓ Produto 1722: ✓ (1 imagem, descrição gerada)

...

════════════════════════════════════════════════════════════
RESUMO DA IMPORTAÇÃO
════════════════════════════════════════════════════════════
✓ Produtos encontrados: 47
✓ Produtos cadastrados: 45
✗ Produtos pulados: 2
⏱️  Tempo total: 125.34s
════════════════════════════════════════════════════════════
```

## Reutilizabilidade

O script é reutilizável para:

1. **Múltiplas importações**
   - Rodar em diferentes momentos
   - Diferentes pastas de entrada
   - Não duplica produtos (valida por barcode)

2. **Atualizações de descrições**
   - Use `--refresh-cache` para atualizar
   - Use `--refresh-cache=1798,1799` para seletivo

3. **Diferentes modelos**
   - Use `--openai-model` para trocar modelo
   - Compatível com qualquer modelo de chat

4. **Customizações**
   - Edite `CONFIG` para mudar constantes
   - Modifique prompts conforme necessário
   - Estenda com campos adicionais

## Dicas de Uso

### 1. Primeira Execução
```bash
yarn import:products --dry-run --refresh-cache
```
Simula com descrições geradas para validar fluxo.

### 2. Atualizar Descrições Antigas
```bash
yarn import:products --refresh-cache
```
Regenera todas do cache com novo modelo/prompt.

### 3. Validar Estrutura
```bash
yarn import:products --help
```
Vê estrutura esperada e exemplos.

### 4. Debug
Logs detalhados estão em:
- Terminal durante execução
- Sistema de logger estruturado (veja `src/lib/utils/logger.ts`)

## Limitações e Próximos Passos

### Atual
✓ Upload de múltiplas imagens
✓ Cache persistente de descrições
✓ Validação de duplicatas
✓ CLI interativa
✓ Suporte a múltiplos modelos OpenAI
✓ Modo dry-run

### Futuro
- [ ] Editor interativo de descrições
- [ ] Validação de imagem (dimensões, formato)
- [ ] Importação de variantes
- [ ] Suporte a custom fields
- [ ] Exportação de relatório detalhado

## Troubleshooting

### "Module not found"
```bash
# Reinstale dependências
yarn install
```

### "OPENAI_API_KEY not configured"
```bash
# Adicione ao .env
OPENAI_API_KEY=sk_test_...
```

### "Database connection failed"
```bash
# Verifique DATABASE_URL no .env
# Teste com: yarn db:status
```

### "Uploadthing token invalid"
```bash
# Token está em .env (UPLOADTHING_TOKEN)
# Atualize se necessário no .env
```

## Contato e Suporte

Para dúvidas ou problemas:
1. Verifique os logs do script
2. Use `--dry-run` para simular
3. Valide estrutura de pastas
4. Confira variáveis de ambiente
