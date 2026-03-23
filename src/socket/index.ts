import { Server, Socket } from "socket.io";
import { Expo } from "expo-server-sdk";
import { EmitMessages, ListenMessages } from "../util/socket.calls.js";
import {
  addPushTokenInDB,
  updateLastSeen,
} from "../controller/socket.controller.js";
import { pushNotificationHelper } from "../util/push.notification.js";

const onlineUsers: Map<string, string> = new Map(); // userEmail -> socketId

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`✅ User connected: ${socket.id}`);
    const userEmail = socket.data.user.email;

    onlineUsers.set(userEmail, socket.id);

    // Join a chat room
    socket.on(ListenMessages.JOIN_ROOM, (roomId: string) => {
      socket.join(roomId);
      console.log(`📌 User ${socket.id} joined room: ${roomId}`);
      socket
        .to(roomId)
        .emit(EmitMessages.USER_JOINED, { userId: socket.id, roomId });
    });

    // Leave a chat room
    socket.on(ListenMessages.LEAVE_ROOM, (roomId: string) => {
      socket.leave(roomId);
      console.log(`📤 User ${socket.id} left room: ${roomId}`);
      socket
        .to(roomId)
        .emit(EmitMessages.USER_LEFT, { userId: socket.id, roomId });
    });

    // Send message
    socket.on(
      ListenMessages.SEND_MESSAGE,
      (data: { roomId: string; message: string; sender: string }) => {
        const { roomId, message, sender } = data;
        const payload = {
          id: `${socket.id}-${Date.now()}`,
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
      console.log(`📌 User ${socket.id} registered push token: ${token}`);
      console.log(`📌 Is valid Expo token: ${Expo.isExpoPushToken(token)}`);
      onlineUsers.set(userEmail, token);

      // try {
      //   const tickets = await pushNotificationHelper.sendNotifications({
      //     tokens: [token],
      //     title: "Welcome to Chat Karo",
      //     body: "You are now connected to Chat Karo",
      //   });
      //   console.log("🔔 Notification tickets:", JSON.stringify(tickets));
      // } catch (err) {
      //   console.error("❌ Notification send error:", err, "token: ", token);
      // }

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
