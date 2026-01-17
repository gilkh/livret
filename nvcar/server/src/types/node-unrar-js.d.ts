declare module 'node-unrar-js' {
  export interface FileHeader {
    name: string
    flags?: {
      directory?: boolean
    }
  }

  export interface ArcList {
    fileHeaders: Generator<FileHeader>
  }

  export interface ArcFile<withContent = Uint8Array> {
    fileHeader: FileHeader
    extraction?: withContent
  }

  export interface ArcFiles<withContent = Uint8Array> {
    files: Generator<ArcFile<withContent>>
  }

  export interface Extractor<withContent = Uint8Array> {
    getFileList(): ArcList
    extract(options?: { files?: string[]; password?: string }): ArcFiles<withContent>
  }

  export function createExtractorFromData(options: {
    data: ArrayBuffer
    wasmBinary?: ArrayBuffer
    password?: string
  }): Promise<Extractor<Uint8Array>>
}
