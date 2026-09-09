import { startStagedSiteServer } from './lib/staged-site-server.mjs';

const server = await startStagedSiteServer({ siteRoot: '_site' });
console.log(server.url || `http://127.0.0.1:${server.port}/ai_tech_tree/`);
const close = async () => { await server.close(); process.exit(0); };
process.once('SIGINT', close);
process.once('SIGTERM', close);
