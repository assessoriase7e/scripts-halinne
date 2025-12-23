import * as fs from 'fs';
import * as path from 'path';

console.log('🚀 Iniciando processo de renomeação de arquivos...\n');

// Regras de renomeação baseadas nas especificações do usuário
function shouldRenameFile(fileName: string): boolean {
  // Padrões válidos que NÃO devem ser renomeados
  const validPatterns = [
    /^(\d+)\.(png|jpg|jpeg|JPG)$/,           // Imagem principal
    /^(\d+)-M\.(png|jpg|jpeg|JPG)$/,         // Modelo
    /^(\d+)-P\.(png|jpg|jpeg|JPG)$/,         // Produto/Cenário
    /^(\d+)-AD(\d+)\.(png|jpg|jpeg|JPG)$/    // Imagem adicional
  ];

  return !validPatterns.some(pattern => pattern.test(fileName));
}

function getNextADNumber(folderPath: string, code: string): number {
  const files = fs.readdirSync(folderPath);
  const adPattern = new RegExp(`^${code}-AD(\\d+)\\.`);
  let maxAD = 0;

  files.forEach(file => {
    const match = file.match(adPattern);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxAD) maxAD = num;
    }
  });

  return maxAD + 1;
}

function classifyFile(fileName: string, folderPath: string): { newName: string; reason: string } | null {
  const match = fileName.match(/^(\d+)(.+?)\.(png|jpg|jpeg|JPG)$/);
  if (!match) return null;

  const code = match[1];
  const suffix = match[2].toLowerCase();
  const ext = match[3];

  // Regra 1: Cenário/Produto (-p → -P)
  if (suffix === '-p') {
    return {
      newName: `${code}-P.${ext}`,
      reason: 'Cenário/produto: -p → -P'
    };
  }

  // Regra 2: Imagem adicional (-2 → -AD1)
  if (suffix === '-2') {
    return {
      newName: `${code}-AD1.${ext}`,
      reason: 'Imagem adicional: -2 → -AD1'
    };
  }

  // Regra 3: Cenário (-T → -P)
  if (suffix === '-t') {
    return {
      newName: `${code}-P.${ext}`,
      reason: 'Cenário: -T → -P'
    };
  }

  // Regra 4: Cores → -AD<n>
  const colors = ['azul', 'verde', 'vermelho', 'rosa', 'branco', 'preto', 'amarelo', 'branca', 'preta', 'pink', 'colorido', 'transp'];
  const colorMatch = colors.find(color => suffix.includes(color));
  if (colorMatch) {
    const nextAD = getNextADNumber(folderPath, code);
    return {
      newName: `${code}-AD${nextAD}.${ext}`,
      reason: `Cor (${colorMatch}): ${suffix} → -AD${nextAD}`
    };
  }

  // Regra 5: Cenário (inf, cenario, etc. → -P)
  const scenarioWords = ['inf', 'cenario', 'cenário', 'Tp', 'Tpng'];
  const scenarioMatch = scenarioWords.find(word => suffix.includes(word));
  if (scenarioMatch) {
    return {
      newName: `${code}-P.${ext}`,
      reason: `Cenário (${scenarioMatch}): ${suffix} → -P`
    };
  }

  // Regra 6: Variantes → -AD<n>
  const variants = ['menina', 'menino', 'maior', 'menor', 'cópia', 'GG'];
  const variantMatch = variants.find(variant => suffix.includes(variant));
  if (variantMatch) {
    const nextAD = getNextADNumber(folderPath, code);
    return {
      newName: `${code}-AD${nextAD}.${ext}`,
      reason: `Variante (${variantMatch}): ${suffix} → -AD${nextAD}`
    };
  }

  // Regra 7: Casos especiais
  if (suffix === '-3d2' || suffix === '-3d1') {
    const nextAD = getNextADNumber(folderPath, code);
    return {
      newName: `${code}-AD${nextAD}.${ext}`,
      reason: `3D: ${suffix} → -AD${nextAD}`
    };
  }

  if (suffix.includes('mm')) {
    const nextAD = getNextADNumber(folderPath, code);
    return {
      newName: `${code}-AD${nextAD}.${ext}`,
      reason: `Tamanho: ${suffix} → -AD${nextAD}`
    };
  }

  return null;
}

function processCodeFolder(folderPath: string, code: string): number {
  const files = fs.readdirSync(folderPath).filter(file =>
    ['.png', '.jpg', '.jpeg', '.JPG'].includes(path.extname(file))
  );

  let renamedCount = 0;

  files.forEach(file => {
    if (shouldRenameFile(file)) {
      const renameResult = classifyFile(file, folderPath);
      if (renameResult) {
        const oldPath = path.join(folderPath, file);
        const newPath = path.join(folderPath, renameResult.newName);

        try {
          fs.renameSync(oldPath, newPath);
          console.log(`✅ ${code}: ${file} → ${renameResult.newName} (${renameResult.reason})`);
          renamedCount++;
        } catch (error) {
          console.log(`❌ Erro ao renomear ${file}: ${error}`);
        }
      }
    }
  });

  return renamedCount;
}

function processAllFolders(basePath: string): { totalRenamed: number; foldersProcessed: number } {
  let totalRenamed = 0;
  let foldersProcessed = 0;

  function scanDirectory(dirPath: string) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (/^\d+$/.test(item)) {
          // É uma pasta de código
          const renamed = processCodeFolder(fullPath, item);
          foldersProcessed++;
          if (renamed > 0) {
            totalRenamed += renamed;
          }
        } else {
          // Continua escaneando subdiretórios
          scanDirectory(fullPath);
        }
      }
    }
  }

  scanDirectory(basePath);
  return { totalRenamed, foldersProcessed };
}

// Executa o processamento
const basePath = './rename-images/organized';
console.log(`📂 Processando pasta: ${basePath}\n`);

const result = processAllFolders(basePath);

console.log(`\n📊 RESULTADO FINAL:`);
console.log(`📁 Pastas processadas: ${result.foldersProcessed}`);
console.log(`🔄 Arquivos renomeados: ${result.totalRenamed}`);
console.log(`✅ Processo concluído com sucesso!`);


