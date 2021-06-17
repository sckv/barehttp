import axios from 'axios';

import { context } from './context';
import { BareServer } from './server';

test('Enables statistics report', async () => {
  const app = new BareServer({ statisticReport: true });
  await app.start();

  const { data } = await axios.get('http://localhost:3000/_report');
  await app.stop();

  expect(data).toContain(
    '<!DOCTYPE html><html><head><title>Routes usage</title><meta charset="utf-8"></head>',
  );
});

test('Statistics report sum up with a route hit', async () => {
  const app = new BareServer({ statisticReport: true });
  await app.start();

  await axios.get('http://localhost:3000/_report');
  const { data } = await axios.get('http://localhost:3000/_report');
  await app.stop();

  expect(data).toContain('<td>GET?/_report</td><td>2</td>');
});

test('Statistics report sum up with a route fail hit', async () => {
  const app = new BareServer({ statisticReport: true });
  app.route.get({
    route: '/test',
    handler: () => {
      throw new Error();
    },
  });

  await app.start();

  try {
    await axios.get('http://localhost:3000/test');
  } catch (e) {}
  const { data } = await axios.get('http://localhost:3000/_report');
  await app.stop();

  expect(data).toContain('<td>GET?/test</td><td>1</td><td>0</td><td>1</td>');
});

test('Enables context in the settings', async () => {
  const app = new BareServer({ context: true });

  app.route.get({
    route: '/test',
    handler: () => !!context.current && context.current.store instanceof Map,
  });

  await app.start();
  const { data } = await axios.get('http://localhost:3000/test');
  await app.stop();

  expect(data).toBeTruthy();
});

test('Enables cookies decoding in the settings', async () => {
  const app = new BareServer({ cookies: true });
  const spyCookies = jest.fn();
  app.route.get({
    route: '/test',
    handler: (flow) => spyCookies(flow.getCookies()),
  });

  await app.start();
  await axios.get('http://localhost:3000/test', {
    headers: { cookie: 'myCookie=someValue; otherCookie=otherValue;' },
  });
  await app.stop();

  expect(spyCookies).toHaveBeenCalledWith({ myCookie: 'someValue', otherCookie: 'otherValue' });
});

test('Enables cookies attachment in the settings', async () => {
  const app = new BareServer({ cookies: true });

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
  const { headers } = await axios.get('http://localhost:3000/test');
  await app.stop();

  expect(headers['set-cookie'][0]).toContain(
    'important=cookie; Domain=example.com; Path=/; Expires=',
  );
});

test('Sets x-processing-time to milliseconds', async () => {
  const app = new BareServer({ requestTimeFormat: 'ms' });

  app.route.get({
    route: '/test',
    handler: () => {},
  });

  await app.start();
  const { headers } = await axios.get('http://localhost:3000/test');
  await app.stop();

  expect(headers['x-processing-time-mode']).toBe('milliseconds');
});

test('Base x-processing-time is in seconds', async () => {
  const app = new BareServer();

  app.route.get({
    route: '/test',
    handler: () => {},
  });

  await app.start();
  const { headers } = await axios.get('http://localhost:3000/test');
  await app.stop();

  expect(headers['x-processing-time-mode']).toBe('seconds');
});

test('Check that app started at the indicated port', async () => {
  const app = new BareServer({ serverPort: 9999, statisticReport: true });

  await app.start();
  const { status } = await axios.get('http://localhost:9999/_report');
  await app.stop();

  expect(status).toBe(200);
});

// test returns of the data types
test('Server correctly classifies Buffer', async () => {
  const app = new BareServer();

  app.route.get({
    route: '/test',
    handler: () => {
      return Buffer.from('text_data');
    },
  });

  await app.start();
  const { data } = await axios.get('http://localhost:3000/test');
  await app.stop();

  expect(data).toEqual('text_data');
});

test('Server correctly classifies JSON response', async () => {
  const app = new BareServer();

  app.route.get({
    route: '/test',
    handler: () => {
      return { json: 'data', in: ['here'] };
    },
  });

  await app.start();
  const { data } = await axios.get('http://localhost:3000/test');
  await app.stop();

  expect(data).toEqual({ json: 'data', in: ['here'] });
});

test('Server correctly classifies Number response', async () => {
  const app = new BareServer();

  app.route.get({
    route: '/test',
    handler: () => {
      return 123456;
    },
  });

  await app.start();
  const { data } = await axios.get('http://localhost:3000/test');
  await app.stop();
  expect(data).toEqual(123456);
});

test('Server correctly classifies incoming text/plain', async () => {
  const app = new BareServer();

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody).toBe('text_data');
      return 123456;
    },
  });

  await app.start();
  const { data } = await axios.post('http://localhost:3000/test', 'text_data', {
    headers: { 'content-type': 'text/plain' },
  });
  await app.stop();
  expect(data).toEqual(123456);
});

test('Server correctly classifies incoming application/json', async () => {
  const app = new BareServer();

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody).toEqual({ json: 'json_data' });
      return 'ok';
    },
  });

  await app.start();
  const { data } = await axios.post(
    'http://localhost:3000/test',
    { json: 'json_data' },
    { headers: { 'content-type': 'application/json' } },
  );
  await app.stop();
  expect(data).toEqual('ok');
});

test('Server correctly classifies incoming application/x-www-form-urlencoded', async () => {
  const app = new BareServer();

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody).toEqual({ urlencoded: 'data', with: 'multiple_fields' });
      return 'ok';
    },
  });

  await app.start();
  const { data } = await axios.post(
    'http://localhost:3000/test',
    'urlencoded=data&with=multiple_fields',
    { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
  );
  await app.stop();
  expect(data).toEqual('ok');
});

test('Server correctly classifies incoming any type', async () => {
  const app = new BareServer();

  app.route.post({
    route: '/test',
    handler: (flow) => {
      expect(flow.requestBody.toString()).toEqual('this_is_buffered_text');
      return 'ok';
    },
  });

  await app.start();
  const { data } = await axios.post('http://localhost:3000/test', 'this_is_buffered_text', {
    headers: { 'content-type': 'application/octet-stream' },
  });
  await app.stop();
  expect(data).toEqual('ok');
});

test('Server correctly aborts on long call with a per-route timeout set', async () => {
  const app = new BareServer();

  const wait = () => new Promise((res) => setTimeout(res, 3000));
  app.route.post({
    route: '/test',
    options: { timeout: 2000 },
    handler: async () => {
      await wait();
      return 'ok';
    },
  });

  await app.start();

  const { status } = await axios.post(
    'http://localhost:3000/test',
    { json: 'json_data' },
    { validateStatus: () => true },
  );
  expect(status).toBe(503);
  await app.stop();
});
