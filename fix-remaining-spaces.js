import fs from 'fs';
import path from 'path';

function fixRemainingSpaces() {
  const baseDir = './rename-images/organized';

  function walkDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath);
      } else {
        processFile(filePath);
      }
    }
  }

  function processFile(filePath) {
    const dir = path.dirname(filePath);
    const oldName = path.basename(filePath);

    // Verificar se ainda há espaços no nome
    if (!oldName.includes(' ')) {
      return;
    }

    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);

    // Remover espaços
    const newBaseName = baseName.replace(/\s+/g, '');
    const newName = newBaseName + ext.toLowerCase();
    const newPath = path.join(dir, newName);

    // Se o arquivo de destino já existe, adicionar um sufixo numérico
    let finalPath = newPath;
    let counter = 1;
    while (fs.existsSync(finalPath) && finalPath !== filePath) {
      const finalBaseName = newBaseName + '-' + counter;
      finalPath = path.join(dir, finalBaseName + ext.toLowerCase());
      counter++;
    }

    if (finalPath !== filePath) {
      try {
        fs.renameSync(filePath, finalPath);
        console.log(`Corrigido: ${path.relative(baseDir, filePath)} -> ${path.relative(baseDir, finalPath)}`);
      } catch (error) {
        console.error(`Erro ao corrigir ${filePath}: ${error.message}`);
      }
    }
  }

  console.log('Corrigindo arquivos restantes com espaços...');
  walkDir(baseDir);
  console.log('Correção concluída.');
}

fixRemainingSpaces();



