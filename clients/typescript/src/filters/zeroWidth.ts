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
 * Zero-width characters filter
 * Remove all invisible characters from Cf category (Format):
 * ZWSP, ZWNJ, ZWJ, WJ, soft hyphen, etc.
 *
 * Protect from hidden instructions calling
 */
export const zeroWidthCharsFilter: ISanitizeFilter = {
    name: 'zeroWidthChars',
    process(text: string): string {
        return text.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '');
    }
};