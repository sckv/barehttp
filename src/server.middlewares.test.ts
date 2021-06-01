import axios from 'axios';

import { BareServer } from './server';

const TEST_PORT = 8888;
const app = new BareServer({ serverPort: TEST_PORT });

jest.spyOn(console, 'log');

afterAll(() => {
  if (app.server.listening) app.stop();
});

test('Starts the server', async () => {
  await app.start(() => console.log('started'));

  expect(console.log).toHaveBeenCalledWith('started');
  expect(app.server.listening).toBeTruthy();
});

test('Shut downs the server', async () => {
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
  const testApp = new BareServer({ middlewares: [() => {}] });

  expect(testApp.getMiddlewares()).toHaveLength(1);
});

test('Fails inside middleware and calls to integrated error handler', async () => {
  const err = new Error('error');

  app.use(() => {
    throw err;
  });

  await app.start();
  await expect(() => axios.get(`http://localhost:${TEST_PORT}`)).rejects.toThrow();
});

test('Fails inside middleware and calls to custom error handler', async () => {
  const spyEh = jest.fn().mockImplementation((_, flow) => flow.sendStatus(400));

  app.setCustomErrorHandler(spyEh);

  await expect(() => axios.get(`http://localhost:${TEST_PORT}`)).rejects.toThrow();

  expect(spyEh).toHaveBeenCalled();
});
