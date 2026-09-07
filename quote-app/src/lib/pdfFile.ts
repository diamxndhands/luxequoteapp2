// Split out from lib/pdfToImage.ts on purpose: this file never imports pdfjs-dist (a
// large dependency, loaded on demand — see UploadStep's dynamic import), so checking
// "is this a PDF" doesn't force it into the main bundle for the common case, an
// uploaded photo.
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
