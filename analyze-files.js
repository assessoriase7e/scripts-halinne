import fs from 'fs';
import path from 'path';

function analyzeFiles() {
  const baseDir = './rename-images/organized';

  function walkDir(dir, results = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath, results);
      } else {
        results.push(filePath);
      }
    }

    return results;
  }

  const allFiles = walkDir(baseDir);
  console.log(`Total de arquivos encontrados: ${allFiles.length}\n`);

  // Analisar padrões dos nomes
  const patterns = {
    withSpaces: [],
    suffixes: [],
    otherPatterns: []
  };

  allFiles.forEach(filePath => {
    const fileName = path.basename(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    // Verificar espaços
    if (baseName.includes(' ')) {
      patterns.withSpaces.push(fileName);
    }

    // Verificar sufixos de letras isoladas
    const suffixMatch = baseName.match(/^(\d+)[-_]?([a-zA-Z])$/);
    if (suffixMatch) {
      patterns.suffixes.push({
        original: fileName,
        code: suffixMatch[1],
        suffix: suffixMatch[2].toUpperCase(),
        separator: suffixMatch[0].includes('-') ? '-' : suffixMatch[0].includes('_') ? '_' : ''
      });
    }

    // Outros padrões
    if (baseName.includes(' - ') || baseName.includes('_') || baseName.includes('-AD') || baseName.includes('-3D')) {
      patterns.otherPatterns.push(fileName);
    }
  });

  console.log(`Arquivos com espaços: ${patterns.withSpaces.length}`);
  console.log(`Arquivos com sufixos de letras: ${patterns.suffixes.length}`);
  console.log(`Arquivos com outros padrões: ${patterns.otherPatterns.length}\n`);

  // Mostrar alguns exemplos
  console.log('Exemplos de arquivos com espaços:');
  patterns.withSpaces.slice(0, 10).forEach(file => console.log(`  ${file}`));

  console.log('\nExemplos de arquivos com sufixos:');
  patterns.suffixes.slice(0, 10).forEach(item => console.log(`  ${item.original} -> ${item.code}-${item.suffix}`));

  console.log('\nExemplos de outros padrões:');
  patterns.otherPatterns.slice(0, 10).forEach(file => console.log(`  ${file}`));

  return patterns;
}

analyzeFiles();
