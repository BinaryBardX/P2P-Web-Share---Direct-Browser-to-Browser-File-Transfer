const { nanoid } = require("nanoid");

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(senderSocketId) {
    const roomId = nanoid(8);

    this.rooms.set(roomId, {
      roomId,
      sender: senderSocketId,
      receiver: null,
      createdAt: Date.now()
    });

    return roomId;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, receiverSocketId) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return {
        success: false,
        error: "ROOM_NOT_FOUND"
      };
    }

    if (room.receiver) {
      return {
        success: false,
        error: "ROOM_FULL"
      };
    }

    room.receiver = receiverSocketId;

    return {
      success: true,
      room
    };
  }

  removePeer(socketId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (
        room.sender === socketId ||
        room.receiver === socketId
      ) {
        this.rooms.delete(roomId);

        return room;
      }
    }

    return null;
  }
}

module.exports = RoomManager;