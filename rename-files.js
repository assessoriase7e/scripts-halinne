import fs from 'fs';
import path from 'path';

function renameFiles() {
  const baseDir = './rename-images/organized';
  const logFile = './rename-log.txt';

  let renamedCount = 0;
  let errorCount = 0;
  const log = [];

  function logMessage(message) {
    log.push(message);
    console.log(message);
  }

  function walkDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath);
      } else {
        const result = processFile(filePath);
        if (result.renamed) {
          renamedCount++;
          logMessage(`Renomeado: ${result.oldName} -> ${result.newName}`);
        } else if (result.error) {
          errorCount++;
          logMessage(`Erro: ${result.error}`);
        }
      }
    }
  }

  function processFile(filePath) {
    const dir = path.dirname(filePath);
    const oldName = path.basename(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);

    let newBaseName = baseName;

    // 1. Remover todos os espaços
    newBaseName = newBaseName.replace(/\s+/g, '');

    // 2. Padronizar sufixos de letras isoladas
    // Padrões como: 123P, 123-P, 123_P, 123p, 123-p, 123_p
    const suffixMatch = newBaseName.match(/^(\d+)[-_]?([a-zA-Z])$/);
    if (suffixMatch) {
      const code = suffixMatch[1];
      const suffix = suffixMatch[2].toUpperCase();
      newBaseName = `${code}-${suffix}`;
    }

    // 3. Tratamentos especiais
    // Converter underscores para hífens em padrões como 123_1
    newBaseName = newBaseName.replace(/_/g, '-');

    // Padronizar "-AD" patterns
    newBaseName = newBaseName.replace(/-AD-/g, '-AD-');
    newBaseName = newBaseName.replace(/-AD/g, '-AD');

    // Remover múltiplos hífens consecutivos
    newBaseName = newBaseName.replace(/-+/g, '-');

    // Remover hífen no início se existir
    newBaseName = newBaseName.replace(/^-/, '');

    const newName = newBaseName + ext.toLowerCase();
    const newPath = path.join(dir, newName);

    // Verificar se o nome mudou
    if (oldName === newName) {
      return { renamed: false };
    }

    // Verificar se o arquivo de destino já existe
    if (fs.existsSync(newPath)) {
      return {
        renamed: false,
        error: `Arquivo já existe: ${newPath} (tentando renomear ${oldName})`
      };
    }

    try {
      fs.renameSync(filePath, newPath);
      return {
        renamed: true,
        oldName: path.relative(baseDir, filePath),
        newName: path.relative(baseDir, newPath)
      };
    } catch (error) {
      return {
        renamed: false,
        error: `Erro ao renomear ${filePath}: ${error.message}`
      };
    }
  }

  logMessage('Iniciando renomeação de arquivos...');
  logMessage(`Diretório base: ${baseDir}\n`);

  walkDir(baseDir);

  logMessage(`\nProcessamento concluído:`);
  logMessage(`- Arquivos renomeados: ${renamedCount}`);
  logMessage(`- Erros: ${errorCount}`);
  logMessage(`- Total processado: ${renamedCount + errorCount}`);

  // Salvar log em arquivo
  try {
    fs.writeFileSync(logFile, log.join('\n'), 'utf8');
    logMessage(`\nLog salvo em: ${logFile}`);
  } catch (error) {
    logMessage(`\nErro ao salvar log: ${error.message}`);
  }
}

renameFiles();



