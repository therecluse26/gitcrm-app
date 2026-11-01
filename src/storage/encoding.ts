// UTF-8 Base64 for the Contents API, and Git blob SHAs computed in the browser.

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // In slices: spreading a whole large file into fromCharCode overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToUtf8(base64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
}

// Git's blob ID: SHA-1 of "blob <byte length>\0" and the bytes. Lets the app check, without a
// download, whether main holds exactly the text it wrote.
export async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
