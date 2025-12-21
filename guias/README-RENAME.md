# Script de Renomeamento e Organização de Imagens de Joias

Este script foi desenvolvido para renomear e organizar imagens de semi joias seguindo um padrão específico, utilizando análise visual com IA para identificar corretamente o tipo de cada imagem.

## Funcionalidades

- **Extração automática de códigos**: Identifica o código numérico no início do nome do arquivo
- **Análise visual com IA**: Utiliza GPT-4o para analisar visualmente as imagens e classificá-las
- **Renomeamento padronizado**: Aplica o padrão de nomenclatura especificado
- **Organização por pasta**: Cria pastas com base no código do produto
- **Atualização de cache**: Mantém o cache de embeddings atualizado com os novos nomes

## Padrão de Nomenclatura

- **Imagem principal**: `[código]`

  - Exemplo: `123`

- **Produto na pedra**: `[código] - P`

  - Exemplo: `123 - P`

- **Foto adicional**: `[código] - AD - [número]`

  - Exemplo: `123 - AD - 1`

- **Variante**: `[código] - V - [tipo_variante] - [nome_opção]`
  - Exemplo: `123 - V - cor - vermelho`

## Instalação e Uso

1. **Instalar dependências**:

   ```bash
   npm install
   ```

2. **Preparar as imagens**:

   - Coloque todas as imagens na pasta `images/`
   - Os nomes dos arquivos devem começar com o código numérico

3. **Executar o script**:
   ```bash
   npm run rename
   ```
   ou
   ```bash
   node rename-images.js
   ```

## Configurações

As configurações podem ser ajustadas no arquivo `src/rename-config.js`:

- `INPUT_DIR`: Diretório com as imagens a serem processadas (padrão: "images")
- `OUTPUT_DIR`: Diretório de saída com as imagens organizadas (padrão: "organized")
- `RECURSIVE_SEARCH`: Buscar em subdiretórios (padrão: true)
- `COPY_FILES`: true para copiar, false para mover arquivos (padrão: true)
- `DRY_RUN`: true para simular sem fazer alterações (padrão: false)

## Estrutura de Saída

Após a execução, as imagens serão organizadas da seguinte forma:

```
organized/
├── 123/
│   ├── 123.png
│   ├── 123 - P.png
│   ├── 123 - AD - 1.png
│   └── 123 - V - cor - vermelho.png
├── 456/
│   ├── 456.png
│   └── 456 - P.png
└── rename-report.json
```

## Relatório de Processamento

O script gera um relatório detalhado em `organized/rename-report.json` com:

- Estatísticas de processamento
- Lista de arquivos processados
- Erros encontrados
- Informações sobre atualização do cache

## Integração com Cache de Embeddings

O script atualiza automaticamente o cache de embeddings com os novos nomes dos arquivos, permitindo que o script `match-images.js` reutilize as análises já realizadas.

## Exemplos de Nomes de Arquivos

### Nomes de entrada:

- `429_generated.png`
- `429_generated_cópia.png`
- `429_generated_nano_banana.png`
- `430_generated_upscaled.png`
- `430_generated_upscaled_nano_banana.png`
- `431_generated_upscaled.png`
- `432_generated_vermelho.png`
- `432_generated_azul.png`

### Nomes de saída:

- `429/429.png` (imagem principal)
- `429/429 - AD - 1.png` (foto adicional)
- `429/429 - P.png` (produto na pedra)
- `430/430.png` (imagem principal)
- `430/430 - P.png` (produto na pedra)
- `431/431.png` (imagem principal)
- `432/432 - V - cor - vermelho.png` (variante de cor)
- `432/432 - V - cor - azul.png` (variante de cor)

## Solução de Problemas

### Erros Comuns

1. **"Diretório de entrada não encontrado"**

   - Verifique se a pasta `images/` existe
   - Ajuste a configuração `INPUT_DIR` se necessário

2. **"Nenhuma imagem encontrada"**

   - Verifique se há arquivos de imagem na pasta de entrada
   - Confirme que os arquivos têm extensões suportadas (.jpg, .jpeg, .png, .gif, .bmp, .webp)

3. **"Não foi possível extrair código"**

   - Verifique se os nomes dos arquivos começam com números
   - Exemplo válido: `123_nome.png`
   - Exemplo inválido: `imagem_123.png`

4. **Erros na análise visual**
   - O script fará fallback para análise baseada no nome do arquivo
   - Verifique o relatório para detalhes dos erros

## Requisitos

- Node.js 18+
- API Key da OpenAI configurada em `src/config.js`
- Dependências instaladas via npm

## Notas

- O script utiliza a API da OpenAI para análise visual, o que pode gerar custos
- Em modo de simulação (`DRY_RUN: true`), nenhuma alteração é feita nos arquivos
- O cache de embeddings é compartilhado com o script de matching de imagens
