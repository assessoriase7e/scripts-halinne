# Script de Geração de Imagens com Nano Banana API

Script Node.js para processar imagens usando a API Nano Banana do Segmind.

## 🚀 Funcionalidades

- ✅ Processamento em lote de imagens
- ✅ Cache inteligente para evitar reprocessamento
- ✅ Suporte a imagens estáticas globais e locais
- ✅ Rate limiting automático
- ✅ Sistema de logs estruturado
- ✅ Métricas e estatísticas em tempo real
- ✅ Tratamento gracioso de interrupções (Ctrl+C)
- ✅ Backup automático do cache
- ✅ Validação de arquivos e ambiente
- ✅ Comandos de status e limpeza

## 📋 Pré-requisitos

- Node.js >= 18
- Conta no Segmind com API key
- Conta no UploadThing com token

## 🛠️ Instalação

1. Instale as dependências:
```bash
yarn add uploadthing
```

2. (Opcional) Configure variáveis de ambiente criando um arquivo `.env`:
```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

## 📖 Uso

### Processamento básico
```bash
node nano-banana-batch-gen.js -s="-P"
```

### Opções disponíveis

- `-s` ou `--suffix`: Sufixo para arquivos gerados (ex: `-s="-P"`)
- `-f` ou `--force`: Força reprocessamento de todas as imagens
- `-c` ou `--clean`: Limpa o cache de processamento
- `-st` ou `--status`: Mostra estatísticas do cache
- `-d` ou `--debug`: Ativa modo debug (logs detalhados)
- `--cache-only` ou `--build-cache`: Constrói o cache apenas (sem gerar imagens)

### Exemplos

```bash
# Processar com sufixo "-P"
node nano-banana-batch-gen.js -s="-P"

# Forçar reprocessamento
node nano-banana-batch-gen.js -s="-P" --force

# Ver status do cache
node nano-banana-batch-gen.js --status

# Limpar cache
node nano-banana-batch-gen.js --clean

# Modo debug
node nano-banana-batch-gen.js -s="-P" --debug

# Construir cache apenas (sem gerar imagens)
# Útil para pré-popular o cache com arquivos já existentes
node nano-banana-batch-gen.js --cache-only
```

## 📁 Estrutura de Pastas

```
gen-images/
├── input/              # Imagens originais
│   ├── pedra/         # Categorias de produtos
│   │   ├── anel-ouro/
│   │   │   ├── 1564.png
│   │   │   └── static-1.png  # Imagem estática local
│   │   └── ...
│   └── static-1.png   # Imagem estática global (opcional)
├── output/            # Imagens geradas (mesma estrutura)
├── logs/              # Arquivos de log
├── cache-backups/     # Backups do cache
├── utils/             # Módulos utilitários
└── processing-cache.json  # Cache de processamento
```

## 🔄 Como Funciona

1. **Imagens Estáticas**:
   - Se houver `static-1.png` ou `static-2.png` na raiz de `input/`, serão usadas para todas as imagens
   - Se houver `static-1.png` ou `static-2.png` em uma subpasta específica, serão usadas apenas para imagens daquela subpasta
   - Ambas podem ser combinadas (globais + locais)
   - **Importante**: Imagens estáticas não são processadas como imagens principais, apenas como referência

2. **Prompts Personalizados**:
   - Você pode criar um arquivo `prompt.txt` em qualquer subpasta
   - O prompt personalizado será usado para todas as imagens daquela subpasta
   - Se não houver `prompt.txt`, o prompt padrão será usado
   - Veja `PROMPT-EXAMPLES.md` para mais detalhes

2. **Cache**:
   - O script mantém um cache de processamento em `processing-cache.json`
   - Imagens já processadas são automaticamente puladas
   - O cache verifica hash das imagens para detectar mudanças
   - Backups automáticos são criados periodicamente

3. **Retomada**:
   - Se o script for interrompido (ex: créditos acabarem), basta executá-lo novamente
   - Ele continuará de onde parou, processando apenas imagens pendentes

4. **Rate Limiting**:
   - O script controla automaticamente a taxa de requisições
   - Evita sobrecarregar a API

## 📊 Métricas

O script mostra em tempo real:
- Progresso percentual
- Taxa de sucesso
- Tempo decorrido
- Tempo estimado restante
- Arquivos processados/com erro/pulados

## 🛡️ Tratamento de Erros

- Erros são registrados no cache com status "error"
- O script continua processando outras imagens mesmo em caso de erro
- Logs detalhados são salvos em `logs/`

## 🔧 Configuração Avançada

Crie um arquivo `.env` para personalizar:

```env
BATCH_SIZE=5                    # Tamanho do lote
RATE_LIMIT_DELAY=1000           # Delay entre requisições (ms)
RATE_LIMIT_MAX_CONCURRENT=3    # Requisições simultâneas máximas
CACHE_BACKUP_INTERVAL=100       # Frequência de backups
```

## 📝 Logs

Os logs são salvos em `logs/processing-YYYY-MM-DDTHH-MM-SS.log` com:
- Timestamps
- Níveis de log (DEBUG, INFO, WARN, ERROR)
- Detalhes de cada operação

## ⚠️ Notas Importantes

- As imagens originais **não são removidas** (permanecem em `input/`)
- O cache é essencial para retomar processamento - não delete sem necessidade
- Use `--force` com cuidado, pois reprocessará todas as imagens
- O script cria automaticamente a estrutura de pastas em `output/`

## 🐛 Troubleshooting

**Erro de créditos insuficientes:**
- O script para automaticamente
- Execute novamente para continuar de onde parou

**Erro de upload:**
- Verifique o token do UploadThing
- Verifique sua conexão com a internet

**Cache corrompido:**
- Use `--clean` para limpar o cache
- Ou delete manualmente `processing-cache.json`


