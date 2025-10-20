import { RenameConfig } from "./types.js";
export declare const INPUT_DIR: string;
export declare const OUTPUT_DIR: string;
export declare const PATTERNS: {
    CODE_EXTRACT: RegExp;
    PRODUCT_ON_STONE: RegExp;
    ADDITIONAL_PHOTO: RegExp;
    VARIANT: RegExp;
    COLOR_VARIANTS: {
        vermelho: string;
        red: string;
        azul: string;
        blue: string;
        verde: string;
        green: string;
        amarelo: string;
        yellow: string;
        preto: string;
        black: string;
        branco: string;
        white: string;
        dourado: string;
        gold: string;
        prata: string;
        silver: string;
        rosa: string;
        pink: string;
        roxo: string;
        purple: string;
    };
};
export declare const RECURSIVE_SEARCH: boolean;
export declare const COPY_FILES: boolean;
export declare const DRY_RUN: boolean;
export declare const LOG_LEVEL: "debug" | "info" | "warn" | "error";
export declare const COUNTERS: {
    additional: Record<string, number>;
    initialized: boolean;
};
export declare const renameConfig: RenameConfig;
//# sourceMappingURL=rename-config.d.ts.map