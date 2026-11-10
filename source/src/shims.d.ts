declare module "heic-convert" {
  const convert: (opts: { buffer: ArrayBuffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer>;
  export default convert;
}

// esbuild inlines fonts as bytes (loader: binary)
declare module "*.woff" {
  const data: Uint8Array;
  export default data;
}
