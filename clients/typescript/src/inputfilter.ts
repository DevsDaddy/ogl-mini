/**
 * OGL-Mini Typescript
 *
 * Input filter for unsecured characters
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
import { ISanitizeFilter, defaultFilters, SanitizerOptions } from "./filters";

/**
 * Default Sanitizer Options
 */
export const DEFAULT_SANITIZER_OPTIONS : SanitizerOptions = {
    maxLength: 0,
    strictControlChars: true,
    allowedControlChars: ['\n'],
    removeBidiChars: true,
    removeZeroWidthChars: true,
    normalizeUnicode: true,
    collapseWhitespace: true
}

/**
 * Sanitizer Service
 */
class SanitizerService {
    // Sanitizer options
    private _options : SanitizerOptions;

    /**
     * Input Sanitizer Service
     * @param options {SanitizerOptions} Sanitizer options
     */
    constructor(options ? : SanitizerOptions) {
        if(!options) options = DEFAULT_SANITIZER_OPTIONS;
        this._options = {...DEFAULT_SANITIZER_OPTIONS, ...options};
    }

    /**
     * Get sanitizer options
     */
    public get options() {
        return this._options;
    }

    /**
     * Set new sanitizer options
     * @param options {SanitizerOptions} Options
     */
    public setOptions(options : SanitizerOptions) {
        this._options = options;
    }

    /**
     * Reset default options
     */
    public resetDefaultOptions () {
        this._options = DEFAULT_SANITIZER_OPTIONS;
        this._options.filtersWhitelist = [];
        this._options.customFilters = [];
    }

    /**
     * Add custom filter
     * @param customFilter {ISanitizeFilter} Custom filter
     */
    public addCustomFilter(customFilter : ISanitizeFilter) {
        if(!this.options.customFilters) this.options.customFilters = [];
        this.options.customFilters?.push(customFilter);
    }

    /**
     * Sanitize user input
     * @param input {string} User input
     * @return {string} Sanitized input
     */
    public sanitize(input : string) : string {
        let output = input;

        // Collect active filters
        let filters : ISanitizeFilter[] = [];
        if (this.options.filtersWhitelist && this.options.filtersWhitelist.length > 0) {
            const whitelistSet = new Set(this.options.filtersWhitelist);
            filters = defaultFilters.filter(f => whitelistSet.has(f.name));
        } else {
            filters = [...defaultFilters];
        }

        // Add custom filters
        if (this.options.customFilters && this.options.customFilters.length > 0) {
            filters.push(...this.options.customFilters);
        }

        // Work with filters list
        for (const filter of filters) {
            switch (filter.name) {
                case 'removeZeroWidthChars':
                    if (this.options.removeZeroWidthChars === false) continue;
                    break;
                case 'bidiChars':
                    if (this.options.removeBidiChars === false) continue;
                    break;
                case 'unicodeNormalization':
                    if (this.options.normalizeUnicode === false) continue;
                    break;
                case 'excessiveWhitespace':
                    if (this.options.collapseWhitespace === false) continue;
                    break;
            }

            output = filter.process(output, this.options);
        }

        return output;
    }
}

// Sanitizer service
export const inputFilter = new SanitizerService();