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
import { ISanitizeFilter, SanitizerOptions } from "./types";

/**
 * Limit text length
 */
export const lengthLimitFilter: ISanitizeFilter = {
    name: 'lengthLimit',
    process(text: string, options: SanitizerOptions = {}): string {
        const max = options.maxLength ?? 10000;
        if (max <= 0) return text;
        return text.length > max ? text.slice(0, max) : text;
    }
}