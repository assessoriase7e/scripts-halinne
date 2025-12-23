import * as fs from 'fs';
import * as path from 'path';

function isValidFileName(fileName: string): boolean {
  const validPatterns = [
    /^(\d+)\.(png|jpg|jpeg|JPG)$/,
    /^(\d+)-M\.(png|jpg|jpeg|JPG)$/,
    /^(\d+)-P\.(png|jpg|jpeg|JPG)$/,
    /^(\d+)-AD(\d+)\.(png|jpg|jpeg|JPG)$/
  ];
  return validPatterns.some(pattern => pattern.test(fileName));
}

function finalCheck(basePath: string) {
  let totalFiles = 0;
  let validFiles = 0;
  let invalidFiles = 0;
  const invalidList: string[] = [];

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
            totalFiles++;
            if (isValidFileName(file)) {
              validFiles++;
            } else {
              invalidFiles++;
              invalidList.push(`${item}: ${file}`);
            }
          });
        } else {
          scanDirectory(fullPath);
        }
      }
    }
  }

  scanDirectory(basePath);

  console.log('🎯 VERIFICAÇÃO FINAL DOS NOMES DE ARQUIVOS');
  console.log('==========================================');
  console.log(`📊 Total de arquivos: ${totalFiles}`);
  console.log(`✅ Arquivos válidos: ${validFiles}`);
  console.log(`❌ Arquivos inválidos: ${invalidFiles}`);
  console.log(`📈 Taxa de conformidade: ${((validFiles/totalFiles)*100).toFixed(1)}%`);

  if (invalidFiles > 0) {
    console.log(`\n⚠️  Arquivos que ainda precisam de atenção:`);
    invalidList.forEach(item => console.log(`  - ${item}`));
  } else {
    console.log(`\n🎉 Todos os arquivos seguem o padrão correto!`);
  }
}

finalCheck('./rename-images/organized');


