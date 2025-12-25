import axios from 'axios';

import { context } from '../context/index.js';
import { BareHttp } from '../server.js';

test('Enables context in the settings', async () => {
  const app = new BareHttp({ context: true, setRandomPort: true });

  app.route.get({
    route: '/test',
    handler: () => !!context.current && context.current.store instanceof Map,
  });

  await app.start();
  const { data } = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  expect(data).toBeTruthy();
});

test('Automatically parses query parameters in the route call', async () => {
  const app = new BareHttp({ setRandomPort: true });

  const spyQuery = jest.fn();
  app.route.get({
    route: '/test',
    handler: (flow) => spyQuery(flow.query),
  });

  await app.start();
  await axios.get(`http://localhost:${app.getServerPort()}/test?query=params&chained=ok`);
  await app.stop();

  expect(spyQuery).toHaveBeenCalledWith({ query: 'params', chained: 'ok' });
});

test('Enables cookies decoding in the settings', async () => {
  const app = new BareHttp({ cookies: true, setRandomPort: true });

  const spyCookies = jest.fn();
  app.route.get({
    route: '/test',
    handler: (flow) => spyCookies(flow.getCookies()),
  });

  await app.start();
  await axios.get(`http://localhost:${app.getServerPort()}/test`, {
    headers: { cookie: 'myCookie=someValue; otherCookie=otherValue;' },
  });
  await app.stop();

  expect(spyCookies).toHaveBeenCalledWith({ myCookie: 'someValue', otherCookie: 'otherValue' });
});

test('Enables cookies attachment in the settings', async () => {
  const app = new BareHttp({ cookies: true, setRandomPort: true });

  app.route.get({
    route: '/test',
    handler: (flow) =>
      flow.cm?.setCookie('important', 'cookie', {
        domain: 'example.com',
        expires: new Date(),
        path: '/',
      }),
  });

  await app.start();
  const { headers } = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  const setCookie = headers['set-cookie'];
  const firstCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  expect(firstCookie).toContain('important=cookie; Domain=example.com; Path=/; Expires=');
});

test('Sets x-processing-time to milliseconds', async () => {
  const app = new BareHttp({ requestTimeFormat: 'ms', setRandomPort: true });

  app.route.get({
    route: '/test',
    handler: () => {},
  });

  await app.start();
  const { headers } = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  expect(headers['x-processing-time-mode']).toBe('milliseconds');
});

test('Base x-processing-time is in seconds', async () => {
  const app = new BareHttp({ requestTimeFormat: 's', setRandomPort: true });

  app.route.get({
    route: '/test',
    handler: () => {},
  });

  await app.start();
  const { headers } = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  expect(headers['x-processing-time-mode']).toBe('seconds');
});

test('Check that app started at the indicated port', async () => {
  const app = new BareHttp({ serverPort: 9999 });

  app.route.get({
    route: '/test',
    handler: () => {},
  });

  await app.start();
  const { status } = await axios.get('http://localhost:9999/test');
  await app.stop();

  expect(status).toBe(200);
});

// test returns of the data types
test('Server correctly classifies Buffer', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.get({
    route: '/test',
    handler: () => {
      return Buffer.from('text_data');
    },
  });

  await app.start();
  const { data } = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  expect(data).toEqual('text_data');
});

test('Server correctly classifies JSON response', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.get({
    route: '/test',
    handler: () => {
      return { json: 'data', in: ['here'] };
    },
  });

  await app.start();
  const { data } = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  expect(data).toEqual({ json: 'data', in: ['here'] });
});

test('Server correctly classifies Number response', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.get({
    route: '/test',
    handler: () => {
      return 123456;
    },
  });

  await app.start();
  const { data } = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  expect(data).toEqual(123456);
});

test('Server correctly classifies incoming text/plain', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody).toBe('text_data');
      return 123456;
    },
  });

  await app.start();
  const { data } = await axios.post(`http://localhost:${app.getServerPort()}/test`, 'text_data', {
    headers: { 'content-type': 'text/plain' },
  });
  await app.stop();

  expect(data).toEqual(123456);
});

test('Server correctly classifies incoming application/json', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody).toEqual({ json: 'json_data' });
      return 'ok';
    },
  });

  await app.start();
  const { data } = await axios.post(
    `http://localhost:${app.getServerPort()}/test`,
    { json: 'json_data' },
    { headers: { 'content-type': 'application/json' } },
  );
  await app.stop();
  expect(data).toEqual('ok');
});

test('Server correctly classifies incoming application/x-www-form-urlencoded', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody).toEqual({ urlencoded: 'data', with: 'multiple_fields' });
      return 'ok';
    },
  });

  await app.start();
  const { data } = await axios.post(
    `http://localhost:${app.getServerPort()}/test`,
    'urlencoded=data&with=multiple_fields',
    { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
  );
  await app.stop();
  expect(data).toEqual('ok');
});

test('Server correctly classifies incoming any type', async () => {
  const app = new BareHttp({ setRandomPort: true });

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody.toString()).toEqual('this_is_buffered_text');
      return 'ok';
    },
  });

  await app.start();
  const { data } = await axios.post(
    `http://localhost:${app.getServerPort()}/test`,
    'this_is_buffered_text',
    {
      headers: { 'content-type': 'application/octet-stream' },
    },
  );
  await app.stop();
  expect(data).toEqual('ok');
});

test('Server correctly aborts on long call with a per-route timeout set', async () => {
  const app = new BareHttp({ setRandomPort: true });

  const wait = () => new Promise((res) => setTimeout(res, 2000));
  app.route.post({
    route: '/test',
    options: { timeout: 200 },
    handler: async () => {
      await wait();
      return 'ok';
    },
  });

  await app.start();

  const { status } = await axios.post(
    `http://localhost:${app.getServerPort()}/test`,
    { json: 'json_data' },
    { validateStatus: () => true },
  );
  expect(status).toBe(503);
  await app.stop();
});

test('Check basic cors middleware is working with default options', async () => {
  const app = new BareHttp({ cors: true, setRandomPort: true });
  app.route.get({
    route: '/test',
    handler: () => 'return data',
  });

  await app.start();
  const response = await axios.get(`http://localhost:${app.getServerPort()}/test`);
  await app.stop();

  expect(response.headers['access-control-allow-origin']).toBe('*');
});
