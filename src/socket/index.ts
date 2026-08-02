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
// Track which users are currently in a call: userId -> callId (conversationId)
const activeCalls: Map<string, string> = new Map();

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    const myUserId = String(socket.data.user.id);
    const userEmail = socket.data.user.email;
    const userFullName =
      socket.data.user.firstName + " " + socket.data.user.lastName;
    const userAvatar = socket.data.user.avatar;

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

    // ─── Call signaling ──────────────────────────────────────────────
    // Initiate a call (1-to-1 or community)
    socket.on(
      ListenMessages.CALL_INITIATE,
      async ({
        calleeId,
        callType,
        conversationId,
        isCommunity,
      }: {
        calleeId?: string;
        callType: "audio" | "video";
        conversationId: string;
        isCommunity: boolean;
      }) => {
        const callPayload = {
          callerId: myUserId,
          callerName: userFullName,
          callerAvatar: userAvatar,
          callType,
          conversationId,
          isCommunity,
        };

        // Mark caller as in-call
        activeCalls.set(myUserId, conversationId);

        if (!isCommunity && calleeId) {
          // 1-to-1 call
          const targetId = String(calleeId);

          // Check if callee is already in a call
          if (activeCalls.has(targetId)) {
            socket.emit(EmitMessages.CALL_BUSY, { conversationId });
            activeCalls.delete(myUserId);
            return;
          }

          io.to(targetId).emit(EmitMessages.INCOMING_CALL, callPayload);
          console.log(
            `📞 ${userEmail} calling ${targetId} (${callType}) in conversation ${conversationId}`,
          );
        } else {
          // Community call — notify all participants except caller
          const participantUserIds =
            await getParticipantUserIds(conversationId);
          for (const pid of participantUserIds) {
            if (pid === myUserId) continue;
            // Skip users who are already in a call
            if (activeCalls.has(pid)) continue;
            io.to(pid).emit(EmitMessages.INCOMING_CALL, callPayload);
          }
          console.log(
            `📞 ${userEmail} started a community call (${callType}) in ${conversationId}`,
          );
        }
      },
    );

    // Callee accepts
    socket.on(
      ListenMessages.CALL_ACCEPT,
      ({
        callerId,
        conversationId,
      }: {
        callerId: string;
        conversationId: string;
      }) => {
        activeCalls.set(myUserId, conversationId);
        io.to(String(callerId)).emit(EmitMessages.CALL_ACCEPTED, {
          acceptedBy: myUserId,
          conversationId,
        });
        console.log(
          `✅ ${userEmail} accepted call from ${callerId} in ${conversationId}`,
        );
      },
    );

    // Callee rejects
    socket.on(
      ListenMessages.CALL_REJECT,
      ({
        callerId,
        conversationId,
      }: {
        callerId: string;
        conversationId: string;
      }) => {
        io.to(String(callerId)).emit(EmitMessages.CALL_REJECTED, {
          rejectedBy: myUserId,
          conversationId,
        });
        console.log(
          `❌ ${userEmail} rejected call from ${callerId} in ${conversationId}`,
        );
      },
    );

    // End call
    socket.on(
      ListenMessages.CALL_END,
      async ({
        otherUserId,
        conversationId,
        isCommunity,
      }: {
        otherUserId?: string;
        conversationId: string;
        isCommunity: boolean;
      }) => {
        activeCalls.delete(myUserId);

        if (!isCommunity && otherUserId) {
          activeCalls.delete(String(otherUserId));
          io.to(String(otherUserId)).emit(EmitMessages.CALL_ENDED, {
            endedBy: myUserId,
            conversationId,
          });
        } else {
          // Community call — notify all participants
          const participantUserIds =
            await getParticipantUserIds(conversationId);
          for (const pid of participantUserIds) {
            if (pid === myUserId) continue;
            activeCalls.delete(pid);
            io.to(pid).emit(EmitMessages.CALL_ENDED, {
              endedBy: myUserId,
              conversationId,
            });
          }
        }
        console.log(`📞 ${userEmail} ended call in ${conversationId}`);
      },
    );

    // ─── WebRTC signaling relay ──────────────────────────────────────
    socket.on(
      ListenMessages.WEBRTC_OFFER,
      ({ targetId, offer }: { targetId: string; offer: any }) => {
        io.to(String(targetId)).emit(EmitMessages.WEBRTC_OFFER, {
          offer,
          from: myUserId,
        });
      },
    );

    socket.on(
      ListenMessages.WEBRTC_ANSWER,
      ({ targetId, answer }: { targetId: string; answer: any }) => {
        io.to(String(targetId)).emit(EmitMessages.WEBRTC_ANSWER, {
          answer,
          from: myUserId,
        });
      },
    );

    socket.on(
      ListenMessages.ICE_CANDIDATE,
      ({ targetId, candidate }: { targetId: string; candidate: any }) => {
        io.to(String(targetId)).emit(EmitMessages.ICE_CANDIDATE, {
          candidate,
          from: myUserId,
        });
      },
    );

    // Disconnect
    socket.on(ListenMessages.DISCONNECT, async () => {
      console.log(`❌ User disconnected: ${myUserId}`);
      await updateLastSeen(userEmail);
      onlineUsers.delete(myUserId);

      // Clean up any active call
      if (activeCalls.has(myUserId)) {
        activeCalls.delete(myUserId);
      }

      socket.broadcast.emit(EmitMessages.RECEIVE_USER_STATUS, {
        userId: myUserId,
        userStatus: new Date().toUTCString(),
      });
    });
  });
}
