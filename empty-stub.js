// Build-time stand-in for native-binary packages (sharp, @xenova/transformers,
// onnxruntime-node) that cannot load in workerd. Any route that actually
// reaches one of these at runtime must go through the media container instead —
// this stub exists so the bundler never tries to resolve a .node binary.
//
// Named exports cover every symbol src/ imports from the stubbed packages
// (rolldown checks them statically); each throws on use, never on import.
function fail() {
  throw new Error(
    "native-binary module was stubbed for the Workers build; route this call through the media container"
  );
}

const throwing = new Proxy(fail, { get: fail, construct: fail, apply: fail });

export default throwing;
export const pipeline = throwing;
export const RawImage = throwing;
export const AutoProcessor = throwing;
export const CLIPVisionModelWithProjection = throwing;
export const env = throwing;
