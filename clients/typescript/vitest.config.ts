/**
 * OGL-Mini Typescript Tests
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
import {defineConfig} from 'vitest/config';

/* Define tests config */
export default defineConfig({
    test: {
        silent: false,
        reporters: ['verbose'],
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['scripts/**', 'dist/**'],
        },
    },
});