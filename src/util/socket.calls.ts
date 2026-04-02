// This file will help to track the events and re-use them on the frontend side

enum EmitMessages {
  USER_JOINED = "user-joined",
  USER_LEFT = "user-left",
  RECEIVE_MESSAGE = "receive-message",
  NEW_MESSAGE = "new-message", // emitted to userId room when user is not in the active chat
  USER_TYPING = "user-typing",
  USER_STOP_TYPING = "user-stop-typing",
}

enum ListenMessages {
  JOIN_ROOM = "join-room",
  LEAVE_ROOM = "leave-room",
  SEND_MESSAGE = "send-message",
  TYPING = "typing",
  STOP_TYPING = "stop-typing",
  DISCONNECT = "disconnect",
  REGISTER_PUSH_TOKEN = "register-push-token",
}

export { EmitMessages, ListenMessages };
