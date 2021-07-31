import axios from 'axios';

import { BareHttp } from '../server';

const TEST_PORT = 8888;
const app = new BareHttp({ serverPort: TEST_PORT });

jest.spyOn(console, 'log');

afterAll(() => {
  if (app.server.listening) app.stop();
});

test('Starts the server', async () => {
  await app.start(() => console.log('started'));

  expect(console.log).toHaveBeenCalledWith('started');
  expect(app.server.listening).toBeTruthy();
  await app.stop();
});

test('Shut downs the server', async () => {
  await app.start();
  await app.stop(() => console.log('stopped'));

  expect(console.log).toHaveBeenCalledWith('stopped');
  expect(app.server.listening).toBeFalsy();
});

// middlewares;
test('Registers a middleware through `use`', async () => {
  app.use(() => {});

  expect(app.getMiddlewares()).toHaveLength(1);
});

test('Registers a middleware through middlewares settings array', async () => {
  const testApp = new BareHttp({ middlewares: [() => {}] });

  expect(testApp.getMiddlewares()).toHaveLength(1);
});

test('Uses middleware', async () => {
  const testApp = new BareHttp();

  testApp.use((flow) => {
    flow.sendStatus(200);
  });

  await testApp.start();
  await expect(axios.get(`http://localhost:3000`)).resolves.toMatchObject({
    status: 200,
  });
  await testApp.stop();
});

test('Uses promise middleware', async () => {
  const testApp = new BareHttp();

  testApp.use(async (flow) => {
    flow.sendStatus(200);
  });

  await testApp.start();
  await expect(axios.get(`http://localhost:3000`)).resolves.toMatchObject({
    status: 200,
  });
  await testApp.stop();
});

test('Fails inside middleware and calls to integrated error handler', async () => {
  const err = new Error('error');

  app.use(() => {
    throw err;
  });

  await app.start();
  await expect(() => axios.get(`http://localhost:${TEST_PORT}`)).rejects.toThrow();
  await app.stop();
});

test('Fails inside middleware and calls to custom error handler', async () => {
  const spyEh = jest.fn().mockImplementation((_, flow) => flow.sendStatus(400));

  app.setCustomErrorHandler(spyEh);

  await app.start();
  await expect(() => axios.get(`http://localhost:${TEST_PORT}`)).rejects.toThrow();
  await app.stop();

  expect(spyEh).toHaveBeenCalled();
});
