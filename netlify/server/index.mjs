import {createApplication} from '../../application.mjs';

// A single instance owns transient rooms, live connections and admin sessions.
export const config={
  region:'fra',
  scale:{min:0,max:1},
  includedFiles:['../../public/**'],
};

const application=createApplication({publicDirectory:new URL('../../public/',import.meta.url)});
// Netlify listens and manages lifecycle; the local TUI is intentionally not started.
export default application.server;
