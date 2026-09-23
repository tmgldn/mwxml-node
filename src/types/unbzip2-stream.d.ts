declare module "unbzip2-stream" {
  import type { Transform } from "node:stream";

  /**
   * Creates a streaming bzip2 decompressor (an optional dependency used
   * for reading `.bz2` dumps).
   */
  export default function unbzip2Stream(): Transform;
}
