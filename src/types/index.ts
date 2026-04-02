interface ChatMessage {
  id: string;
  message: string;
  sender: string;
  conversationId: string;
  timestamp: string;
}

interface JoinRoomPayload {
  userId: string;
  conversationId: string;
}

interface TypingPayload {
  conversationId: string;
  sender: string;
}

interface SendMessagePayload {
  conversationId: string;
  message: string;
  sender: string;
}

interface MediaAttachment {
  url: string;
  type: "image" | "video" | "file" | "audio" | "pdf";
  fileSize?: number;
  fileName?: string;
}

interface Message {
  id: string;
  createdAt: string;
  senderId: string;
  conversationId: string;
  message: string;
  media: MediaAttachment[];
  isRead: boolean;
  isDeleted: boolean;
  isEdited: boolean;
  mentionMessageId: string | null;
  sender?: {
    firstName: string;
    lastName: string;
    avatar: string;
  };
}

export {
  ChatMessage,
  JoinRoomPayload,
  TypingPayload,
  SendMessagePayload,
  MediaAttachment,
  Message,
};
