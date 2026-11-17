/**
 * Triggers a browser download for an in-memory text or JSON payload.
 */
export function downloadFile(
  filename: string,
  content: string,
  mimeType = 'application/json'
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
