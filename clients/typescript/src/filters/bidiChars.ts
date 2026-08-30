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
 * Remove bidirectional characters from text (Bidi controls)
 */
export const bidiCharsFilter: ISanitizeFilter = {
    name: 'bidiChars',
    process(text: string): string {
        // U+200E LRM, U+200F RLM, U+202A LRE, U+202B RLE, U+202C PDF,
        // U+202D LRO, U+202E RLO, U+2066 LRI, U+2067 RLI, U+2068 FSI, U+2069 PDI
        return text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
    },
}