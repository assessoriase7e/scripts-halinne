# Script de Busca de Duplicatas

Script para encontrar imagens duplicadas usando hash SHA256 com cache JSON.

## 🎯 Funcionalidades

- ✅ Calcula hash SHA256 de todas as imagens
- ✅ Mantém cache JSON para evitar recalcular hashes já processados
- ✅ Valida cache comparando data de modificação dos arquivos
- ✅ Identifica grupos de imagens duplicadas
- ✅ Relatório detalhado com estatísticas e espaço desperdiçado

## 📋 Como Usar

### Executar o script

```bash
yarn find-duplicates
```

ou

```bash
npm run find-duplicates
```

### Configuração

Edite as constantes no início do arquivo `find-duplicates.ts`:

```typescript
const IMAGES_DIR = "rename-images/images"; // Pasta onde buscar imagens
const CACHE_FILE = "rename-images/image-hash-cache.json"; // Arquivo de cache
const RECURSIVE = true; // Buscar recursivamente
```

## 📊 Saída do Script

O script gera:

1. **Estatísticas gerais**:
   - Total de imagens processadas
   - Imagens únicas encontradas
   - Número de grupos de duplicatas
   - Espaço desperdiçado em MB

2. **Detalhes dos grupos de duplicatas**:
   - Hash SHA256 do grupo
   - Lista de todos os arquivos duplicados
   - Tamanho de cada arquivo
   - Indicação de qual arquivo manter (✓) e quais deletar (✗)

## 💾 Cache

O cache é armazenado em `rename-images/image-hash-cache.json` e contém:

- Hash SHA256 de cada arquivo
- Tamanho do arquivo
- Data de modificação (para validação)
- Timestamp de quando foi calculado

**Vantagens do cache:**
- Execuções subsequentes são muito mais rápidas
- Apenas arquivos novos ou modificados são recalculados
- Cache é validado automaticamente pela data de modificação

## 🔍 Exemplo de Saída

```
═══════════════════════════════════════════
📊 RELATÓRIO DE DUPLICATAS
═══════════════════════════════════════════

   Total de imagens: 3148
   Imagens únicas: 2800
   Grupos de duplicatas: 15
   Total de arquivos duplicados: 363
   Espaço desperdiçado: 45.23 MB

═══════════════════════════════════════════
📋 DETALHES DAS DUPLICATAS
═══════════════════════════════════════════

🔴 Grupo 1 - 25 duplicatas (12.5 MB total)
   Hash: a1b2c3d4e5f6g7h8...
   Arquivos:
   ✓ 1. rename-images/images/cadastradas-parte-1/image1.jpg (500.00 KB)
   ✗ 2. rename-images/images/transfer/image1_copy.jpg (500.00 KB)
   ✗ 3. rename-images/images/geradas-novas/image1_duplicate.jpg (500.00 KB)
   ...
```

## 🗑️ Limpeza de Duplicatas

O script apenas **identifica** duplicatas. Para deletá-las, você pode:

1. Usar o script `cleanup-duplicates.ts` que já existe no projeto
2. Deletar manualmente os arquivos marcados com ✗
3. Criar um script adicional que use a saída deste script

## ⚙️ Formato do Cache

```json
{
  "rename-images/images/file1.jpg": {
    "hash": "a1b2c3d4e5f6...",
    "size": 512000,
    "modified": 1703251200000,
    "calculatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

## 🔄 Atualização do Cache

O cache é atualizado automaticamente quando:
- Um arquivo é modificado (data de modificação muda)
- Um novo arquivo é encontrado
- O hash não existe no cache

## 📝 Notas

- O script usa hash SHA256, garantindo precisão total na detecção
- Arquivos com mesmo conteúdo mas nomes diferentes serão detectados como duplicatas
- O cache acelera significativamente execuções subsequentes
- O arquivo de cache está no `.gitignore` e não será versionado



