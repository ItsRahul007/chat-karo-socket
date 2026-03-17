export interface ChatMessage {
  id: string;
  message: string;
  sender: string;
  roomId: string;
  timestamp: string;
}

export interface JoinRoomPayload {
  userId: string;
  roomId: string;
}

export interface TypingPayload {
  roomId: string;
  sender: string;
}

export interface SendMessagePayload {
  roomId: string;
  message: string;
  sender: string;
}
