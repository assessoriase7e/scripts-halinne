# Modo Simples de Renomeamento de Imagens

Este documento descreve o modo simples do script de renomeamento, que processa imagens sem usar inteligência artificial.

## O que é o Modo Simples?

O modo simples é uma versão do script de renomeamento que:

- **Não usa IA** para análise de imagens
- **Baseia-se apenas no código numérico** no início do nome do arquivo
- **É mais rápido** e não requer API keys
- **Detecta imagens adicionais** verificando se já existe uma imagem principal na pasta de destino

## Como Funciona

1. **Extração de código**: O script extrai o código numérico (até 4 dígitos) do início do nome do arquivo
2. **Verificação de pasta existente**: Verifica se já existe uma pasta com esse código no diretório de destino
3. **Detecção de imagem adicional**: Se já existe uma imagem principal (arquivo com nome igual ao código ou `código - P`), a nova imagem é tratada como adicional
4. **Nomenclatura**:
   - Primeira imagem: mantém o nome original
   - Imagens adicionais: usa a nomenclatura ` código - AD - número`

## Exemplo Prático

### Antes do Processamento:

```
rename-images/images/ANEIS - Ouro/437.png
rename-images/images/ANEIS - Ouro/437_generated.png
```

### Depois do Processamento:

```
rename-images/organized/ANEIS - Ouro/437/437.png
rename-images/organized/ANEIS - Ouro/437/437 - AD - 1.png
```

## Como Usar

### Método 1: Modificar a Configuração

1. Abra o arquivo `src/rename-config.ts`
2. Altere a linha:
   ```typescript
   export const SIMPLE_MODE: boolean = false;
   ```
   para:
   ```typescript
   export const SIMPLE_MODE: boolean = true;
   ```
3. Execute o script normal:
   ```bash
   npm run rename
   ```

### Método 2: Usar o Script Simples (Recomendado)

Execute o script dedicado para o modo simples:

```bash
npm run simple-move
```

Este script é uma versão independente que já funciona no modo simples por padrão.

## Configurações Disponíveis

No modo simples, você pode configurar:

- `INPUT_DIR`: Diretório de entrada (padrão: `rename-images/images`)
- `OUTPUT_DIR`: Diretório de saída (padrão: `rename-images/organized`)
- `COPY_FILES`: `true` para copiar, `false` para mover (padrão: `false`)
- `DRY_RUN`: `true` para simular sem fazer alterações (padrão: `false`)
- `RECURSIVE_SEARCH`: Buscar em subdiretórios (padrão: `true`)

## Vantagens do Modo Simples

- **Mais rápido**: Não precisa processar imagens com IA
- **Não requer API**: Não precisa de chave da OpenAI
- **Menos recursos**: Não usa cache nem embeddings
- **Determinístico**: O resultado é sempre o mesmo para os mesmos arquivos
- **Ideal para lotes grandes**: Processa centenas de imagens rapidamente

## Limitações do Modo Simples

- **Não detecta similaridade visual**: Apenas verifica se já existe arquivo na pasta
- **Não classifica tipos de imagem**: Não diferencia entre MAIN_IMAGE, PRODUCT_ON_STONE, etc.
- **Baseado apenas no código**: Depende do código numérico estar correto no nome do arquivo

## Quando Usar Cada Modo

### Use o Modo Simples quando:

- Você tem muitos arquivos para processar rapidamente
- Os nomes dos arquivos já têm códigos numéricos corretos
- Você não precisa de classificação detalhada dos tipos de imagem
- Você quer processar arquivos sem depender de APIs externas

### Use o Modo Completo quando:

- Você precisa de classificação precisa dos tipos de imagem
- Você quer detectar similaridade visual real entre imagens
- Os nomes dos arquivos não seguem um padrão claro
- Você precisa diferenciar entre tipos específicos de fotos (produto na pedra, variantes, etc.)

## Exemplo de Saída do Console

```
═══════════════════════════════════════════
🔄 RENOMEANDO E ORGANIZANDO IMAGENS (MODO SIMPLES - SEM IA)
═══════════════════════════════════════════

⚙️ Configurações:
   - Diretório de entrada: rename-images/images
   - Diretório de saída: rename-images/organized
   - Busca recursiva: Sim
   - Modo de simulação: Não
   - Manter pasta mãe: Sim
   - Modo simples (sem IA): Sim
   - Atualizar cache: Não
   - Análise visual com IA: Não

ℹ️ Modo simples: cache não será utilizado

ℹ️ Procurando imagens em rename-images/images...
ℹ️ Encontradas 271 imagens para processar

ℹ️ [1/271] Processando: 437_generated.png
ℹ️    Código extraído: 437
ℹ️    📸 Modo simples: imagem adicional detectada (já existe principal na pasta)
ℹ️    📸 Tipo forçado para ADDITIONAL_PHOTO (ângulo adicional detectado)
ℹ️    Novo nome: 437 - AD - 1.png
ℹ️    Movido: 437_generated.png → rename-images/organized/ANEIS - Ouro/437/437 - AD - 1.png
```

## Solução de Problemas

### Arquivos não são processados

- Verifique se o nome do arquivo começa com um código numérico (até 4 dígitos)
- Verifique se o arquivo tem uma extensão de imagem válida (.jpg, .jpeg, .png, .gif, .bmp, .webp)

### Arquivos são movidos para a pasta errada

- Verifique se a estrutura de pastas mãe está sendo mantida corretamente
- Confirme se o código extraído está correto

### Nomenclatura AD não é aplicada

- Verifique se já existe um arquivo principal na pasta de destino
- Confirme se o arquivo principal tem o nome exato do código ou `código - P`
