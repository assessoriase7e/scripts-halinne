import * as fs from 'fs';
import * as path from 'path';

interface FileAnalysis {
  folder: string;
  code: string;
  files: string[];
  irregularFiles: string[];
  pattern: 'regular' | 'needs_rename' | 'mixed';
}

const VALID_PATTERNS = {
  MAIN: /^(\d+)\.(png|jpg|jpeg|JPG)$/,
  MODEL: /^(\d+)-M\.(png|jpg|jpeg|JPG)$/,
  PRODUCT: /^(\d+)-P\.(png|jpg|jpeg|JPG)$/,
  ADDITIONAL: /^(\d+)-AD(\d+)\.(png|jpg|jpeg|JPG)$/
};

function isValidFileName(fileName: string): boolean {
  return Object.values(VALID_PATTERNS).some(pattern => pattern.test(fileName));
}

function analyzeFolder(folderPath: string): FileAnalysis {
  const folderName = path.basename(folderPath);
  const files = fs.readdirSync(folderPath).filter(file =>
    ['.png', '.jpg', '.jpeg', '.JPG'].includes(path.extname(file))
  );

  const irregularFiles = files.filter(file => !isValidFileName(file));

  let pattern: 'regular' | 'needs_rename' | 'mixed' = 'regular';
  if (irregularFiles.length === files.length) {
    pattern = 'needs_rename';
  } else if (irregularFiles.length > 0) {
    pattern = 'mixed';
  }

  // Extract code from folder name (assuming format like [aneis][aneis-ouro]\1289)
  const codeMatch = folderPath.match(/\\(\d+)$/);
  const code = codeMatch ? codeMatch[1] : 'unknown';

  return {
    folder: folderName,
    code,
    files,
    irregularFiles,
    pattern
  };
}

function scanAllFolders(basePath: string): FileAnalysis[] {
  const results: FileAnalysis[] = [];

  function scanDirectory(dirPath: string) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Check if this is a code folder (contains only numbers)
        if (/^\d+$/.test(item)) {
          results.push(analyzeFolder(fullPath));
        } else {
          // Continue scanning subdirectories
          scanDirectory(fullPath);
        }
      }
    }
  }

  scanDirectory(basePath);
  return results;
}

function printAnalysis(results: FileAnalysis[]) {
  console.log('=== ANÁLISE DOS NOMES DE ARQUIVOS ===\n');

  const needsRename = results.filter(r => r.pattern === 'needs_rename');
  const mixed = results.filter(r => r.pattern === 'mixed');
  const regular = results.filter(r => r.pattern === 'regular');

  console.log(`📁 Total de pastas analisadas: ${results.length}`);
  console.log(`✅ Pastas com nomes corretos: ${regular.length}`);
  console.log(`🔄 Pastas com arquivos mistos: ${mixed.length}`);
  console.log(`❌ Pastas que precisam renomeação: ${needsRename.length}\n`);

  if (needsRename.length > 0) {
    console.log('=== PASTAS QUE PRECISAM RENOMEAR ===');
    needsRename.forEach(result => {
      console.log(`📂 ${result.folder}:`);
      result.irregularFiles.forEach(file => {
        console.log(`  ❌ ${file}`);
      });
      console.log('');
    });
  }

  if (mixed.length > 0) {
    console.log('=== PASTAS COM ARQUIVOS MISTOS ===');
    mixed.forEach(result => {
      console.log(`📂 ${result.folder}:`);
      console.log('  ✅ Arquivos corretos:');
      result.files.filter(f => isValidFileName(f)).forEach(file => {
        console.log(`    ${file}`);
      });
      console.log('  ❌ Arquivos irregulares:');
      result.irregularFiles.forEach(file => {
        console.log(`    ${file}`);
      });
      console.log('');
    });
  }

  console.log('=== RESUMO DOS PADRÕES IRREGULARES ===');
  const allIrregular = results.flatMap(r => r.irregularFiles);
  const patterns = allIrregular.reduce((acc, file) => {
    const pattern = file.replace(/^\d+/, '').replace(/\.(png|jpg|jpeg|JPG)$/, '');
    acc[pattern] = (acc[pattern] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(patterns)
    .sort(([,a], [,b]) => b - a)
    .forEach(([pattern, count]) => {
      console.log(`${pattern}: ${count} arquivos`);
    });
}

// Execute analysis
const basePath = './rename-images/organized';
console.log(`Analisando pasta: ${basePath}\n`);
const results = scanAllFolders(basePath);
printAnalysis(results);


