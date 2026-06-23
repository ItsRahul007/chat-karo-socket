import { Server, Socket } from "socket.io";
import { EmitMessages, ListenMessages } from "@/util/socket.calls.js";
import {
  addPushTokenInDB,
  updateLastSeen,
  sendMessageNotification,
  getParticipantUserIds,
  sendNotificationToSingleUser,
  removeCommunityMember,
  makeOrRemoveAdmin,
  getUserLastSeen,
} from "@/controller/socket.controller.js";
import { Message } from "@/types/index.js";

const onlineUsers: Map<string, string | null> = new Map(); // userId -> current conversationId (or null)

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    const myUserId = String(socket.data.user.id);
    const userEmail = socket.data.user.email;
    const userFullName =
      socket.data.user.firstName + " " + socket.data.user.lastName;

    onlineUsers.set(myUserId, null); // track by myUserId
    socket.join(myUserId); // personal room for inbox updates
    console.log("user join personal room", myUserId);

    socket.broadcast.emit(EmitMessages.RECEIVE_USER_STATUS, {
      userId: myUserId,
      userStatus: "Online",
    });

    // Join a chat room
    socket.on(ListenMessages.JOIN_ROOM, (rawConversationId: string) => {
      const conversationId = String(rawConversationId);
      socket.join(conversationId);
      onlineUsers.set(myUserId, conversationId);
      console.log(`📌 User ${userEmail} joined room: ${conversationId}`);
    });

    // Leave a chat room
    socket.on(ListenMessages.LEAVE_ROOM, (conversationId: string) => {
      socket.leave(conversationId);
      onlineUsers.set(myUserId, null); // still online, just not in any room
      console.log(`📤 User ${userEmail} left room: ${conversationId}`);
    });

    // Send message
    socket.on(
      ListenMessages.SEND_MESSAGE,
      async ({
        message: rawMessage,
        isCommunity,
        receiverId,
        isNewChat,
      }: {
        message: Message;
        isCommunity: boolean;
        receiverId: string;
        isNewChat: boolean;
      }) => {
        const conversationId = String(rawMessage.conversationId);

        let message: Message = rawMessage;

        //* add sender details for community message
        if (isCommunity) {
          message = {
            ...rawMessage,
            senderName: socket.data.user.firstName,
            sender: {
              firstName: socket.data.user.firstName,
              lastName: socket.data.user.lastName,
              avatar: socket.data.user.avatar,
            },
          };
        }

        // Broadcast to everyone currently inside the conversation room (except sender)
        if (!isNewChat) {
          socket.to(conversationId).emit(EmitMessages.RECEIVE_MESSAGE, {
            message,
            isCommunity,
          });
        }

        if (!isCommunity) {
          const targetReceiverId = String(receiverId);
          const isReceiverOnline = onlineUsers.get(targetReceiverId);

          // Only send NEW_MESSAGE and Push Notifications if the receiver is not in the active conversation
          if (isReceiverOnline !== conversationId) {
            io.to(targetReceiverId).emit(EmitMessages.NEW_MESSAGE, {
              message,
              isCommunity,
              isNewChat,
            });

            // Send push notification if they are offline or not in the room
            if (
              !isReceiverOnline ||
              isReceiverOnline !== conversationId ||
              !message.isEdited
            ) {
              sendNotificationToSingleUser({
                userId: targetReceiverId,
                myId: myUserId,
                message: message.message,
                senderName: userFullName || "New Message",
                roomId: conversationId,
              });
            }
          }
          return;
        }

        // 2. For participants online but NOT in this conversation:
        const participantUserIds = await getParticipantUserIds(conversationId);
        const idsToNotify: string[] = [];

        for (const participantId of participantUserIds) {
          if (participantId === myUserId) continue; // skip the sender
          const currentRoom = onlineUsers.get(participantId);
          if (currentRoom !== conversationId) {
            io.to(participantId).emit(EmitMessages.NEW_MESSAGE, {
              message,
              isCommunity,
            });
            idsToNotify.push(participantId);
          }
        }

        // 3. Fire push notifications ONLY for users not currently in the conversation
        if (idsToNotify.length > 0 && !message.isEdited) {
          sendMessageNotification({
            roomId: conversationId,
            senderId: myUserId,
            senderName: userFullName || "New Message",
            message: message.message,
            participantUserIds: idsToNotify,
            isCommunity: true,
            conversationId,
          });
        }
      },
    );

    // Typing indicator
    socket.on(
      ListenMessages.TYPING,
      ({
        conversationId: rawConversationId,
        chatWithId,
        isCommunity,
      }: {
        conversationId: string;
        chatWithId: string;
        isCommunity: boolean;
      }) => {
        const conversationId = String(rawConversationId);
        socket.to(conversationId).emit(EmitMessages.USER_TYPING, {
          sender: userFullName,
          userId: myUserId,
          conversationId,
        });

        if (!isCommunity) {
          io.to(chatWithId).emit(EmitMessages.USER_TYPING, {
            sender: userFullName,
            userId: myUserId,
            conversationId,
          });
        }
      },
    );

    socket.on(
      ListenMessages.STOP_TYPING,
      ({
        conversationId: rawConversationId,
        chatWithId,
        isCommunity,
      }: {
        conversationId: string;
        chatWithId: string;
        isCommunity: boolean;
      }) => {
        const conversationId = String(rawConversationId);
        socket.to(conversationId).emit(EmitMessages.USER_STOP_TYPING, {
          sender: userFullName,
          userId: myUserId,
          conversationId,
        });

        if (!isCommunity) {
          io.to(chatWithId).emit(EmitMessages.USER_STOP_TYPING, {
            sender: userFullName,
            userId: myUserId,
            conversationId,
          });
        }
      },
    );

    // Register push token
    socket.on(ListenMessages.REGISTER_PUSH_TOKEN, async (token: string) => {
      // extract device id
      await addPushTokenInDB(token, userEmail);
    });

    socket.on(
      ListenMessages.REMOVE_COMMUNITY_MEMBER,
      async ({
        conversationId,
        userId,
      }: {
        conversationId: string;
        userId: string;
      }) => {
        const isSuccess = await removeCommunityMember({
          conversationId,
          userId,
          myUserId,
          myFullName: userFullName,
        });

        socket.emit(EmitMessages.USER_REMOVED_FROM_COMMUNITY, {
          success: isSuccess,
          conversationId,
        });
      },
    );

    socket.on(
      ListenMessages.MAKE_ADMIN,
      async ({
        conversationId,
        userId,
      }: {
        conversationId: string;
        userId: string;
      }) => {
        await makeOrRemoveAdmin({
          conversationId,
          userId,
          myUserId,
          makeAdmin: true,
        });
      },
    );

    socket.on(
      ListenMessages.DISMISS_ADMIN,
      async ({
        conversationId,
        userId,
      }: {
        conversationId: string;
        userId: string;
      }) => {
        await makeOrRemoveAdmin({
          conversationId,
          userId,
          myUserId,
          makeAdmin: false,
        });
      },
    );

    // Get user status
    socket.on(ListenMessages.GET_USER_STATUS, async (userId: string) => {
      const isOnline = onlineUsers.has(userId);
      let userStatus = "";
      if (isOnline) {
        userStatus = "Online";
      } else {
        userStatus = await getUserLastSeen(userId);
      }

      socket.emit(EmitMessages.RECEIVE_USER_STATUS, {
        userId,
        userStatus,
      });
    });

    // Disconnect
    socket.on(ListenMessages.DISCONNECT, async () => {
      console.log(`❌ User disconnected: ${myUserId}`);
      await updateLastSeen(userEmail);
      onlineUsers.delete(myUserId);

      socket.broadcast.emit(EmitMessages.RECEIVE_USER_STATUS, {
        userId: myUserId,
        userStatus: new Date().toUTCString(),
      });
    });
  });
}
