# Script de Limpeza de Duplicatas

## Descrição

Este script compara imagens entre duas pastas usando hash SHA256 do conteúdo dos arquivos e exclui duplicatas da pasta de origem.

## Como Funciona

1. **Calcula hash SHA256** de todas as imagens na pasta de destino (referência)
2. **Compara** cada imagem da pasta de origem com os hashes da pasta de destino
3. **Identifica duplicatas** - arquivos com mesmo hash de conteúdo
4. **Deleta** as duplicatas da pasta de origem (se não estiver em modo de simulação)

## Vantagens do Hash SHA256

- **Preciso**: Compara o conteúdo real dos arquivos, não apenas nome ou tamanho
- **Rápido**: Não usa IA, apenas cálculo matemático
- **Confiável**: Mesmo que os arquivos tenham nomes diferentes, se o conteúdo for idêntico, serão detectados como duplicatas

## Configuração

Edite as constantes no início do arquivo `cleanup-duplicates.ts`:

```typescript
const SOURCE_DIR = "rename-images/images"; // Pasta onde verificar duplicatas
const TARGET_DIR = "rename-images/organized"; // Pasta de referência
const DRY_RUN = false; // true para simular sem deletar
const RECURSIVE = true; // Buscar em subpastas
```

## Como Usar

### 1. Modo de Simulação (Recomendado primeiro)

```bash
# Edite o arquivo e defina DRY_RUN = true
yarn tsx rename-images/cleanup-duplicates.ts
```

Isso mostrará quais arquivos SERIAM deletados sem realmente deletá-los.

### 2. Executar Limpeza Real

```bash
# Edite o arquivo e defina DRY_RUN = false
yarn tsx rename-images/cleanup-duplicates.ts
```

Isso deletará as duplicatas encontradas.

## Exemplo de Saída

```
═══════════════════════════════════════════
🧹 LIMPEZA DE DUPLICATAS
═══════════════════════════════════════════

⚙️ Configurações:
   - Pasta de origem (verificar duplicatas): rename-images/images
   - Pasta de destino (referência): rename-images/organized
   - Modo de simulação: Não
   - Busca recursiva: Sim

📂 Listando imagens na pasta de destino (referência)...
   ✅ Encontradas 150 imagens na pasta de destino

📂 Listando imagens na pasta de origem...
   ✅ Encontradas 75 imagens na pasta de origem

🔐 Calculando hashes da pasta de destino (referência)...
   Processado: 150/150
   ✅ 150 hashes únicos calculados

🔍 Verificando duplicatas na pasta de origem...

   🔄 Duplicata encontrada:
      Origem: rename-images/images/12345_generated.png
      Destino: rename-images/organized/12345/12345.png
      Hash: a1b2c3d4e5f6g7h8...
      Tamanho: 245.67 KB

═══════════════════════════════════════════
📊 RESUMO
═══════════════════════════════════════════

   Total de imagens na origem: 75
   Total de imagens no destino: 150
   Duplicatas encontradas: 23

🗑️ Deletando duplicatas...

   ✅ Deletado: rename-images/images/12345_generated.png
   ...

═══════════════════════════════════════════
✅ LIMPEZA CONCLUÍDA!
═══════════════════════════════════════════

   Arquivos deletados: 23
   Erros: 0
   Espaço liberado: 5.47 MB
```

## Segurança

- **Sempre execute em modo de simulação primeiro** (`DRY_RUN = true`)
- O script **nunca** deleta arquivos da pasta de destino (organized)
- Apenas deleta da pasta de origem (images) se houver duplicata confirmada na pasta de destino
- Use controle de versão (git) ou faça backup antes de executar

## Casos de Uso

### Cenário 1: Após processar imagens
Você processou imagens da pasta `images` para `organized`. Algumas imagens podem ter sido copiadas ao invés de movidas, criando duplicatas.

### Cenário 2: Reprocessamento
Você rodou o script de rename múltiplas vezes e agora tem duplicatas na pasta de origem.

### Cenário 3: Limpeza geral
Quer garantir que não há duplicatas entre as duas pastas.

## Integração com o Sistema

Este script funciona de forma independente e complementar ao sistema de rename:

1. **rename-images.ts**: Processa e organiza imagens (agora com detecção de hash)
2. **cleanup-duplicates.ts**: Limpa duplicatas que possam ter sido criadas
3. **cache.ts**: Armazena hashes para evitar reprocessamento

## Notas Importantes

- O script compara apenas o **conteúdo** dos arquivos (hash SHA256)
- Arquivos com mesmo conteúdo mas nomes diferentes serão considerados duplicatas
- Metadados (EXIF, data de criação, etc.) **não** são considerados na comparação
- O hash é calculado do arquivo completo, garantindo precisão total
