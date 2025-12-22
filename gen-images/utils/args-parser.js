// args-parser.js
// Parser de argumentos de linha de comando

export function parseArgs() {
  const args = process.argv.slice(2);

  // Procura por --suffix=valor ou -s=valor
  let suffix = args.find((arg) => arg.startsWith("--suffix="))?.split("=")[1];
  if (!suffix) {
    suffix = args.find((arg) => arg.startsWith("-s="))?.split("=")[1];
  }

  // Se não encontrou com =, procura por --suffix valor ou -s valor
  if (!suffix) {
    const suffixIndex = args.indexOf("--suffix");
    if (suffixIndex !== -1 && suffixIndex + 1 < args.length) {
      suffix = args[suffixIndex + 1];
    }
  }

  if (!suffix) {
    const sIndex = args.indexOf("-s");
    if (sIndex !== -1 && sIndex + 1 < args.length) {
      suffix = args[sIndex + 1];
    }
  }

  // Remove aspas duplas ou simples do início e fim (se existirem)
  if (suffix) {
    suffix = suffix.trim();
    if (
      (suffix.startsWith('"') && suffix.endsWith('"')) ||
      (suffix.startsWith("'") && suffix.endsWith("'"))
    ) {
      suffix = suffix.slice(1, -1);
    }
  }

  // Validação: só remove se parecer ser uma flag completa (--flag)
  if (suffix && suffix.startsWith("--")) {
    suffix = "";
  }

  // Flags booleanas
  const force = args.includes("--force") || args.includes("-f");
  const clean = args.includes("--clean") || args.includes("-c");
  const status = args.includes("--status") || args.includes("-st");
  const debug = args.includes("--debug") || args.includes("-d");
  const cacheOnly =
    args.includes("--cache-only") || args.includes("--build-cache");

  return {
    suffix: suffix || "",
    force,
    clean,
    status,
    debug,
    cacheOnly,
  };
}
