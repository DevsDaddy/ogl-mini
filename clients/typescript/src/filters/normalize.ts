/**
 * OGL-Mini Typescript
 * Filters Implementation
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
/* Import required modules */
import { ISanitizeFilter } from "./types";

/**
 * Unicode normalization filter
 * Convert to normalized NFC form
 */
export const unicodeNormalizationFilter: ISanitizeFilter = {
    name: 'unicodeNormalization',
    process(text: string): string {
        return text.normalize('NFC');
    }
};