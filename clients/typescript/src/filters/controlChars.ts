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
import { isControlChar } from './utils';

/**
 * Removes Control Chars (C0, C1) expect whitelisted
 * By-default only \n is allowed
 */
export const controlCharsFilter: ISanitizeFilter = {
    name: 'controlChars',
    process(text: string, options: SanitizerOptions = {}): string {
        const allowed = options?.allowedControlChars ?? ['\n'];
        const strict = options?.strictControlChars ?? false;

        if (strict) {
            return text.split('').filter(c => !isControlChar(c)).join('');
        }

        return text.split('').filter(c => {
            if (!isControlChar(c)) return true;
            return allowed.includes(c);
        }).join('');
    },
};