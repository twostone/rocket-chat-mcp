import type { TestProject } from "vitest/node";
import { GenericContainer, Network, Wait } from "testcontainers";
import type { StartedTestContainer, StartedNetwork } from "testcontainers";
import { bootstrap } from "./bootstrap.js";

let mongoContainer: StartedTestContainer;
let rcContainer: StartedTestContainer;
let network: StartedNetwork;

export async function setup(project: TestProject): Promise<void> {
  network = await new Network().start();

  // MongoDB 8 with replica set (required by Rocket.Chat 8.x)
  mongoContainer = await new GenericContainer("mongo:8")
    .withNetwork(network)
    .withNetworkAliases("mongo")
    .withHostname("mongo")
    .withCommand(["mongod", "--replSet", "rs0", "--bind_ip_all"])
    .withWaitStrategy(Wait.forLogMessage("Waiting for connections"))
    .withStartupTimeout(60_000)
    .start();

  // Initialise the replica set so Rocket.Chat can use the oplog
  await mongoContainer.exec([
    "mongosh",
    "--eval",
    "rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]})",
  ]);

  // Wait for the primary to be elected
  await mongoContainer.exec([
    "mongosh",
    "--eval",
    "let t=Date.now(); while(!rs.isMaster().ismaster){if(Date.now()-t>30000)throw new Error('replica set primary timeout'); sleep(500);}",
  ]);

  rcContainer = await new GenericContainer("rocketchat/rocket.chat:8.3.0")
    .withNetwork(network)
    .withEnvironment({
      MONGO_URL: "mongodb://mongo:27017/rocketchat?replicaSet=rs0",
      MONGO_OPLOG_URL: "mongodb://mongo:27017/local?replicaSet=rs0",
      ROOT_URL: "http://localhost:3000",
      PORT: "3000",
      ADMIN_USERNAME: "rcadmin",
      ADMIN_PASS: "rcAdmin123",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_NAME: "Admin",
      OVERWRITE_SETTING_Show_Setup_Wizard: "completed",
    })
    .withExposedPorts(3000)
    .withWaitStrategy(Wait.forHttp("/api/info", 3000).forStatusCode(200))
    .withStartupTimeout(240_000)
    .start();

  const rcHost = rcContainer.getHost();
  const rcPort = rcContainer.getMappedPort(3000);
  const rcUrl = `http://${rcHost}:${rcPort}`;

  const data = await bootstrap(rcUrl);

  project.provide("rcUrl", rcUrl);
  project.provide("adminUserId", data.adminUserId);
  project.provide("adminAuthToken", data.adminAuthToken);
  project.provide("channelId", data.channelId);
  project.provide("channelName", data.channelName);
  project.provide("groupId", data.groupId);
  project.provide("groupName", data.groupName);
  project.provide("seedMsgId", data.seedMsgId);
  project.provide("threadMsgId", data.threadMsgId);
}

export async function teardown(): Promise<void> {
  await rcContainer?.stop();
  await mongoContainer?.stop();
  await network?.stop();
}
