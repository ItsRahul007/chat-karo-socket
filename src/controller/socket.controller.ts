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
  participantUserIds,
  isCommunity = false,
  conversationId,
}: {
  roomId: string;
  senderId: string;
  senderName: string;
  message: string;
  participantUserIds?: string[];
  isCommunity?: boolean;
  conversationId?: string;
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
      .neq("isMuted", true)
      .neq("isBlocked", true)
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

    let groupName = null;

    if (isCommunity && conversationId) {
      const { data: conversationData, error: conversationError } =
        await supabase
          .from(TableNames.conversations)
          .select("groupName")
          .eq("id", conversationId)
          .single();

      if (conversationError || !conversationData) {
        throw conversationError;
      }

      groupName = conversationData.groupName;
    }

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

    return data.map((p: { userId: string }) => p.userId.toString());
  } catch (error) {
    console.error("❌ Error fetching participants:", error);
    return [];
  }
};

const removeCommunityMember = async ({
  conversationId,
  userId,
  myUserId,
  myFullName,
}: {
  conversationId: string;
  userId: string; //* the one I'll remove
  myUserId: string; //* the one who is removing
  myFullName: string;
}): Promise<boolean> => {
  try {
    //* first check if the user is an admin/owner or not
    const { data: participantData, error: participantError } = await supabase
      .from(TableNames.participants)
      .select("isAdmin, isOwner")
      .eq("conversationId", conversationId)
      .eq("userId", myUserId)
      .single();

    if (participantError || !participantData) {
      throw participantError;
    }

    if (!participantData.isAdmin && !participantData.isOwner) {
      throw new Error("You are not authorized to remove community member");
    }

    //* remove the user from the group by deleting participant
    const { error } = await supabase
      .from(TableNames.participants)
      .delete()
      .eq("conversationId", conversationId)
      .eq("userId", userId);

    if (error) {
      // console.error("❌ Error removing community member:", error);
      // return;
      throw error;
    }

    const { data: removedUserData, error: removedUserError } = await supabase
      .from(TableNames.users)
      .select("firstName, lastName")
      .eq("id", userId)
      .single();

    if (removedUserError || !removedUserData) {
      throw removedUserError;
    }

    //* create a information message that user (name) has removed by (name)
    const { error: messageError } = await supabase
      .from(TableNames.messages)
      .insert({
        conversationId,
        senderId: myUserId,
        message: `${removedUserData.firstName} ${removedUserData.lastName} has been removed by ${myFullName} 🦶`,
        isSystemMessage: true,
      })
      .select()
      .single();

    if (messageError) {
      throw messageError;
    }
    return true;
  } catch (error) {
    console.error("❌ Error removing community member:", error);
    return false;
  }
};

export {
  addPushTokenInDB,
  updateLastSeen,
  sendMessageNotification,
  getParticipantUserIds,
  sendNotificationToSingleUser,
  removeCommunityMember,
};
