import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { createSocketServer } from './sockets/index.js';
import { startCrons } from './jobs/cron.js';

const app = createApp();
const httpServer = createServer(app);
createSocketServer(httpServer);
startCrons();

httpServer.listen(env.SERVER_PORT, () => {
  console.log(`\n  CampusConnect API   http://localhost:${env.SERVER_PORT}`);
  console.log(`  Client origin       ${env.CLIENT_ORIGIN}\n`);
});
