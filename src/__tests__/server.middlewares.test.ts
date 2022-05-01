import axios from 'axios';

import { BareHttp } from '../server';

jest.spyOn(console, 'log');

test('Starts and shut downs the server the server', async () => {
  const app = new BareHttp({ setRandomPort: true });

  await app.start(() => console.log('started'));

  expect(console.log).toHaveBeenCalledWith('started');
  expect(app.server.listening).toBeTruthy();

  await app.stop(() => console.log('stopped'));
  expect(console.log).toHaveBeenCalledWith('stopped');
  expect(app.server.listening).toBeFalsy();
});

// middlewares;
test('Registers a middleware through `use`', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.use(() => {});

  expect(app.getMiddlewares()).toHaveLength(1);
});

test('Registers a middleware through middlewares settings array', async () => {
  const app = new BareHttp({ middlewares: [() => {}] });

  expect(app.getMiddlewares()).toHaveLength(1);
});

test('Uses middleware', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.use((flow) => {
    flow.sendStatus(200);
  });

  await app.start();
  await expect(axios.get(`http://localhost:${app.getServerPort()}`)).resolves.toMatchObject({
    status: 200,
  });
  await app.stop();
});

test('Uses promise middleware', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.use(async (flow) => {
    flow.sendStatus(200);
  });

  await app.start();
  await expect(axios.get(`http://localhost:${app.getServerPort()}`)).resolves.toMatchObject({
    status: 200,
  });
  await app.stop();
});

test('Fails inside middleware and calls to integrated error handler', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.use(() => {
    throw new Error('error');
  });

  await app.start();
  await expect(() => axios.get(`http://localhost:${app.getServerPort()}`)).rejects.toThrow();
  await app.stop();
});

test('Fails inside middleware and calls to custom error handler', async () => {
  const spyEh = jest.fn().mockImplementation((_, flow) => flow.sendStatus(400));

  const app = new BareHttp({ setRandomPort: true, errorHandlerMiddleware: spyEh });

  app.use(() => {
    throw new Error();
  });

  await app.start();
  await expect(() => axios.get(`http://localhost:${app.getServerPort()}/test`)).rejects.toThrow();
  await app.stop();

  expect(spyEh).toHaveBeenCalled();
});
