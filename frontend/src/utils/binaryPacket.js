export function createPacket(index, iv, encryptedBuffer) {
  const encryptedBytes = new Uint8Array(encryptedBuffer);

  const packet = new ArrayBuffer(
    4 +          // chunk index
    12 +         // iv
    encryptedBytes.length
  );

  const view = new DataView(packet);

  view.setUint32(0, index, true);

  new Uint8Array(packet, 4, 12).set(iv);

  new Uint8Array(
    packet,
    16,
    encryptedBytes.length
  ).set(encryptedBytes);

  return packet;
}

export function parsePacket(packet) {
  const view = new DataView(packet);

  const index = view.getUint32(0, true);

  const iv = new Uint8Array(
    packet.slice(4, 16)
  );

  const encryptedBuffer =
    packet.slice(16);

  return {
    index,
    iv,
    encryptedBuffer,
  };
}