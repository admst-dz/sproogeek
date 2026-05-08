/**
 * Trigger a browser download for a Blob/Buffer-like response body.
 * Centralised so we don't repeat the URL.createObjectURL/anchor dance everywhere.
 */
export function downloadBlob(data, filename, mime = 'application/pdf') {
    const url = window.URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}
