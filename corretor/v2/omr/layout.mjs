import { composeLayout as legacyCompose, validateLayoutManifest as legacyValidate, LayoutCapacityError } from './layout-v1.mjs?v=20261114v2h1';
import { composeV2, validateV2, V2_SCHEMA } from './layout-v2.mjs?v=20261114v2h1';
export { PAGE_WIDTH_MM, PAGE_HEIGHT_MM, INITIAL_GEOMETRY, LayoutCapacityError } from './layout-v1.mjs?v=20261114v2h1';
export const LAYOUT_MANIFEST_VERSION=V2_SCHEMA;
export function composeLayout(input,options={}) { return input?.layoutVersion==='v1'||input?.version==='salta-omr-a4-v7'||options.layoutVersion==='v1'?legacyCompose(input,options):composeV2(input,options); }
export function validateLayoutManifest(m){return m?.schemaVersion===V2_SCHEMA?validateV2(m):legacyValidate(m);}
export function createLayoutManifest(input,options={}) {const result=composeLayout(input,options);if(!result.validation.valid)throw new LayoutCapacityError(result.validation);return result.manifest;}
