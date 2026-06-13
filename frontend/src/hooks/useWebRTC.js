import { useCallback, useRef, useState } from "react";

export function useWebRTC(socket) {
  const peerRef = useRef(null);
  const dataChannelRef = useRef(null);
  const remotePeerIdRef = useRef(null);
  const roomIdRef = useRef(null);

  const [webrtcStatus, setWebrtcStatus] = useState("WebRTC not started");
  const [dataChannelOpen, setDataChannelOpen] = useState(false);
  const [messages, setMessages] = useState([]);

  const createPeerConnection = useCallback(() => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    peer.onicecandidate = (event) => {
      if (event.candidate && remotePeerIdRef.current) {
        socket.emit("signal", {
          roomId: roomIdRef.current,
          target: remotePeerIdRef.current,
          signal: {
            type: "ice-candidate",
            candidate: event.candidate,
          },
        });
      }
    };

    peer.onconnectionstatechange = () => {
      setWebrtcStatus(`WebRTC: ${peer.connectionState}`);
    };

    peer.ondatachannel = (event) => {
      const channel = event.channel;
      setupDataChannel(channel);
    };

    peerRef.current = peer;
    return peer;
  }, [socket]);

  const setupDataChannel = (channel) => {
    dataChannelRef.current = channel;

    channel.onopen = () => {
      setDataChannelOpen(true);
      setWebrtcStatus("DataChannel open. P2P connected.");
    };

    channel.onclose = () => {
        setDataChannelOpen(false);
        setWebrtcStatus("DataChannel closed.");
        };
    
    channel.onmessage = null;
    
    
  };

  const startAsSender = useCallback(
    async ({ roomId, receiverPeerId }) => {
      roomIdRef.current = roomId;
      remotePeerIdRef.current = receiverPeerId;

      const peer = createPeerConnection();

      const channel = peer.createDataChannel("file-channel", {
        ordered: true,
      });

      setupDataChannel(channel);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.emit("signal", {
        roomId,
        target: receiverPeerId,
        signal: {
          type: "offer",
          sdp: offer,
        },
      });

      setWebrtcStatus("Offer sent. Waiting for answer.");
    },
    [createPeerConnection, socket]
  );

  const handleSignal = useCallback(
    async ({ sender, signal, roomId }) => {
      roomIdRef.current = roomId;

      if (!peerRef.current) {
        createPeerConnection();
      }

      const peer = peerRef.current;
      remotePeerIdRef.current = sender;

      if (signal.type === "offer") {
        await peer.setRemoteDescription(
          new RTCSessionDescription(signal.sdp)
        );

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("signal", {
          roomId,
          target: sender,
          signal: {
            type: "answer",
            sdp: answer,
          },
        });

        setWebrtcStatus("Offer received. Answer sent.");
      }

      if (signal.type === "answer") {
        await peer.setRemoteDescription(
          new RTCSessionDescription(signal.sdp)
        );

        setWebrtcStatus("Answer received. Connecting...");
      }

      if (signal.type === "ice-candidate") {
        if (signal.candidate) {
          await peer.addIceCandidate(
            new RTCIceCandidate(signal.candidate)
          );
        }
      }
    },
    [createPeerConnection, socket]
  );

  const sendTestMessage = () => {
    const channel = dataChannelRef.current;

    if (!channel || channel.readyState !== "open") {
      setWebrtcStatus("DataChannel is not open yet.");
      return;
    }

    channel.send("Hello from peer!");
    setMessages((prev) => [...prev, "Me: Hello from peer!"]);
  };

  const getDataChannel = () => {
  return dataChannelRef.current;
};

  return {
    getDataChannel,
    webrtcStatus,
    dataChannelOpen,
    messages,
    startAsSender,
    handleSignal,
    sendTestMessage,
  };
}



