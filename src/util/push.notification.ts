import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";

/**
 * Push Notification Helper using Expo SDK
 */
class PushNotificationHelper {
  private expo: Expo;

  constructor() {
    // Optional: add your access token if you have one
    // this.expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
    this.expo = new Expo();
  }

  /**
   * Sending a single or multiple notifications
   * @param tokens - list of Expo Push Tokens (e.g. ['ExpoPushToken[xxxx]', ...])
   * @param title - Notification title
   * @param body - Notification body
   * @param data - Extra data payload
   */
  async sendNotifications({
    tokens,
    title,
    body,
    data,
  }: {
    tokens: string[];
    title: string;
    body: string;
    data?: any | undefined;
  }): Promise<ExpoPushTicket[]> {
    const messages: ExpoPushMessage[] = [];

    for (const pushToken of tokens) {
      // Check if it's a valid expo push token
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(
          `❌ Push token ${pushToken} is not a valid Expo push token`,
        );
        continue;
      }

      messages.push({
        to: pushToken,
        sound: "default",
        title: title,
        body: body,
        data: data,
        priority: "high",
      });
    }

    // Creating chunks of messages (to follow Expo API limits)
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    try {
      for (const chunk of chunks) {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        console.log(
          `✅ Successfully sent notification batch of size: ${chunk.length}`,
        );
      }
    } catch (error) {
      console.error("❌ Error sending push notification chunk:", error);
    }

    return tickets;
  }
}

export const pushNotificationHelper = new PushNotificationHelper();
