import * as fs from 'fs';
import * as path from 'path';

interface RenameOperation {
  oldPath: string;
  newPath: string;
  reason: string;
}

const COLOR_WORDS = [
  'azul', 'verde', 'vermelho', 'rosa', 'branco', 'preto', 'amarelo',
  'branca', 'preta', 'pink', 'colorido', 'transp'
];

const SCENARIO_WORDS = [
  'cenario', 'cenário', 'inf', 'Tp', 'Tpng'
];

const VARIANT_WORDS = [
  'menina', 'menino', 'maior', 'menor', 'cópia', 'GG'
];

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

function shouldRenameFile(fileName: string): boolean {
  // Check if file already follows valid patterns
  const validPatterns = [
    /^(\d+)\.(png|jpg|jpeg|JPG)$/,           // Main image
    /^(\d+)-M\.(png|jpg|jpeg|JPG)$/,         // Model
    /^(\d+)-P\.(png|jpg|jpeg|JPG)$/,         // Product/Scenario
    /^(\d+)-AD(\d+)\.(png|jpg|jpeg|JPG)$/    // Additional
  ];

  return !validPatterns.some(pattern => pattern.test(fileName));
}

function classifyAndRename(fileName: string, folderPath: string): { newName: string; reason: string } | null {
  const match = fileName.match(/^(\d+)(.+)\.(png|jpg|jpeg|JPG)$/);
  if (!match) return null;

  const code = match[1];
  const suffix = match[2].toLowerCase();
  const ext = match[3];

  // Rule 1: -p → -P (scenario/product)
  if (suffix === '-p') {
    return {
      newName: `${code}-P.${ext}`,
      reason: 'Cenário/produto: -p → -P'
    };
  }

  // Rule 2: -2 → -AD1 (additional image)
  if (suffix === '-2') {
    return {
      newName: `${code}-AD1.${ext}`,
      reason: 'Imagem adicional: -2 → -AD1'
    };
  }

  // Rule 3: -T → -P (scenario)
  if (suffix === '-t') {
    return {
      newName: `${code}-P.${ext}`,
      reason: 'Cenário: -T → -P'
    };
  }

  // Rule 4: Color words → -AD<n>
  const colorMatch = COLOR_WORDS.find(color => suffix.includes(color));
  if (colorMatch) {
    const nextAD = getNextADNumber(folderPath, code);
    return {
      newName: `${code}-AD${nextAD}.${ext}`,
      reason: `Cor (${colorMatch}): ${suffix} → -AD${nextAD}`
    };
  }

  // Rule 5: Scenario words → -P
  const scenarioMatch = SCENARIO_WORDS.find(word => suffix.includes(word));
  if (scenarioMatch) {
    return {
      newName: `${code}-P.${ext}`,
      reason: `Cenário (${scenarioMatch}): ${suffix} → -P`
    };
  }

  // Rule 6: Variant words → -AD<n>
  const variantMatch = VARIANT_WORDS.find(variant => suffix.includes(variant));
  if (variantMatch) {
    const nextAD = getNextADNumber(folderPath, code);
    return {
      newName: `${code}-AD${nextAD}.${ext}`,
      reason: `Variante (${variantMatch}): ${suffix} → -AD${nextAD}`
    };
  }

  // Rule 7: Special cases
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

  // Rule 8: Complex cases that need manual review
  if (suffix.includes('verificar') || suffix.includes('achar')) {
    return null; // Skip these, need manual review
  }

  // Default: if we can't classify, return null to skip
  return null;
}

function processFolders(basePath: string): RenameOperation[] {
  const operations: RenameOperation[] = [];

  function processDirectory(dirPath: string) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Check if this is a code folder (contains only numbers)
        if (/^\d+$/.test(item)) {
          processCodeFolder(fullPath, item);
        } else {
          // Continue scanning subdirectories
          processDirectory(fullPath);
        }
      }
    }
  }

  function processCodeFolder(folderPath: string, code: string) {
    const files = fs.readdirSync(folderPath).filter(file =>
      ['.png', '.jpg', '.jpeg', '.JPG'].includes(path.extname(file))
    );

    files.forEach(file => {
      if (shouldRenameFile(file)) {
        const renameResult = classifyAndRename(file, folderPath);
        if (renameResult) {
          const oldPath = path.join(folderPath, file);
          const newPath = path.join(folderPath, renameResult.newName);

          operations.push({
            oldPath,
            newPath,
            reason: renameResult.reason
          });
        }
      }
    });
  }

  processDirectory(basePath);
  return operations;
}

function executeRenames(operations: RenameOperation[], dryRun: boolean = true) {
  console.log(`\n=== ${dryRun ? 'SIMULAÇÃO' : 'EXECUÇÃO'} DAS RENOMEAÇÕES ===\n`);

  operations.forEach((op, index) => {
    const oldFile = path.basename(op.oldPath);
    const newFile = path.basename(op.newPath);
    const folder = path.basename(path.dirname(op.oldPath));

    console.log(`${index + 1}. 📁 ${folder}`);
    console.log(`   ${oldFile} → ${newFile}`);
    console.log(`   💡 ${op.reason}`);

    if (!dryRun) {
      try {
        fs.renameSync(op.oldPath, op.newPath);
        console.log(`   ✅ Renomeado com sucesso`);
      } catch (error) {
        console.log(`   ❌ Erro ao renomear: ${error}`);
      }
    }
    console.log('');
  });

  console.log(`Total de operações: ${operations.length}`);
  if (dryRun) {
    console.log('\n🔍 Esta foi uma simulação. Execute com dryRun=false para aplicar as mudanças.');
  }
}

// Main execution
const basePath = './rename-images/organized';
console.log(`Analisando pasta: ${basePath}\n`);

const operations = processFolders(basePath);

if (operations.length === 0) {
  console.log('✅ Nenhum arquivo precisa ser renomeado!');
} else {
  // First show dry run
  executeRenames(operations, true);

  // Ask user if they want to proceed
  console.log('\n❓ Deseja executar as renomeações? (y/N): ');
  // Note: In a real interactive script, we'd wait for user input
  // For now, we'll just show what would be done
}


