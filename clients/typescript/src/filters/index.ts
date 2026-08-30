/**
 * OGL-Mini Typescript
 * Some input filters for unsecured characters
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
import { zeroWidthCharsFilter } from './zeroWidth';
import { unicodeNormalizationFilter } from './normalize';
import { controlCharsFilter } from './controlChars';
import { bidiCharsFilter } from './bidiChars';
import { excessiveWhitespaceFilter } from './excessiveWhitespace';
import { lengthLimitFilter } from './lengthLimit';

/* Export all filters */
export * from "./types";
export * from "./utils";

/**
 * Default filters
 */
export const defaultFilters : ISanitizeFilter[] = [
    zeroWidthCharsFilter,
    unicodeNormalizationFilter,
    controlCharsFilter,
    excessiveWhitespaceFilter,
    lengthLimitFilter,
    bidiCharsFilter
];

export {
    zeroWidthCharsFilter,
    unicodeNormalizationFilter,
    controlCharsFilter,
    excessiveWhitespaceFilter,
    lengthLimitFilter,
    bidiCharsFilter
}
