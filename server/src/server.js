import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';

const isMainModule = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => {
    console.log(`Digital Heroes API listening on port ${port}`);
  });
}

export default app;
