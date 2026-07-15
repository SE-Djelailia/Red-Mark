// Ambient module declarations for dependencies that ship without TypeScript types.

declare module "pizzip" {
  export interface PizZipGenerateOptions {
    type: "blob" | "nodebuffer" | "uint8array" | "base64" | "arraybuffer" | "string";
    compression?: "STORE" | "DEFLATE";
    mimeType?: string;
  }

  export default class PizZip {
    constructor(data?: ArrayBuffer | Uint8Array | string);
    generate(options: PizZipGenerateOptions): Blob | Uint8Array | string | ArrayBuffer;
  }
}

declare module "docxtemplater-image-module-free" {
  export interface ImageModuleOptions {
    getImage(tagValue: string, tagName: string): ArrayBuffer | Promise<ArrayBuffer>;
    getSize(
      imgBuffer: ArrayBuffer,
      tagValue: string,
      tagName: string,
    ): [number, number] | Promise<[number, number]>;
    centered?: boolean;
  }

  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
