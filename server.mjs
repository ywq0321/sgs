import {pathToFileURL} from 'node:url';
import {startHostTui} from './host-tui.mjs';
import {createApplication} from './application.mjs';
export {createApplication} from './application.mjs';

export function startServer({port=Number(process.env.PORT||3000),enableTui=false,handleSignals=true,...options}={}){
  const app=createApplication(options);let stopping=false;
  async function shutdown(){if(stopping)return;stopping=true;await app.stop();process.exit(0);}
  app.server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用，请先退出旧的服务器窗口。`:error.message);process.exitCode=1;});
  app.server.listen(port,'0.0.0.0',()=>{console.log(`三国杀 · http://localhost:${app.server.address().port}`);if(enableTui)startHostTui({...app,shutdown,port:app.server.address().port});});
  if(handleSignals){process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);}
  return app;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.loadEnvFile(new URL('./.env',import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;}
  startServer({enableTui:process.stdin.isTTY||process.argv.includes('--tui')});
}
