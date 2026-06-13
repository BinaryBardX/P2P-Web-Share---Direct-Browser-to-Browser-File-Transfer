import { useState } from "react";
import { encryptChunk, decryptChunk } from "./useCrypto";
import {
  createPacket
} from "../utils/binaryPacket";
//import { createPacket } from "../utils/binaryPacket";
const CHUNK_SIZE = 64 * 1024;

async function sha256Hex(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useFileTransfer() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [transferStatus, setTransferStatus] = useState("No file selected");

  const sendFile = async (file, channel, aesKey) => {
    if (!file || !channel || channel.readyState !== "open" || !aesKey) {
      setTransferStatus("Missing file, DataChannel, or AES key");
      return;
    }

    setTransferStatus("Hashing file...");
    setProgress(0);

    const fileBuffer = await file.arrayBuffer();
    const fileHash = await sha256Hex(fileBuffer);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    channel.send(JSON.stringify({
      type: "file-meta",
      name: file.name,
      size: file.size,
      mime: file.type,
      totalChunks,
      fileHash,
      encrypted: true
    }));

    setTransferStatus("Encrypting and sending file...");

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const plainChunk = fileBuffer.slice(start, end);

      const { iv, encrypted } = await encryptChunk(aesKey, plainChunk);

    //   const frame = {
    //     type: "encrypted-chunk",
    //     index: i,
    //     iv: Array.from(iv),
    //     data: Array.from(new Uint8Array(encrypted)),
    //   };
    const packet = createPacket(
        i,
        iv,
        encrypted
        );

        channel.send(packet);

      while (channel.bufferedAmount > 2 * 1024 * 1024) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      //channel.send(JSON.stringify(frame));
      setProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    channel.send(JSON.stringify({ type: "file-complete" }));
    setTransferStatus("Encrypted file sent successfully");
  };

  const decryptReceivedChunk = async (msg, aesKey) => {
    const encryptedBuffer = new Uint8Array(msg.data).buffer;
    const iv = new Uint8Array(msg.iv);
    return await decryptChunk(aesKey, encryptedBuffer, iv);
  };

  return {
    selectedFile,
    setSelectedFile,
    progress,
    setProgress,
    transferStatus,
    setTransferStatus,
    sendFile,
    sha256Hex,
    decryptReceivedChunk,
  };
}