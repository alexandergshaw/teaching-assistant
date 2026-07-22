// Read a browser File into the app's standard upload shape (base64, no data: prefix).
async function readUploadFile(
  file: File
): Promise<{ name: string; base64: string; mimeType: string }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { name: file.name, base64, mimeType: file.type || "application/octet-stream" };
}

// Decode a base64 payload (e.g. a file returned by the Course Engine API) and
// trigger a browser download.
function downloadBase64File(base64: string, fileName: string, mimeType: string) {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getCommentPrefix(language?: string): string {
  const lang = (language ?? "").toLowerCase();
  if (["sql", "haskell", "lua"].includes(lang)) return "--";
  if (["python", "ruby", "bash", "shell", "r", "perl", "elixir", "coffeescript"].includes(lang)) return "#";
  if (["html", "xml"].includes(lang)) return "<!--";
  if (["css"].includes(lang)) return "/*";
  if (lang) return "//";
  return "#";
}

export { readUploadFile, downloadBase64File, getCommentPrefix };
