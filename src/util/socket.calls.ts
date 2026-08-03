// This file will help to track the events and re-use them on the frontend side

enum EmitMessages {
  USER_JOINED = "user-joined",
  USER_LEFT = "user-left",
  RECEIVE_MESSAGE = "receive-message",
  NEW_MESSAGE = "new-message", // emitted to userId room when user is not in the active chat
  USER_TYPING = "user-typing",
  USER_STOP_TYPING = "user-stop-typing",
  USER_REMOVED_FROM_COMMUNITY = "user-removed-from-community",
  RECEIVE_USER_STATUS = "receive-user-status",

  // ─── Call signaling (server → client) ──────────────────────────────
  INCOMING_CALL = "incoming-call",
  CALL_ACCEPTED = "call-accepted",
  CALL_REJECTED = "call-rejected",
  CALL_ENDED = "call-ended",
  CALL_BUSY = "call-busy",
  WEBRTC_OFFER = "webrtc-offer",
  WEBRTC_ANSWER = "webrtc-answer",
  ICE_CANDIDATE = "ice-candidate",
  CAMERA_TOGGLED = "camera-toggled",
}

enum ListenMessages {
  JOIN_ROOM = "join-room",
  LEAVE_ROOM = "leave-room",
  SEND_MESSAGE = "send-message",
  TYPING = "typing",
  STOP_TYPING = "stop-typing",
  DISCONNECT = "disconnect",
  REGISTER_PUSH_TOKEN = "register-push-token",
  REMOVE_COMMUNITY_MEMBER = "remove-community-member",
  MAKE_ADMIN = "make-admin",
  DISMISS_ADMIN = "dismiss-admin",
  GET_USER_STATUS = "get-user-status",

  // ─── Call signaling (client → server) ──────────────────────────────
  CALL_INITIATE = "call-initiate",
  CALL_ACCEPT = "call-accept",
  CALL_REJECT = "call-reject",
  CALL_END = "call-end",
  WEBRTC_OFFER = "webrtc-offer",
  WEBRTC_ANSWER = "webrtc-answer",
  ICE_CANDIDATE = "ice-candidate",
  CAMERA_TOGGLE = "camera-toggle",
}

export { EmitMessages, ListenMessages };
