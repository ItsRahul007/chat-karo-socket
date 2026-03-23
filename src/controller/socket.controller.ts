import { supabase } from "../util/supabase.js";

const addPushTokenInDB = async (token: string, email: string) => {
  try {
    const { data, error } = await supabase
      .from("users")
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
      .from("users")
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
      .from("users")
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

export { addPushTokenInDB, updateLastSeen };
