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
 * Removes excessive whitespace from text
 */
export const excessiveWhitespaceFilter: ISanitizeFilter = {
    name: 'excessiveWhitespace',
    process(text: string): string {
        return text.replace(/[ \t]+/g, ' ').trim();
    }
};