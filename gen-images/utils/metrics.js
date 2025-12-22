// metrics.js
// Métricas e estatísticas de processamento

import { logger } from "./logger.js";

export class Metrics {
  constructor() {
    this.startTime = Date.now();
    this.processed = 0;
    this.successful = 0;
    this.errors = 0;
    this.skipped = 0;
    this.totalFiles = 0;
    this.lastUpdateTime = Date.now();
  }

  incrementProcessed() {
    this.processed++;
  }

  incrementSuccessful() {
    this.successful++;
  }

  incrementError() {
    this.errors++;
  }

  incrementSkipped() {
    this.skipped++;
  }

  setTotalFiles(total) {
    this.totalFiles = total;
  }

  getElapsedTime() {
    return Date.now() - this.startTime;
  }

  getElapsedTimeFormatted() {
    const ms = this.getElapsedTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getAverageTimePerFile() {
    if (this.processed === 0) return 0;
    return this.getElapsedTime() / this.processed;
  }

  getEstimatedTimeRemaining() {
    // Considera apenas arquivos que ainda precisam ser processados (não pulados)
    const remaining = this.totalFiles - this.processed - this.skipped;
    if (remaining <= 0 || this.processed === 0) return 0;

    const avgTime = this.getAverageTimePerFile();
    return remaining * avgTime;
  }

  getEstimatedTimeRemainingFormatted() {
    const ms = this.getEstimatedTimeRemaining();
    if (ms === 0) return "N/A";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  getProgressPercentage() {
    if (this.totalFiles === 0) return 0;
    // Considera arquivos processados + pulados como progresso
    const totalHandled = this.processed + this.skipped;
    return Math.round((totalHandled / this.totalFiles) * 100);
  }

  getSuccessRate() {
    if (this.processed === 0) return 0;
    return Math.round((this.successful / this.processed) * 100);
  }

  logProgress() {
    const progress = this.getProgressPercentage();
    const elapsed = this.getElapsedTimeFormatted();
    const remaining = this.getEstimatedTimeRemainingFormatted();
    const successRate = this.getSuccessRate();

    logger.info(
      `📊 Progresso: ${this.processed}/${this.totalFiles} (${progress}%) | ` +
        `Sucesso: ${this.successful} | Erros: ${this.errors} | ` +
        `Pulados: ${this.skipped} | Taxa de sucesso: ${successRate}% | ` +
        `Tempo decorrido: ${elapsed} | Tempo estimado restante: ${remaining}`
    );
  }

  getSummary() {
    return {
      totalFiles: this.totalFiles,
      processed: this.processed,
      successful: this.successful,
      errors: this.errors,
      skipped: this.skipped,
      progressPercentage: this.getProgressPercentage(),
      successRate: this.getSuccessRate(),
      elapsedTime: this.getElapsedTimeFormatted(),
      averageTimePerFile: Math.round(this.getAverageTimePerFile() / 1000) + "s",
    };
  }

  logSummary() {
    const summary = this.getSummary();
    logger.info("📈 Resumo do processamento:");
    logger.info(`  Total de arquivos: ${summary.totalFiles}`);
    logger.info(`  Processados: ${summary.processed}`);
    logger.info(`  Bem-sucedidos: ${summary.successful}`);
    logger.info(`  Erros: ${summary.errors}`);
    logger.info(`  Pulados: ${summary.skipped}`);
    logger.info(`  Taxa de sucesso: ${summary.successRate}%`);
    logger.info(`  Tempo total: ${summary.elapsedTime}`);
    logger.info(`  Tempo médio por arquivo: ${summary.averageTimePerFile}`);
  }
}


