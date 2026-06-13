function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes.buffer;
}

export async function generateAESKey() {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyToBase64(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToHex(raw);
}

export async function importKeyFromBase64(hexKey) {
  const raw = hexToBuffer(hexKey);

  return await crypto.subtle.importKey(
    "raw",
    raw,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptChunk(key, chunkBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    chunkBuffer
  );

  return { iv, encrypted };
}

export async function decryptChunk(key, encryptedBuffer, iv) {
  return await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedBuffer
  );
}