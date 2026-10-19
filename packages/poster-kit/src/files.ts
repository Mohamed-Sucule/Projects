/* Getting a finished file out of the page: as a data URL to embed in another file, or as a
   download. */

/** A blob as a data URL, with its media type set to `type`. */
export function blobToDataUrl(blob: Blob, type: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result.replace(/^data:[^;]*;/, `data:${type};`))
        : reject(new Error('Could not read a file'));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read a file'));
    reader.readAsDataURL(blob);
  });
}

/** Save a blob under `name`, the way a download link would. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
