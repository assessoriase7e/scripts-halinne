# Configuração de Exemplo

## Estrutura Criada:

```
match-images/
├── base/           # ✅ Pastas de referência criadas
│   ├── Aneis/      # Para anéis e alianças
│   ├── Brincos/    # Para brincos e argolas  
│   ├── Colares/    # Para colares e correntes
│   └── Pulseiras/  # Para pulseiras e braceletes
├── join/           # ✅ Pasta para imagens desordenadas
└── agnostic-match.ts # ✅ Script principal
```

## Próximos Passos:

### 1. Adicionar Imagens de Referência
```bash
# Exemplo: adicionar referências para anéis
cp suas_fotos_de_aneis/* match-images/base/Aneis/

# Exemplo: adicionar referências para brincos  
cp suas_fotos_de_brincos/* match-images/base/Brincos/
```

### 2. Adicionar Imagens para Classificar
```bash
# Copiar todas as imagens desordenadas
cp suas_imagens_desordenadas/* match-images/join/
```

### 3. Executar o Sistema
```bash
# Compilar TypeScript
npx tsc

# Executar classificação
node match-images/agnostic-match.js
```

### 4. Verificar Resultados
```bash
# Ver imagens organizadas
ls -la match-images/organized/

# Ver detalhes de cada match
cat match-images/organized/*/*_info.json
```

## Personalização:

Edite `match-images/match-config.ts` para:
- Alterar padrão de nomenclatura
- Ajustar similaridade mínima
- Modificar caminhos das pastas
- Configurar operações (copiar vs mover)
