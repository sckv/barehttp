import { BareHttp } from '../server';

test('Starts and shut downs the server with ws', async () => {
  const app = new BareHttp({ setRandomPort: true });

  await app.start(() => console.log('started'));

  expect(app.server.listening).toBeTruthy();

  await app.stop();

  expect(app.server.listening).toBeFalsy();
});

// TODO: add more exhaustive WS tests after v2
