# Utilitários do Script de Geração de Imagens

Este diretório contém módulos utilitários refatorados do script principal.

## Módulos

### `config.js`
Centraliza todas as configurações do script, incluindo:
- Diretórios de entrada/saída
- Configurações da API
- Parâmetros de processamento
- Rate limiting

### `logger.js`
Sistema de logs estruturado com:
- Níveis de log (DEBUG, INFO, WARN, ERROR)
- Logs em arquivo e console
- Timestamps automáticos

### `args-parser.js`
Parser de argumentos de linha de comando:
- `--suffix` ou `-s`: Sufixo para arquivos gerados
- `--force` ou `-f`: Força reprocessamento
- `--clean` ou `-c`: Limpa cache
- `--status` ou `-st`: Mostra status
- `--debug` ou `-d`: Modo debug

### `file-utils.js`
Utilitários para manipulação de arquivos:
- Cálculo de hash MD5
- Validação de imagens
- Busca recursiva de arquivos
- Cálculo de caminhos de saída

### `cache.js`
Gerenciamento de cache de processamento:
- Carregar/salvar cache
- Backup automático
- Verificação de processamento
- Estatísticas do cache

### `validators.js`
Validações do ambiente:
- Validação de API keys
- Validação de UploadThing
- Verificação de dependências

### `metrics.js`
Métricas e estatísticas:
- Tempo decorrido
- Taxa de sucesso
- Tempo estimado restante
- Progresso percentual

### `api-client.js`
Cliente para APIs externas:
- Upload para UploadThing
- Download de imagens
- Polling de status
- Rate limiting

### `static-images.js`
Gerenciamento de imagens estáticas:
- Carregamento de imagens globais
- Carregamento de imagens locais por subpasta


