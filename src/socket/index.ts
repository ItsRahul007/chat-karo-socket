import { Server, Socket } from "socket.io";
import { EmitMessages, ListenMessages } from "@/util/socket.calls.js";
import {
  addPushTokenInDB,
  updateLastSeen,
  sendMessageNotification,
  getParticipantUserIds,
  sendNotificationToSingleUser,
} from "@/controller/socket.controller.js";
import { Message } from "@/types/index.js";

const onlineUsers: Map<string, string | null> = new Map(); // userId -> current conversationId (or null)

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    const userId = String(socket.data.user.id);
    const userEmail = socket.data.user.email;

    onlineUsers.set(userId, null); // track by userId
    socket.join(userId); // personal room for inbox updates
    console.log("user join personal room", userId);

    // Join a chat room
    socket.on(ListenMessages.JOIN_ROOM, (rawConversationId: string) => {
      const conversationId = String(rawConversationId);
      socket.join(conversationId);
      onlineUsers.set(userId, conversationId);
      console.log(`📌 User ${userEmail} joined room: ${conversationId}`);
    });

    // Leave a chat room
    socket.on(ListenMessages.LEAVE_ROOM, (conversationId: string) => {
      socket.leave(conversationId);
      onlineUsers.set(userId, null); // still online, just not in any room
      console.log(`📤 User ${userEmail} left room: ${conversationId}`);
    });

    // Send message
    socket.on(
      ListenMessages.SEND_MESSAGE,
      async ({
        message,
        isGroup,
        receiverId,
      }: {
        message: Message;
        isGroup: boolean;
        receiverId: string;
      }) => {
        const conversationId = String(message.conversationId);

        // 1. Broadcast to everyone currently inside the conversation room (except sender)
        socket.broadcast
          .to(conversationId)
          .emit(EmitMessages.RECEIVE_MESSAGE, message);

        if (!isGroup) {
          const targetReceiverId = String(receiverId);
          const isReceiverOnline = onlineUsers.get(targetReceiverId);

          // Only send NEW_MESSAGE and Push Notifications if the receiver is not in the active conversation
          if (isReceiverOnline !== conversationId) {
            console.log(
              `📩 Sending NEW_MESSAGE to user ${targetReceiverId} as they are not in current conversation.`,
            );
            io.to(targetReceiverId).emit(EmitMessages.NEW_MESSAGE, message);

            // Send push notification if they are offline or not in the room
            if (!isReceiverOnline || isReceiverOnline !== conversationId) {
              sendNotificationToSingleUser({
                userId: targetReceiverId,
                message: message.message,
                senderName: message.sender?.firstName || "New Message",
              });
            }
          }
          return;
        }

        // 2. For participants online but NOT in this conversation:
        console.log(
          `👥 Targeting group participants for conversation: ${conversationId}`,
        );
        const participantUserIds = await getParticipantUserIds(conversationId);
        const idsToNotify: string[] = [];

        for (const participantId of participantUserIds) {
          if (participantId === userId) continue; // skip the sender
          const currentRoom = onlineUsers.get(participantId);
          if (currentRoom !== conversationId) {
            io.to(participantId).emit(EmitMessages.NEW_MESSAGE, message);
            idsToNotify.push(participantId);
          }
        }

        // 3. Fire push notifications ONLY for users not currently in the conversation
        if (idsToNotify.length > 0) {
          console.log(
            `🔔 Sending group notifications to: ${idsToNotify.join(", ")}`,
          );
          sendMessageNotification({
            roomId: conversationId,
            senderId: message.senderId,
            senderName: message.sender?.firstName || "New Message",
            message: message.message,
            participantUserIds: idsToNotify,
          });
        }
      },
    );

    // Typing indicator
    socket.on(
      ListenMessages.TYPING,
      ({
        conversationId: rawConversationId,
        sender,
      }: {
        conversationId: string;
        sender: string;
      }) => {
        const conversationId = String(rawConversationId);
        socket.to(conversationId).emit(EmitMessages.USER_TYPING, { sender });
      },
    );

    socket.on(
      ListenMessages.STOP_TYPING,
      ({
        conversationId: rawConversationId,
        sender,
      }: {
        conversationId: string;
        sender: string;
      }) => {
        const conversationId = String(rawConversationId);
        socket
          .to(conversationId)
          .emit(EmitMessages.USER_STOP_TYPING, { sender });
      },
    );

    // Register push token
    socket.on(ListenMessages.REGISTER_PUSH_TOKEN, async (token: string) => {
      await addPushTokenInDB(token, userEmail);
    });

    // Disconnect
    socket.on(ListenMessages.DISCONNECT, async () => {
      console.log(`❌ User disconnected: ${userId}`);
      await updateLastSeen(userEmail);
      onlineUsers.delete(userId);
    });
  });
}
