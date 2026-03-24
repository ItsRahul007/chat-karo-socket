import { Server, Socket } from "socket.io";
import { EmitMessages, ListenMessages } from "@/util/socket.calls.js";
import {
  addPushTokenInDB,
  sendMessageNotification,
  updateLastSeen,
} from "@/controller/socket.controller.js";
import { ChatMessage } from "@/types/index.js";

const onlineUsers: Map<string, string | null> = new Map(); // userEmail -> roomId

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    const { id: userId, email: userEmail } = socket.data.user;

    onlineUsers.set(userEmail, null);
    socket.join(userId);

    // Join a chat room
    socket.on(ListenMessages.JOIN_ROOM, (roomId: string) => {
      socket.join(roomId);
      onlineUsers.set(userEmail, roomId);
      console.log(`📌 User ${socket.id} joined room: ${roomId}`);
    });

    // Leave a chat room
    socket.on(ListenMessages.LEAVE_ROOM, (roomId: string) => {
      socket.leave(roomId);
      onlineUsers.delete(userEmail);
      console.log(`📤 User ${socket.id} left room: ${roomId}`);
    });

    // Send message
    socket.on(
      ListenMessages.SEND_MESSAGE,
      ({ roomId, message, sender, id }: ChatMessage) => {
        const payload = {
          id,
          message,
          sender,
          roomId,
          timestamp: new Date().toISOString(),
        };
        io.to(roomId).emit(EmitMessages.RECEIVE_MESSAGE, payload);
        console.log(`💬 Message in room ${roomId} from ${sender}`);
      },
    );

    // Typing indicator
    socket.on(
      ListenMessages.TYPING,
      (data: { roomId: string; sender: string }) => {
        socket
          .to(data.roomId)
          .emit(EmitMessages.USER_TYPING, { sender: data.sender });
      },
    );

    socket.on(
      ListenMessages.STOP_TYPING,
      (data: { roomId: string; sender: string }) => {
        socket
          .to(data.roomId)
          .emit(EmitMessages.USER_STOP_TYPING, { sender: data.sender });
      },
    );

    // Register push token
    socket.on(ListenMessages.REGISTER_PUSH_TOKEN, async (token: string) => {
      await addPushTokenInDB(token, userEmail);
    });

    // Disconnect
    socket.on(ListenMessages.DISCONNECT, async () => {
      console.log(`❌ User disconnected: ${socket.id}`);
      await updateLastSeen(userEmail);
      onlineUsers.delete(userEmail);
    });
  });
}
