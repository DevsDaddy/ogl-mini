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
/**
 * Check Control Char
 * @param char {string} Control Character
 */
export function isControlChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code <= 0x1f && code !== 0x0a && code !== 0x0d) || (code >= 0x7f && code <= 0x9f);
}