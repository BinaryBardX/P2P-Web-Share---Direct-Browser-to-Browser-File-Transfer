const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const RoomManager =
  require("./src/RoomManager");

const socketHandlers =
  require("./src/socketHandlers");

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.json({
    status: "running"
  });
});

const server =
  http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const roomManager =
  new RoomManager();

socketHandlers(
  io,
  roomManager
);

//const PORT = 5000;

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});