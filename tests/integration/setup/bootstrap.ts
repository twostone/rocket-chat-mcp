import { randomBytes } from "node:crypto";

export interface BootstrapResult {
  adminUserId: string;
  adminAuthToken: string;
  channelId: string;
  channelName: string;
  groupId: string;
  groupName: string;
  seedMsgId: string;
  threadMsgId: string;
}

async function apiPost(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const response = await fetch(`${baseUrl}/api/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok || json["success"] === false) {
    throw new Error(`${path} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function loginWithRetry(
  rcUrl: string,
  maxAttempts = 20,
  delayMs = 3000
): Promise<{ userId: string; authToken: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = (await apiPost(rcUrl, "login", {
        user: "rcadmin",
        password: "rcAdmin123",
      })) as { data: { userId: string; authToken: string } };
      return resp.data;
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Admin login failed after ${maxAttempts} attempts — Rocket.Chat may not have finished initializing`
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  /* istanbul ignore next */
  throw new Error("unreachable");
}

export async function bootstrap(rcUrl: string): Promise<BootstrapResult> {
  const { userId: adminUserId, authToken: adminAuthToken } =
    await loginWithRetry(rcUrl);

  const authHeaders = {
    "X-Auth-Token": adminAuthToken,
    "X-User-Id": adminUserId,
  };

  const suffix = randomBytes(4).toString("hex");
  const channelName = `test-channel-${suffix}`;
  const groupName = `test-group-${suffix}`;

  const channelResp = (await apiPost(
    rcUrl,
    "channels.create",
    { name: channelName },
    authHeaders
  )) as { channel: { _id: string } };
  const channelId = channelResp.channel._id;

  const groupResp = (await apiPost(
    rcUrl,
    "groups.create",
    { name: groupName },
    authHeaders
  )) as { group: { _id: string } };
  const groupId = groupResp.group._id;

  const msg1 = (await apiPost(
    rcUrl,
    "chat.sendMessage",
    { message: { rid: channelId, msg: "integration test message 1" } },
    authHeaders
  )) as { message: { _id: string } };
  const seedMsgId = msg1.message._id;

  await apiPost(
    rcUrl,
    "chat.sendMessage",
    { message: { rid: channelId, msg: "integration test message 2" } },
    authHeaders
  );

  await apiPost(
    rcUrl,
    "chat.sendMessage",
    { message: { rid: channelId, msg: "integration test message 3" } },
    authHeaders
  );

  const threadResp = (await apiPost(
    rcUrl,
    "chat.sendMessage",
    {
      message: {
        rid: channelId,
        msg: "integration test thread reply",
        tmid: seedMsgId,
      },
    },
    authHeaders
  )) as { message: { _id: string } };
  const threadMsgId = threadResp.message._id;

  return {
    adminUserId,
    adminAuthToken,
    channelId,
    channelName,
    groupId,
    groupName,
    seedMsgId,
    threadMsgId,
  };
}
