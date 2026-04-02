import { TableNames } from "@/util/enum.js";
import { pushNotificationHelper } from "@/util/push.notification.js";
import { supabase } from "@/util/supabase.js";

const addPushTokenInDB = async (token: string, email: string) => {
  try {
    const { data, error } = await supabase
      .from(TableNames.users)
      .select("pushTokens")
      .eq("email", email)
      .single();

    if (error || !data) {
      console.error("Got error on first call");
      console.error("❌ Error registering push token:", error);
      return;
    }

    const tokens = data.pushTokens;

    if (tokens != null && tokens.includes(token)) return;

    const { error: updateError } = await supabase
      .from(TableNames.users)
      .update({ pushTokens: tokens ? [...tokens, token] : [token] })
      .eq("email", email);

    if (updateError) {
      console.error("❌ Error registering push token:", updateError);
      return;
    }
  } catch (error) {
    console.error("❌ Error registering push token:", error);
  }
};

const updateLastSeen = async (email: string) => {
  try {
    const { error } = await supabase
      .from(TableNames.users)
      .update({ lastSeen: new Date().toUTCString() }) // global timezone
      .eq("email", email);
    if (error) {
      console.error("❌ Error updating last seen:", error);
      return;
    }
  } catch (error) {
    console.error("❌ Error updating last seen:", error);
  }
};

/*
 * fetch all the users's push tokens in the room, except the sender
 * then send the notification to all the users
 */
const sendMessageNotification = async ({
  roomId,
  senderId,
  senderName,
  message,
  groupName,
  participantUserIds,
}: {
  roomId: string;
  senderId: string;
  senderName: string;
  groupName?: string;
  message: string;
  participantUserIds?: string[]; // only notify these users (those not currently in the room)
}) => {
  try {
    if (!roomId || !senderId) {
      console.log("roomId or senderId is not defined");
      return;
    }

    let query = supabase
      .from(TableNames.participants)
      .select("tokens:users!inner (pushTokens)")
      .neq("userId", senderId)
      .eq("conversationId", roomId)
      .not("users.pushTokens", "is", null);

    // If specific participant IDs are provided, only query those
    if (participantUserIds && participantUserIds.length > 0) {
      query = query.in("userId", participantUserIds);
    }

    const { data, error } = await query;

    if (error || !data) {
      throw error;
    }

    const tokens = data.map((item: any) => item.tokens.pushTokens).flat();

    await pushNotificationHelper.sendNotifications({
      tokens: tokens,
      title: groupName ? groupName : senderName,
      body: groupName ? `${senderName}: ${message}` : message,
    });
  } catch (error) {
    console.error("❌ Error sending message notification:", error);
  }
};

const sendNotificationToSingleUser = async ({
  userId,
  message,
  senderName,
}: {
  userId: string;
  message: string;
  senderName: string;
}) => {
  try {
    const { data, error } = await supabase
      .from(TableNames.users)
      .select("pushTokens")
      .eq("id", userId)
      .single();

    if (error || !data) {
      throw error;
    }

    const tokens = data.pushTokens;

    await pushNotificationHelper.sendNotifications({
      tokens: tokens,
      title: senderName,
      body: message,
    });
  } catch (error) {
    console.error("❌ Error sending message notification:", error);
  }
};

const getParticipantUserIds = async (
  conversationId: string,
): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from(TableNames.participants)
      .select("userId")
      .eq("conversationId", conversationId);

    if (error || !data) return [];

    return data.map((p: { userId: string }) => p.userId);
  } catch (error) {
    console.error("❌ Error fetching participants:", error);
    return [];
  }
};

export {
  addPushTokenInDB,
  updateLastSeen,
  sendMessageNotification,
  getParticipantUserIds,
  sendNotificationToSingleUser,
};
