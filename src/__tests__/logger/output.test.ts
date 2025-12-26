import axios from 'axios';

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { envs } from '../../env.js';
import { BareHttp } from '../../server.js';
import { logMe } from '../../logger/index.js';

test('Writes http and app logs into separate files', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'barehttp-logger-'));
  const appLogPath = join(tempDir, 'app.log');
  const httpLogPath = join(tempDir, 'http.log');
  const prevIsTest = envs.isTest;

  try {
    envs.isTest = false;
    const app = new BareHttp({
      setRandomPort: true,
      logging: true,
      logger: {
        console: false,
        pretty: false,
        app: { file: { path: appLogPath, sync: true } },
        http: { file: { path: httpLogPath, sync: true } },
      },
    });

    app.route.get({
      route: '/logger-test',
      handler: () => {
        logMe.info('app-log-works');
        return { ok: true };
      },
    });

    await app.start();
    await axios.get(`http://localhost:${app.getServerPort()}/logger-test`);
    await app.stop();

    const appLogContents = readFileSync(appLogPath, 'utf8');
    const httpLogContents = readFileSync(httpLogPath, 'utf8');

    expect(appLogContents).toContain('app-log-works');
    expect(httpLogContents).toContain('GET /logger-test');
    expect(appLogContents).not.toContain('GET /logger-test');
    expect(httpLogContents).not.toContain('app-log-works');
  } finally {
    envs.isTest = prevIsTest;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
