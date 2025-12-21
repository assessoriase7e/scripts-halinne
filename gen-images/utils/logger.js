// logger.js
// Sistema de logs estruturado

import fs from "fs";
import path from "path";
import { config } from "./config.js";

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor() {
    this.logLevel = LOG_LEVELS.INFO;
    this.logFile = null;
    this.logStream = null;
    this.initializeLogFile();
  }

  initializeLogFile() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logFileName = `processing-${timestamp}.log`;
      this.logFile = path.join(config.logDir, logFileName);
      this.logStream = fs.createWriteStream(this.logFile, { flags: "a" });
    } catch (error) {
      console.error(`Erro ao inicializar arquivo de log: ${error.message}`);
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    let formatted = `[${timestamp}] ${levelStr} ${message}`;

    if (data) {
      formatted += ` ${JSON.stringify(data)}`;
    }

    return formatted;
  }

  writeLog(level, message, data = null) {
    const formatted = this.formatMessage(level, message, data);

    // Console output
    if (level === "error") {
      console.error(formatted);
    } else if (level === "warn") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // File output
    if (this.logStream) {
      this.logStream.write(formatted + "\n");
    }
  }

  debug(message, data = null) {
    if (this.logLevel <= LOG_LEVELS.DEBUG) {
      this.writeLog("debug", message, data);
    }
  }

  info(message, data = null) {
    if (this.logLevel <= LOG_LEVELS.INFO) {
      this.writeLog("info", message, data);
    }
  }

  warn(message, data = null) {
    if (this.logLevel <= LOG_LEVELS.WARN) {
      this.writeLog("warn", message, data);
    }
  }

  error(message, data = null) {
    if (this.logLevel <= LOG_LEVELS.ERROR) {
      this.writeLog("error", message, data);
    }
  }

  setLevel(level) {
    if (typeof level === "string") {
      this.logLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    } else {
      this.logLevel = level;
    }
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

export const logger = new Logger();


