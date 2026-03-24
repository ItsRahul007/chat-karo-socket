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

//! whats need to be done here?
// need to fetch all the users in the room, except the sender and from the users fetch their push tokens
// then send the notification to all the users

const sendMessageNotification = async ({
  roomId,
  senderId,
  senderName,
  message,
  groupName,
}: {
  roomId: string;
  senderId: string;
  senderName: string;
  groupName?: string;
  message: string;
}) => {
  try {
    if (!roomId || !senderId) {
      console.log("roomId or senderId is not defined");
      return;
    }

    const { data, error } = await supabase
      .from(TableNames.participants)
      .select("tokens:users!inner (pushTokens)")
      .neq("userId", senderId)
      .eq("conversationId", roomId)
      .not("users.pushTokens", "is", null);

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

export { addPushTokenInDB, updateLastSeen, sendMessageNotification };
