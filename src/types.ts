import { z } from "zod";

export const RocketChatMessageSchema = z.object({
  _id: z.string(),
  rid: z.string(),
  msg: z.string(),
  ts: z.string(),
  u: z.object({
    _id: z.string(),
    username: z.string(),
    name: z.string().optional(),
  }),
  tmid: z.string().optional(),
  _updatedAt: z.string().optional(),
});

export type RocketChatMessage = z.infer<typeof RocketChatMessageSchema>;

export const SendMessageResponseSchema = z.object({
  message: RocketChatMessageSchema,
  success: z.boolean(),
});

export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

export const MessagesResponseSchema = z.object({
  messages: z.array(RocketChatMessageSchema),
  success: z.boolean(),
});

export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;

export const RoomInfoSchema = z.object({
  _id: z.string(),
  name: z.string(),
  t: z.string().optional(),
  usersCount: z.number().optional(),
  topic: z.string().optional(),
  description: z.string().optional(),
});

export type RoomInfo = z.infer<typeof RoomInfoSchema>;

export const RoomInfoResponseSchema = z.object({
  room: RoomInfoSchema,
  success: z.boolean(),
});

export type RoomInfoResponse = z.infer<typeof RoomInfoResponseSchema>;

export const GroupMemberSchema = z.object({
  _id: z.string(),
  username: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
});

export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const GroupMembersResponseSchema = z.object({
  members: z.array(GroupMemberSchema),
  success: z.boolean(),
});

export type GroupMembersResponse = z.infer<typeof GroupMembersResponseSchema>;

export const ChannelMembersResponseSchema = z.object({
  members: z.array(GroupMemberSchema),
  success: z.boolean(),
});

export type ChannelMembersResponse = z.infer<
  typeof ChannelMembersResponseSchema
>;

export const RoomsGetResponseSchema = z.object({
  update: z.array(RoomInfoSchema),
  success: z.boolean(),
});

export type RoomsGetResponse = z.infer<typeof RoomsGetResponseSchema>;

export const DirectoryResultSchema = z.object({
  _id: z.string(),
  name: z.string().optional(),
  username: z.string().optional(),
  t: z.string().optional(),
  usersCount: z.number().optional(),
  ts: z.string().optional(),
});

export type DirectoryResult = z.infer<typeof DirectoryResultSchema>;

export const DirectoryResponseSchema = z.object({
  result: z.array(DirectoryResultSchema),
  count: z.number(),
  offset: z.number(),
  total: z.number(),
  success: z.boolean(),
});

export type DirectoryResponse = z.infer<typeof DirectoryResponseSchema>;

export interface RocketChatConfig {
  url: string;
  userId: string;
  authToken: string;
}

export function getConfigFromEnv(): RocketChatConfig {
  const url = process.env.ROCKETCHAT_URL;
  const userId = process.env.ROCKETCHAT_USER_ID;
  const authToken = process.env.ROCKETCHAT_AUTH_TOKEN;

  if (!url) {
    throw new Error("ROCKETCHAT_URL environment variable is required");
  }
  if (!userId) {
    throw new Error("ROCKETCHAT_USER_ID environment variable is required");
  }
  if (!authToken) {
    throw new Error("ROCKETCHAT_AUTH_TOKEN environment variable is required");
  }

  return { url: url.replace(/\/+$/, ""), userId, authToken };
}
