/**
 * OGL-Mini Typescript
 * Filter Types
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
/**
 * Sanitizer Options
 */
export interface SanitizerOptions {
    maxLength?: number;                                     // Max prompt length
    strictControlChars?: boolean;                           // Remove all control chars
    allowedControlChars?: string[];                         // Allowed Control chars
    removeBidiChars?: boolean;                              // Remove bidirectional symbols
    removeZeroWidthChars?: boolean;                         // Remove zero-width tokens
    normalizeUnicode?: boolean;                             // Unicode normalization
    collapseWhitespace?: boolean;                           // Collapse whitespaces
    filtersWhitelist?: string[];                            // Filter white-list
    customFilters?: ISanitizeFilter[];                      // User-defined filters
}

/**
 * Sanitize Filer Interface
 */
export interface ISanitizeFilter {
    readonly name: string;
    process(text: string, options: SanitizerOptions): string;
}

/**
 * Sanitize Context
 */
export interface SanitizeContext {
    options: SanitizerOptions;
}