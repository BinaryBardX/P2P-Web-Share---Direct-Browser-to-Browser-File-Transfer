# P2P Web Share – Direct Browser-to-Browser File Transfer

## Overview

P2P Web Share is a secure browser-based file sharing platform that enables direct peer-to-peer file transfer using WebRTC. Unlike traditional file-sharing services, files are transferred directly between users without being uploaded to a central server.

The backend server is used only for signaling and connection establishment. Actual file data never passes through the server.

---

## Live Demo

**Frontend:**
https://p2-p-web-share-direct-browser-to-br.vercel.app/

**Backend (Signaling Server):**
https://p2p-web-share-direct-browser-to-browser.onrender.com

---

## Key Features

* Direct browser-to-browser file transfer using WebRTC
* AES-256 GCM end-to-end encryption
* SHA-256 integrity verification
* Secure room creation and joining
* Shareable encrypted room links
* Chunk-based file transfer
* IndexedDB storage for efficient large-file handling
* Real-time transfer progress tracking
* Live transfer speed monitoring
* Drag-and-drop file upload
* Responsive modern UI
* Cloud deployment using Vercel and Render

---

## How It Works

1. Sender creates a secure room.
2. Receiver joins using the room ID or share link.
3. Backend signaling server exchanges connection metadata.
4. A direct WebRTC peer-to-peer connection is established.
5. Files are split into encrypted chunks.
6. Chunks are transferred directly between browsers.
7. Receiver verifies integrity using SHA-256 hash verification.
8. File is reconstructed and automatically downloaded.

### Architecture

Sender Browser
↓
WebRTC DataChannel
↓
Receiver Browser

Signaling Server (Socket.io)
↓
Room creation
Offer/Answer exchange
ICE candidate exchange

No file data passes through the backend server.

---

## Security Features

### AES-256 GCM Encryption

Each file chunk is encrypted before transmission, ensuring confidentiality during transfer.

### SHA-256 Integrity Verification

The receiver computes a SHA-256 hash of the received file and verifies it against the sender’s hash to ensure file integrity.

### Direct Peer-to-Peer Transfer

Files are transferred directly between browsers and are never stored on backend infrastructure.

---

## Tech Stack

### Frontend

* React
* Vite
* Tailwind CSS
* Socket.io Client

### Backend

* Node.js
* Express.js
* Socket.io

### Browser APIs

* WebRTC DataChannel
* Web Crypto API
* IndexedDB

### Deployment

* Vercel (Frontend)
* Render (Backend)

---

## Local Setup

### Clone Repository

```bash
git clone https://github.com/BinaryBardX/P2P-Web-Share---Direct-Browser-to-Browser-File-Transfer.git
cd P2P-Web-Share---Direct-Browser-to-Browser-File-Transfer
```

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend:

```txt
https://p2-p-web-share-direct-browser-to-br.vercel.app/
```

Backend:

```txt
https://p2p-web-share-direct-browser-to-browser.onrender.com
```

---

## Author

**Sheetal Shende**

Indian Institute of Technology Roorkee

---

Developed as a secure, decentralized file-sharing solution using WebRTC and modern web technologies.
