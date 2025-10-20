#!/usr/bin/env ts-node
import fs from "fs/promises";
import path from "path";

/**
 * Script para adicionar extensão .js a todos os imports relativos em arquivos TypeScript
 * Isso é necessário para compatibilidade com ES modules
 */

const EXTENSIONS_TO_PROCESS = [".ts"];
const DIRS_TO_PROCESS = ["src", "match-images", "rename-images"];
const DIRS_TO_EXCLUDE = ["node_modules", "dist"];

interface ImportMatch {
  fullMatch: string;
  importPath: string;
  line: string;
}

/**
 * Verifica se o caminho é um import relativo (começa com ./ ou ../)
 */
function isRelativeImport(importPath: string): boolean {
  return importPath.startsWith("./") || importPath.startsWith("../");
}

/**
 * Verifica se o import já tem extensão .js
 */
function hasJsExtension(importPath: string): boolean {
  return importPath.endsWith(".js");
}

/**
 * Extrai todos os imports de uma linha de código
 */
function extractImports(line: string): ImportMatch[] {
  const imports: ImportMatch[] = [];
  
  // Padrão para import { ... } from "path" ou import ... from "path"
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(line)) !== null) {
    imports.push({
      fullMatch: match[0],
      importPath: match[1],
      line: line,
    });
  }
  
  // Padrão para import("path") - dynamic imports
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  
  while ((match = dynamicImportRegex.exec(line)) !== null) {
    imports.push({
      fullMatch: match[0],
      importPath: match[1],
      line: line,
    });
  }
  
  return imports;
}

/**
 * Adiciona .js ao caminho do import se necessário
 */
function addJsExtension(importPath: string): string {
  if (!isRelativeImport(importPath)) {
    return importPath; // Não modificar imports de node_modules
  }
  
  if (hasJsExtension(importPath)) {
    return importPath; // Já tem .js
  }
  
  return `${importPath}.js`;
}

/**
 * Processa um arquivo e adiciona .js aos imports
 */
async function processFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    let modified = false;
    
    const newLines = lines.map((line) => {
      const imports = extractImports(line);
      
      if (imports.length === 0) {
        return line;
      }
      
      let newLine = line;
      
      // Processar cada import encontrado na linha
      for (const importMatch of imports) {
        const newImportPath = addJsExtension(importMatch.importPath);
        
        if (newImportPath !== importMatch.importPath) {
          // Substituir o caminho antigo pelo novo
          newLine = newLine.replace(
            importMatch.importPath,
            newImportPath
          );
          modified = true;
        }
      }
      
      return newLine;
    });
    
    if (modified) {
      await fs.writeFile(filePath, newLines.join("\n"), "utf-8");
      console.log(`✓ Modificado: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`✗ Erro ao processar ${filePath}:`, error);
    return false;
  }
}

/**
 * Processa todos os arquivos em um diretório recursivamente
 */
async function processDirectory(dirPath: string): Promise<number> {
  let filesModified = 0;
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        if (!DIRS_TO_EXCLUDE.includes(entry.name)) {
          filesModified += await processDirectory(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (EXTENSIONS_TO_PROCESS.includes(ext)) {
          const modified = await processFile(fullPath);
          if (modified) {
            filesModified++;
          }
        }
      }
    }
  } catch (error) {
    console.error(`✗ Erro ao processar diretório ${dirPath}:`, error);
  }
  
  return filesModified;
}

/**
 * Função principal
 */
async function main() {
  console.log("🔧 Adicionando extensões .js aos imports...\n");
  
  let totalFilesModified = 0;
  
  for (const dir of DIRS_TO_PROCESS) {
    console.log(`📁 Processando diretório: ${dir}`);
    const modified = await processDirectory(dir);
    totalFilesModified += modified;
  }
  
  console.log(`\n✅ Concluído! ${totalFilesModified} arquivo(s) modificado(s).`);
}

main().catch((error) => {
  console.error("❌ Erro fatal:", error);
  process.exit(1);
});
