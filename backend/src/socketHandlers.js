module.exports = (io, roomManager) => {
  io.on("connection", (socket) => {

    console.log(`Connected: ${socket.id}`);

    socket.on("room:create", () => {

      const roomId =
        roomManager.createRoom(socket.id);

      socket.join(roomId);

      socket.emit("room:created", {
        roomId
      });

      console.log(
        `Room created ${roomId}`
      );
    });

    socket.on("room:join", ({ roomId }) => {

      const result =
        roomManager.joinRoom(
          roomId,
          socket.id
        );

      if (!result.success) {

        socket.emit("error", {
          code: result.error
        });

        return;
      }

      socket.join(roomId);

      socket.emit("room:joined", {
        roomId
      });

      io.to(result.room.sender)
        .emit("peer:joined", {
          roomId,
          peerId: socket.id
        });

      console.log(
        `${socket.id} joined ${roomId}`
      );
    });

    socket.on("signal", (data) => {

  console.log(
    "SIGNAL:",
    data.signal.type,
    "FROM:",
    socket.id,
    "TO:",
    data.target
  );

  const {
    roomId,
    target,
    signal
  } = data;

  io.to(target).emit("signal", {
    roomId,
    sender: socket.id,
    signal
  });
});

    socket.on("disconnect", () => {

      console.log(
        `Disconnected ${socket.id}`
      );

      const room =
        roomManager.removePeer(socket.id);

      if (room) {

        const otherPeer =
          room.sender === socket.id
            ? room.receiver
            : room.sender;

        if (otherPeer) {
          io.to(otherPeer).emit(
            "peer:left"
          );
        }
      }
    });
  });
};