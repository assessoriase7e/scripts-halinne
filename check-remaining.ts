import * as fs from 'fs';
import * as path from 'path';

console.log('🔍 Verificando arquivos irregulares restantes...\n');

function isValidFileName(fileName: string): boolean {
  const validPatterns = [
    /^(\d+)\.(png|jpg|jpeg|JPG)$/,
    /^(\d+)-M\.(png|jpg|jpeg|JPG)$/,
    /^(\d+)-P\.(png|jpg|jpeg|JPG)$/,
    /^(\d+)-AD(\d+)\.(png|jpg|jpeg|JPG)$/
  ];
  return validPatterns.some(pattern => pattern.test(fileName));
}

function scanForIrregularFiles(basePath: string) {
  const irregularFiles = [];

  function scanDirectory(dirPath: string) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (/^\d+$/.test(item)) {
          const files = fs.readdirSync(fullPath).filter(file =>
            ['.png', '.jpg', '.jpeg', '.JPG'].includes(path.extname(file))
          );

          files.forEach(file => {
            if (!isValidFileName(file)) {
              irregularFiles.push({
                folder: item,
                file: file,
                path: fullPath
              });
            }
          });
        } else {
          scanDirectory(fullPath);
        }
      }
    }
  }

  scanDirectory(basePath);
  return irregularFiles;
}

const irregularFiles = scanForIrregularFiles('./rename-images/organized');

console.log(`Encontrados ${irregularFiles.length} arquivos irregulares:\n`);

irregularFiles.forEach(item => {
  console.log(`📁 ${item.folder}: ${item.file}`);
});

console.log(`\n💡 Casos que podem precisar de atenção manual:`);
const specialCases = irregularFiles.filter(item =>
  item.file.includes('verificar') ||
  item.file.includes('achar') ||
  item.file.includes('coracoes')
);

if (specialCases.length > 0) {
  console.log('Arquivos que podem precisar de verificação manual:');
  specialCases.forEach(item => {
    console.log(`  - ${item.folder}: ${item.file}`);
  });
} else {
  console.log('Nenhum caso especial identificado.');
}


