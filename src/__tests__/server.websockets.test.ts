import { BareHttp } from '../server';

const TEST_PORT = 8888;
const app = new BareHttp({ serverPort: TEST_PORT, ws: true });

afterAll(() => {
  if (app.server.listening) app.stop();
});

test('Starts and shut downs the server with ws', async () => {
  await app.start(() => console.log('started'));

  expect(app.server.listening).toBeTruthy();

  await app.stop();

  expect(app.server.listening).toBeFalsy();
});

// TODO: add more exhaustive WS tests after v2
