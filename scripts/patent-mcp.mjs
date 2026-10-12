import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {createPatentMcpServer} from './patent-mcp-server.mjs';
const server=await createPatentMcpServer({url:process.env.ATLAS_API_URL||'http://127.0.0.1:3017/api/',token:process.env.ATLAS_API_TOKEN});
await server.connect(new StdioServerTransport());
