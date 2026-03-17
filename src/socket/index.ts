import { Server, Socket } from "socket.io";

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Join a chat room
    socket.on("join-room", (roomId: string) => {
      socket.join(roomId);
      console.log(`📌 User ${socket.id} joined room: ${roomId}`);
      socket.to(roomId).emit("user-joined", { userId: socket.id, roomId });
    });

    // Leave a chat room
    socket.on("leave-room", (roomId: string) => {
      socket.leave(roomId);
      console.log(`📤 User ${socket.id} left room: ${roomId}`);
      socket.to(roomId).emit("user-left", { userId: socket.id, roomId });
    });

    // Send message
    socket.on("send-message", (data: { roomId: string; message: string; sender: string }) => {
      const { roomId, message, sender } = data;
      const payload = {
        id: `${socket.id}-${Date.now()}`,
        message,
        sender,
        roomId,
        timestamp: new Date().toISOString(),
      };
      io.to(roomId).emit("receive-message", payload);
      console.log(`💬 Message in room ${roomId} from ${sender}`);
    });

    // Typing indicator
    socket.on("typing", (data: { roomId: string; sender: string }) => {
      socket.to(data.roomId).emit("user-typing", { sender: data.sender });
    });

    socket.on("stop-typing", (data: { roomId: string; sender: string }) => {
      socket.to(data.roomId).emit("user-stop-typing", { sender: data.sender });
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });
}
