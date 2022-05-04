import axios from 'axios';

import { BareHttp } from '../server';

// test('Registers a route with a handler', () => {
//   const app = new BareHttp({ setRandomPort: true });
//    app.route.get({
//     route: '/route',
//     handler: () => {},
//   });

//   console.log({ routes: app.getRoutes() });
//   expect(app.getRoutes().includes('GET?/route')).toBeTruthy();
// });

// test('Registers a route with options', () => {
//   const app = new BareHttp({ setRandomPort: true });
//   app.route.post({
//     route: '/route_settings',
//     handler: () => {},
//     options: { disableCache: true, timeout: 2000 },
//   });

//   expect(app.getRoutes().includes('POST?/route_settings')).toBeTruthy();
// });

test('Fails if theres an error throw inside route handler', async () => {
  const app = new BareHttp({ setRandomPort: true });
  app.route.get({
    route: '/test',
    handler: () => {
      throw new Error();
    },
  });

  await app.start();

  await expect(() => axios.get(`http://localhost:${app.getServerPort()}/test`)).rejects.toThrow();
  await app.stop();
});

test('Returns from the route with `return` keyword', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.get({
    route: '/test2',
    handler: () => {
      return 'ALL_OK';
    },
  });
  await app.start();

  const response = await axios.get(`http://localhost:${app.getServerPort()}/test2`);
  expect(response.data).toBe('ALL_OK');

  await app.stop();
});

test("Server doesn't start if timeout is not correct", async () => {
  const app = new BareHttp({ setRandomPort: true });

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

test('Declares a runtime route', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.get({
    route: '/test3',
    handler: () => {
      app.runtimeRoute.get({ route: '/runtime', handler: () => 'RUNTIME' });
      return 'ALL_OK';
    },
  });

  await app.start();

  const response = await axios.get(`http://localhost:${app.getServerPort()}/test3`);
  expect(response.data).toBe('ALL_OK');

  const runtimeResponse = await axios.get(`http://localhost:${app.getServerPort()}/runtime`);
  expect(runtimeResponse.data).toBe('RUNTIME');
  await app.stop();
});
