# Pasta JOIN - Imagens para Classificar

Esta pasta contém imagens desordenadas que serão automaticamente classificadas pelo sistema.

## Como Usar:

1. **Adicione suas imagens aqui**: Copie todas as imagens que precisam ser classificadas
2. **Execute o script**: `node match-images/agnostic-match.js`
3. **Verifique os resultados**: As imagens classificadas estarão em `organized/`

## Processo Automático:

O sistema irá:
- Analisar cada imagem usando IA
- Comparar com imagens de referência nas pastas base
- Encontrar a melhor correspondência
- Renomear seguindo o padrão configurado
- Mover para a pasta apropriada

## Nomenclatura Final:

As imagens serão renomeadas seguindo o padrão:
`[nome_da_pasta] - [M] - [número]`

Exemplos:
- `Aneis - M - 001.jpg`
- `Brincos - M - 002.png`
- `Colares - M - 001.jpg`
