import "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    rcUrl: string;
    adminUserId: string;
    adminAuthToken: string;
    channelId: string;
    channelName: string;
    groupId: string;
    groupName: string;
    seedMsgId: string;
    threadMsgId: string;
  }
}
