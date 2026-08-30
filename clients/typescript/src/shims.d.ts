/**
 * OGL-Mini Typescript
 * SHIMS for ONNX Runtime
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
declare module "onnxruntime-web" {
    const ort: any;
    export = ort;
export as namespace ort;
}
declare module "onnxruntime-node" {
    const ort: any;
    export = ort;
export as namespace ort;
}
