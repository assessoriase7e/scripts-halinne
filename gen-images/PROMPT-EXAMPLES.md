# Prompts Personalizados por Subpasta

O script suporta prompts personalizados para cada subpasta através de arquivos `prompt.txt`.

## Como Funciona

1. Crie um arquivo `prompt.txt` em qualquer subpasta dentro de `input/`
2. O prompt personalizado será usado para todas as imagens daquela subpasta
3. Se não houver `prompt.txt`, o prompt padrão será usado

## Estrutura de Pastas

```
input/
├── pedra/
│   ├── anel-ouro/
│   │   ├── prompt.txt          ← Prompt personalizado para esta subpasta
│   │   ├── 1564.png
│   │   └── ...
│   ├── anel-prata/
│   │   ├── prompt.txt          ← Outro prompt personalizado
│   │   └── ...
│   └── colar-ouro/
│       └── ...                 ← Usa prompt padrão (sem prompt.txt)
```

## Exemplo de prompt.txt

```
A realistic photograph of a silver ring positioned in the center of two stacked stones. Both stones remain fully visible, with golden cracks. The lighting, shadows, and overall color tones blend perfectly. Warm atmosphere in shades of beige and gold, high realism, smooth integration.
```

## Prompt Padrão

Se não houver `prompt.txt` na subpasta, o prompt padrão será usado:

```
A realistic photograph of a piece positioned in the center of two stacked stones. Both stones remain fully visible. The lighting, shadows, and overall color tones blend perfectly. High realism, smooth integration.
```

## Observações

- O arquivo `prompt.txt` deve conter apenas o texto do prompt (sem aspas ou formatação especial)
- Espaços em branco no início e fim são removidos automaticamente
- Se o arquivo estiver vazio ou houver erro ao ler, o prompt padrão será usado
- O script loga quando um prompt personalizado é detectado

## Exemplo de Uso

1. Crie o arquivo `input/pedra/anel-prata/prompt.txt` com seu prompt personalizado
2. Execute o script normalmente: `node nano-banana-batch-gen.js -s="-P"`
3. Todas as imagens em `anel-prata/` usarão o prompt personalizado
4. Imagens em outras subpastas continuarão usando o prompt padrão

