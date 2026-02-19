import type {
  RocketChatConfig,
  SendMessageResponse,
  MessagesResponse,
  RoomInfoResponse,
  GroupMembersResponse,
  RoomsGetResponse,
} from "../types.js";

export interface SendMessageOptions {
  tmid?: string;
  tshow?: boolean;
}

export class RocketChatClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: RocketChatConfig) {
    this.baseUrl = `${config.url.replace(/\/+$/, "")}/api/v1`;
    this.headers = {
      "Content-Type": "application/json",
      "X-Auth-Token": config.authToken,
      "X-User-Id": config.userId,
    };
  }

  async sendMessage(
    rid: string,
    msg: string,
    options?: SendMessageOptions
  ): Promise<SendMessageResponse> {
    const message: Record<string, unknown> = { rid, msg };
    if (options?.tmid) {
      message.tmid = options.tmid;
    }
    if (options?.tshow !== undefined) {
      message.tshow = options.tshow;
    }

    const response = await fetch(`${this.baseUrl}/chat.sendMessage`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as SendMessageResponse;
  }

  async getMessages(
    roomId: string,
    count?: number,
    offset?: number,
    oldest?: string,
    latest?: string
  ): Promise<MessagesResponse> {
    const params = new URLSearchParams({ roomId });
    if (count !== undefined) params.set("count", String(count));
    if (offset !== undefined) params.set("offset", String(offset));
    if (oldest !== undefined) params.set("oldest", oldest);
    if (latest !== undefined) params.set("latest", latest);

    const response = await fetch(
      `${this.baseUrl}/channels.history?${params.toString()}`,
      { method: "GET", headers: this.headers }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as MessagesResponse;
  }

  async searchMessages(
    roomId: string,
    searchText: string,
    count?: number,
    offset?: number
  ): Promise<MessagesResponse> {
    const params = new URLSearchParams({ roomId, searchText });
    if (count !== undefined) params.set("count", String(count));
    if (offset !== undefined) params.set("offset", String(offset));

    const response = await fetch(
      `${this.baseUrl}/chat.search?${params.toString()}`,
      { method: "GET", headers: this.headers }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as MessagesResponse;
  }

  async getThreadMessages(
    tmid: string,
    count?: number,
    offset?: number
  ): Promise<MessagesResponse> {
    const params = new URLSearchParams({ tmid });
    if (count !== undefined) params.set("count", String(count));
    if (offset !== undefined) params.set("offset", String(offset));

    const response = await fetch(
      `${this.baseUrl}/chat.getThreadMessages?${params.toString()}`,
      { method: "GET", headers: this.headers }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as MessagesResponse;
  }

  async getRoomInfo(roomName: string): Promise<RoomInfoResponse> {
    const params = new URLSearchParams({ roomName });

    const response = await fetch(
      `${this.baseUrl}/rooms.info?${params.toString()}`,
      { method: "GET", headers: this.headers }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as RoomInfoResponse;
  }

  async getGroupMessages(
    roomId: string,
    count?: number,
    offset?: number,
    oldest?: string,
    latest?: string
  ): Promise<MessagesResponse> {
    const params = new URLSearchParams({ roomId });
    if (count !== undefined) params.set("count", String(count));
    if (offset !== undefined) params.set("offset", String(offset));
    if (oldest !== undefined) params.set("oldest", oldest);
    if (latest !== undefined) params.set("latest", latest);

    const response = await fetch(
      `${this.baseUrl}/groups.history?${params.toString()}`,
      { method: "GET", headers: this.headers }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as MessagesResponse;
  }

  async getGroupMembers(
    roomId: string,
    count?: number,
    offset?: number
  ): Promise<GroupMembersResponse> {
    const params = new URLSearchParams({ roomId });
    if (count !== undefined) params.set("count", String(count));
    if (offset !== undefined) params.set("offset", String(offset));

    const response = await fetch(
      `${this.baseUrl}/groups.members?${params.toString()}`,
      { method: "GET", headers: this.headers }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as GroupMembersResponse;
  }

  async getRooms(updatedSince?: string): Promise<RoomsGetResponse> {
    const params = new URLSearchParams();
    if (updatedSince !== undefined) params.set("updatedSince", updatedSince);

    const query = params.toString();
    const url = query
      ? `${this.baseUrl}/rooms.get?${query}`
      : `${this.baseUrl}/rooms.get`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rocket.Chat API error (${response.status}): ${text}`
      );
    }

    return (await response.json()) as RoomsGetResponse;
  }
}
