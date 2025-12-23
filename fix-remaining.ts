import * as fs from 'fs';
import * as path from 'path';

console.log('🔧 Corrigindo arquivos irregulares restantes...\n');

function renameFile(oldPath: string, newPath: string, reason: string) {
  try {
    fs.renameSync(oldPath, newPath);
    console.log(`✅ ${path.basename(oldPath)} → ${path.basename(newPath)} (${reason})`);
    return true;
  } catch (error) {
    console.log(`❌ Erro ao renomear ${path.basename(oldPath)}: ${error}`);
    return false;
  }
}

function fixIrregularFiles(basePath: string) {
  let fixedCount = 0;

  function scanDirectory(dirPath: string) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (/^\d+$/.test(item)) {
          fixedCount += fixCodeFolder(fullPath, item);
        } else {
          scanDirectory(fullPath);
        }
      }
    }
  }

  function fixCodeFolder(folderPath: string, code: string): number {
    const files = fs.readdirSync(folderPath).filter(file =>
      ['.png', '.jpg', '.jpeg', '.JPG'].includes(path.extname(file))
    );

    let folderFixed = 0;

    files.forEach(file => {
      const match = file.match(/^(\d+)(.+?)\.(png|jpg|jpeg|JPG)$/);
      if (!match) return;

      const fileCode = match[1];
      const suffix = match[2].toLowerCase();
      const ext = match[3];
      let newName = null;
      let reason = '';

      // Correções específicas
      if (suffix === '-ad-1') {
        newName = `${fileCode}-AD1.${ext}`;
        reason = 'Correção: -AD-1 → -AD1';
      } else if (suffix === '-ad-2') {
        newName = `${fileCode}-AD2.${ext}`;
        reason = 'Correção: -AD-2 → -AD2';
      } else if (suffix === 'tp') {
        newName = `${fileCode}-P.${ext}`;
        reason = 'Cenário: Tp → -P';
      } else if (suffix === 'tpng') {
        newName = `${fileCode}-P.${ext}`;
        reason = 'Cenário: Tpng → -P';
      } else if (suffix === '-gg') {
        newName = `${fileCode}-AD1.${ext}`;
        reason = 'Variante: -GG → -AD1';
      } else if (suffix === '-pp') {
        newName = `${fileCode}-P.${ext}`;
        reason = 'Cenário: -PP → -P';
      } else if (suffix === '-') {
        // Arquivos com apenas hífen - provavelmente erro, remover
        newName = `${fileCode}.${ext}`;
        reason = 'Correção: - → (removido)';
      } else if (suffix === 'p') {
        newName = `${fileCode}-P.${ext}`;
        reason = 'Cenário: p → -P';
      } else if (suffix.includes('pedra') || suffix.includes('prata')) {
        // Cores específicas
        const existingFiles = fs.readdirSync(folderPath);
        const adNumbers = existingFiles
          .map(f => f.match(new RegExp(`^${fileCode}-AD(\\d+)\\.`)))
          .filter(m => m)
          .map(m => parseInt(m[1]))
          .sort((a,b) => b-a);
        const nextNum = adNumbers.length > 0 ? adNumbers[0] + 1 : 1;
        newName = `${fileCode}-AD${nextNum}.${ext}`;
        reason = `Cor (${suffix}): → -AD${nextNum}`;
      } else if (suffix === '-g') {
        newName = `${fileCode}-AD1.${ext}`;
        reason = 'Variante: -G → -AD1';
      } else if (suffix === '-ad-p-p') {
        newName = `${fileCode}-P.${ext}`;
        reason = 'Cenário: -AD-P-P → -P';
      } else if (suffix === '-ad-p') {
        newName = `${fileCode}-P.${ext}`;
        reason = 'Cenário: -AD-P → -P';
      } else if (suffix === '-ad-m-p') {
        newName = `${fileCode}-P.${ext}`;
        reason = 'Cenário: -AD-M-P → -P';
      } else if (suffix === '-ad-m') {
        newName = `${fileCode}-M.${ext}`;
        reason = 'Modelo: -AD-M → -M';
      } else if (suffix === '-ad1-m') {
        newName = `${fileCode}-M.${ext}`;
        reason = 'Modelo: -AD1-M → -M';
      } else if (suffix === '-ad2-m') {
        newName = `${fileCode}-M.${ext}`;
        reason = 'Modelo: -AD2-M → -M';
      }

      if (newName && newName !== file) {
        const oldPath = path.join(folderPath, file);
        const newPath = path.join(folderPath, newName);
        if (renameFile(oldPath, newPath, reason)) {
          folderFixed++;
        }
      }
    });

    return folderFixed;
  }

  scanDirectory(basePath);
  return fixedCount;
}

// Casos que precisam atenção manual
function showManualCases() {
  console.log('\n⚠️  CASOS QUE PRECISAM DE ATENÇÃO MANUAL:');
  console.log('Estes arquivos podem precisar de verificação antes da renomeação:');

  const manualCases = [
    { folder: '3', file: '3coracoesacharcodigo.png', issue: 'Nome estranho, verificar se é válido' },
    { folder: '3', file: '3coracoesacharcodigop.png', issue: 'Nome estranho, verificar se é válido' },
    { folder: '823', file: '823(verificarmesmanumeracao).jpg', issue: 'Nota de verificação, provavelmente deve ser removido' }
  ];

  manualCases.forEach(item => {
    console.log(`  📁 ${item.folder}: ${item.file}`);
    console.log(`     💡 ${item.issue}`);
  });

  console.log('\nPara estes casos, você pode:');
  console.log('1. Verificar manualmente o conteúdo dos arquivos');
  console.log('2. Renomear se apropriado');
  console.log('3. Remover se forem apenas notas/auxiliares');
}

// Executa as correções
const basePath = './rename-images/organized';
const fixedCount = fixIrregularFiles(basePath);

console.log(`\n📊 RESULTADO:`);
console.log(`🔧 Arquivos corrigidos automaticamente: ${fixedCount}`);

showManualCases();


