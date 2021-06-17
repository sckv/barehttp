import axios from 'axios';

import { BareServer } from './server';

const TEST_PORT = 8888;
const app = new BareServer({ serverPort: TEST_PORT });

afterAll(() => {
  if (app.server.listening) app.stop();
});

beforeAll(() => {
  app.start();
});

// routes
test('Registers a route with a handler', () => {
  app.route.get({
    route: '/route',
    handler: () => {},
  });

  expect(app.getRoutes().includes('GET?/route')).toBeTruthy();
});

test('Registers a route with options', () => {
  app.route.post({
    route: '/route_settings',
    handler: () => {},
    options: { disableCache: true, timeout: 2000 },
  });

  expect(app.getRoutes().includes('POST?/route_settings')).toBeTruthy();
});

test('Fails if theres an error throw inside route handler', async () => {
  app.route.get({
    route: '/test',
    handler: () => {
      throw new Error();
    },
  });

  await expect(() => axios.get(`http://localhost:${TEST_PORT}/test`)).rejects.toThrow();
});

test('Returns from the route with `return` keyword', async () => {
  app.route.get({
    route: '/test2',
    handler: () => {
      return 'ALL_OK';
    },
  });

  const response = await axios.get(`http://localhost:${TEST_PORT}/test2`);
  expect(response.data).toBe('ALL_OK');
});

test("Server doesn't start if timeout is not correct", async () => {
  const app = new BareServer();

  expect(() =>
    app.route.post({
      route: '/test',
      options: { timeout: 'some timeout' as any },
      handler: async () => {
        return 'ok';
      },
    }),
  ).toThrow('Only numeric values are valid per-route timeout, submitted');
});
