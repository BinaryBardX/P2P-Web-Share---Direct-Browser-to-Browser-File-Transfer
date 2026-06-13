import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { useWebRTC } from "./hooks/useWebRTC";
import { useFileTransfer } from "./hooks/useFileTransfer";
import {
  generateAESKey,
  exportKeyToBase64,
  importKeyFromBase64,
} from "./hooks/useCrypto";
import "./App.css";
import { parsePacket } from "./utils/binaryPacket";
import {
  saveChunk,
  getChunk,
  clearFileChunks,
} from "./utils/indexedDbFileStore";
// const socket = io("http://localhost:5000", {
//   autoConnect: false,
// });
const socket = io("https://p2p-web-share-direct-browser-to-browser.onrender.com", {
  autoConnect: false,
});

function App() {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [aesKey, setAesKey] = useState(null);
  const aesKeyRef = useRef(null);
  const [shareKey, setShareKey] = useState("");
  const [speed, setSpeed] = useState("0 MB/s");
  const [isDragging, setIsDragging] = useState(false);
  const receiveMetaRef = useRef(null);
  const chunksRef = useRef([]);
  const receivedCountRef = useRef(0);
  const transferStartRef = useRef(null);
  const receivedBytesRef = useRef(0);

  const {
    webrtcStatus,
    dataChannelOpen,
    messages,
    startAsSender,
    handleSignal,
    sendTestMessage,
    getDataChannel,
  } = useWebRTC(socket);

  const {
    selectedFile,
    setSelectedFile,
    progress,
    setProgress,
    transferStatus,
    setTransferStatus,
    sendFile,
    decryptReceivedChunk,
  } = useFileTransfer();

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setConnected(true);
      setStatus("Connected to signaling server");
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setStatus("Disconnected from signaling server");
    });

    socket.on("room:created", async ({ roomId }) => {
      const key = await generateAESKey();
      const exported = await exportKeyToBase64(key);

      setAesKey(key);
      aesKeyRef.current = key;
      setShareKey(exported);
      setRoomId(roomId);
      setStatus(`Room created: ${roomId}`);
    });

    socket.on("room:joined", async ({ roomId }) => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      //const keyFromUrl = params.get("key");
      const keyFromUrl = decodeURIComponent(params.get("key") || "");
      if (!keyFromUrl) {
        setStatus("Missing AES key in URL hash");
        return;
      }

      const importedKey = await importKeyFromBase64(keyFromUrl);
      setAesKey(importedKey);
      aesKeyRef.current = importedKey;
      setRoomId(roomId);
      setStatus(`Joined room: ${roomId}`);
    });

    socket.on("peer:joined", ({ roomId, peerId }) => {
      setStatus("Peer joined. Starting WebRTC handshake.");
      startAsSender({ roomId, receiverPeerId: peerId });
    });

    socket.on("signal", async (data) => {
      try {
        await handleSignal(data);
      } catch (err) {
        console.error(err);
        setStatus("WebRTC signal error");
      }
    });

    socket.on("peer:left", () => {
      setStatus("Connection lost. Peer disconnected.");
      setTransferStatus("Connection lost. Please reconnect and try again.");
    });

    socket.on("error", ({ code }) => {
      setStatus(`Error: ${code}`);
    });

    return () => {
      socket.off();
      socket.disconnect();
    };
  }, [startAsSender, handleSignal]);

  useEffect(() => {
    const interval = setInterval(() => {
      const channel = getDataChannel();

      if (!channel || channel.__fileHandlerAttached) return;

      channel.__fileHandlerAttached = true;

      channel.addEventListener("message", async (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (!aesKeyRef.current) {
            setTransferStatus("Missing AES key. Cannot decrypt.");
            return;
          }

          const { index, iv, encryptedBuffer } = parsePacket(event.data);

          const msg = {
            index,
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encryptedBuffer)),
          };

          const plainChunk = await decryptReceivedChunk(msg, aesKeyRef.current);

          //chunksRef.current[index] = plainChunk;
          await saveChunk(receiveMetaRef.current.fileId, index, plainChunk);
          receivedCountRef.current += 1;
          receivedBytesRef.current += plainChunk.byteLength;

          const meta = receiveMetaRef.current;

          if (meta) {
            const percent = Math.round(
              (receivedCountRef.current / meta.totalChunks) * 100
            );

            const elapsedSeconds = (Date.now() - transferStartRef.current) / 1000;
            const mbps = receivedBytesRef.current / 1024 / 1024 / elapsedSeconds;

            setProgress(percent);
            setSpeed(`${mbps.toFixed(2)} MB/s`);
          }

          return;
        }

        let msg;

        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "file-meta") {
          //receiveMetaRef.current = msg;
          receiveMetaRef.current = {
            ...msg,
            fileId: `${msg.name}-${msg.size}-${Date.now()}`,
          };
          chunksRef.current = [];
          receivedCountRef.current = 0;
          receivedBytesRef.current = 0;
          transferStartRef.current = Date.now();
          setProgress(0);
          setSpeed("0 MB/s");
          setTransferStatus(`Receiving encrypted file: ${msg.name}`);
          return;
        }

        if (msg.type === "file-complete") {
          
          //console.log("Chunks:", chunksRef.current.length);
          const meta = receiveMetaRef.current;

          const orderedChunks = [];

          for (let i = 0; i < meta.totalChunks; i++) {
            const chunk = await getChunk(meta.fileId, i);

            if (!chunk) {
              setTransferStatus(`Missing chunk ${i}. File incomplete.`);
              return;
            }

            orderedChunks.push(chunk);
          }
          //console.log("Expected Hash:", meta.fileHash);
          //console.log("Received Hash:", receivedHash);
          const blob = new Blob(orderedChunks, {
            type: meta.mime || "application/octet-stream",
          });

          const receivedBuffer = await blob.arrayBuffer();
          const receivedHashBuffer = await crypto.subtle.digest(
            "SHA-256",
            receivedBuffer
          );

          const receivedHash = [...new Uint8Array(receivedHashBuffer)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          //console.log("Expected Hash:", meta.fileHash);
          //console.log("Received Hash:", receivedHash);

          if (receivedHash !== meta.fileHash) {
            setTransferStatus("Hash mismatch! File corrupted.");
            return;
          }

          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = meta.name;
          a.click();
          URL.revokeObjectURL(url);
          await clearFileChunks(meta.fileId, meta.totalChunks);


          setProgress(100);
          setTransferStatus("AES-GCM decrypted, SHA-256 verified, downloaded");
        }
      });
    }, 500);

    return () => clearInterval(interval);
  }, [getDataChannel, setProgress, setTransferStatus, aesKey]);

  const createRoom = () => socket.emit("room:create");

  const joinRoom = () => {
    if (!joinRoomId.trim()) {
      setStatus("Enter a room ID first");
      return;
    }

    socket.emit("room:join", { roomId: joinRoomId.trim() });
  };

  const handleSendFile = async () => {
    const channel = getDataChannel();

    if (!selectedFile) {
      setTransferStatus("Choose a file first");
      return;
    }

    const start = Date.now();

    const timer = setInterval(() => {
      if (!selectedFile) return;

      const elapsedSeconds = (Date.now() - start) / 1000;
      const sentBytes = (progress / 100) * selectedFile.size;
      const mbps = sentBytes / 1024 / 1024 / elapsedSeconds;

      if (Number.isFinite(mbps)) {
        setSpeed(`${mbps.toFixed(2)} MB/s`);
      }
    }, 500);

    await sendFile(selectedFile, channel, aesKeyRef.current);

    clearInterval(timer);
  };

  const shareLink =
    roomId && shareKey
      //? `${window.location.origin}?room=${roomId}#key=${shareKey}`
      ? `${window.location.origin}?room=${roomId}#key=${encodeURIComponent(shareKey)}`
      : "";
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];

    if (file) {
      setSelectedFile(file);
      setTransferStatus(`Selected file: ${file.name}`);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">
            Decentralized P2P File Share
          </h1>
          <p className="text-slate-400 mt-3">
            WebRTC DataChannel + AES-GCM Encryption + SHA-256 Verification
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">Connection</h2>

            <div className="space-y-3">
              <div className="flex justify-between bg-slate-800 rounded-xl p-3">
                <span>Socket</span>
                <span className={connected ? "text-green-400" : "text-red-400"}>
                  {connected ? "Connected" : "Disconnected"}
                </span>
              </div>

              <div className="flex justify-between bg-slate-800 rounded-xl p-3">
                <span>DataChannel</span>
                <span
                  className={
                    dataChannelOpen ? "text-green-400" : "text-yellow-400"
                  }
                >
                  {dataChannelOpen ? "P2P Connected" : "Connection Lost / Not Connected"}
                </span>
              </div>

              <p className="text-sm text-slate-400">{status}</p>
              <p className="text-sm text-cyan-300">{webrtcStatus}</p>
            </div>

            <button
              onClick={createRoom}
              className="w-full mt-5 bg-blue-600 hover:bg-blue-700 rounded-xl py-3 font-semibold"
            >
              Create Secure Room
            </button>

            {roomId && (
              <div className="mt-5 bg-slate-800 rounded-xl p-4 break-all">
                {/* <p className="text-sm text-slate-400">Room ID</p> */}
                {/* <p className="font-mono text-cyan-300">{roomId}</p> */}
                <div className="space-y-2">
                  <p className="text-slate-400">Room ID</p>

                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={roomId}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-cyan-400"
                    />

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(roomId);
                        alert("Room ID copied!");
                      }}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                {/* <p className="text-sm text-slate-400 mt-4">Encrypted Share Link</p>
                <p className="font-mono text-green-300 text-sm">{shareLink}</p> */}

                <div className="space-y-2">
                  <p className="text-slate-400">Encrypted Share Link</p>

                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={shareLink}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-green-400"
                    />

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareLink);
                        alert("Share link copied!");
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <input
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Enter room ID"
                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 outline-none"
              />
              <button
                onClick={joinRoom}
                className="bg-emerald-600 hover:bg-emerald-700 px-5 rounded-xl font-semibold"
              >
                Join
              </button>
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">Encrypted File Transfer</h2>

            <label
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                isDragging
                  ? "border-cyan-400 bg-cyan-400/10"
                  : "border-slate-600 hover:border-cyan-400"
              }`}
            >
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setSelectedFile(file);
                    setTransferStatus(`Selected file: ${file.name}`);
                  }
                }}
              />

              <p className="text-lg font-semibold">
                {selectedFile ? selectedFile.name : "Drag & drop a file here"}
              </p>

              <p className="text-sm text-slate-400 mt-2">
                or click to choose file · AES-GCM encrypted before transfer
              </p>
            </label>

            <button
              disabled={!dataChannelOpen || !selectedFile}
              onClick={handleSendFile}
              className="w-full mt-5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl py-3 font-semibold"
            >
              Send Encrypted File
            </button>

            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>{transferStatus}</span>
                <span>{progress}%</span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-xl p-4">
                  <p className="text-sm text-slate-400">Transfer Speed</p>
                  <p className="text-xl font-bold text-cyan-300">{speed}</p>
                </div>

                <div className="bg-slate-800 rounded-xl p-4">
                  <p className="text-sm text-slate-400">Security</p>
                  <p className="text-xl font-bold text-green-400">AES-256</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl mt-6">
          <h2 className="text-xl font-semibold mb-4">P2P Test Messages</h2>

          <button
            onClick={sendTestMessage}
            className="bg-slate-700 hover:bg-slate-600 px-5 py-2 rounded-xl"
          >
            Send Test P2P Message
          </button>

          <div className="mt-4 max-h-40 overflow-auto text-sm text-slate-300 space-y-1">
            {messages.map((msg, index) => (
              <p key={index}>{msg}</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;