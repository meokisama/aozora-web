// Ambient declarations for untyped third-party modules.

// path-browserify mirrors Node's `path` API — reuse those types.
declare module "path-browserify" {
  import path from "path";
  export default path;
}
