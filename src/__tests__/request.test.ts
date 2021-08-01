import { BareRequest } from '../request';

import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

const sock = new Socket({ readable: true, writable: true });

const createRequest = () => {
  const inc = new IncomingMessage(sock);
  const out = new ServerResponse(inc);
  const request = new BareRequest(inc, out);
  return { inc, out, request };
};

test('Generates uuid upon instantiation', () => {
  const { request } = createRequest();

  expect(request.ID).not.toBeUndefined();
});

test('Gets an uuid upon instantiation from headers', () => {
  const { inc, out } = createRequest();

  inc.headers['x-request-id'] = 'SOME_UUID';

  const request = new BareRequest(inc, out);

  expect(request.ID.code).toBe('SOME_UUID');
});

test('Adds logging listener if set up', () => {
  const { inc, out } = createRequest();

  const listeners = out.listenerCount('close');

  new BareRequest(inc, out, { logging: true });

  expect(out.listenerCount('close')).toBe(listeners + 1);
});

test('Gets response header', () => {
  const { request } = createRequest();

  request['headers']['Content-Length'] = '99';

  expect(request.getHeader('Content-Length')).toBe('99');
});

test('Adds basic headers to the request upon instantiation', () => {
  const { request } = createRequest();

  expect(request.getHeader('Content-Type')).toBe('text/plain; charset=utf-8');
  expect(request.getHeader('X-Request-Id')).toEqual(expect.any(String));
});

// headers
test('Disables cache', () => {
  const { request } = createRequest();
  request.disableCache();

  expect(request['cache']).toBeFalsy();
});

test('Sets cache headers for private; max-age=3800; must-revalidate', () => {
  const { request } = createRequest();
  request.setCache({
    cacheability: 'private',
    expirationKind: 'max-age',
    expirationSeconds: 3800,
    revalidation: 'must-revalidate',
  });

  expect(request.getHeader('Cache-Control')).toBe('private, max-age=3800, must-revalidate');
});

test('Sets cache headers for no-store; max-age=0; must-revalidate', () => {
  const { request } = createRequest();
  request.setCache({
    cacheability: 'no-store',
    expirationKind: 'max-age',
    expirationSeconds: 0,
    revalidation: 'must-revalidate',
  });

  expect(request.getHeader('Cache-Control')).toBe('no-store, max-age=0, must-revalidate');
});

test('Adds a response header', () => {
  const { request } = createRequest();
  request.addHeader('Vary', 'Origin');

  expect(request.getHeader('Vary')).toBe('Origin');
});

test('Adds a response header to already existing', () => {
  const { request } = createRequest();
  request.addHeader('Vary', 'Origin');
  request.addHeader('Vary', 'Destination');

  expect(request.getHeader('Vary')).toBe('Origin, Destination');
});

test('Overwrites a response header to already existing', () => {
  const { request } = createRequest();
  request.addHeader('Vary', 'Origin');
  request.setHeader('Vary', 'Destination');

  expect(request.getHeader('Vary')).toBe('Destination');
});

test('Adds multiple response headers', () => {
  const { request } = createRequest();
  request.addHeaders({ Vary: 'Origin', Host: 'http://barehttp.com' });

  expect(request.getHeader('Vary')).toBe('Origin');
  expect(request.getHeader('Host')).toBe('http://barehttp.com');
});

test('Does not get request cookie if cookie manager is disabled', () => {
  const token = '34his7dh3is8dyabf04y8ei';
  const { inc, request } = createRequest();
  inc.headers['cookie'] = `access_token=${token};`;

  request['populateCookies']();

  expect(request.getCookie('access_token')).toBe(undefined);
});

test('Gets request cookie if cookie manager is enabled', () => {
  const token = '34his7dh3is8dyabf04y8ei';
  const { inc, request } = createRequest();
  inc.headers['cookie'] = `access_token=${token};`;

  request['attachCookieManager']();
  request['populateCookies']();

  expect(request.getCookie('access_token')).toBe(token);
});

test('Gets all request cookies', () => {
  const token = '34his7dh3is8dyabf04y8ei';
  const refererId = '8237485';
  const { inc, request } = createRequest();
  inc.headers['cookie'] = `access_token=${token}; referer_id=${refererId};`;

  request['attachCookieManager']();
  request['populateCookies']();

  expect(request.getCookie('access_token')).toBe(token);
  expect(request.getCookie('referer_id')).toBe(refererId);
});

test('Sets response code (HTTP)', () => {});
test('Sets and sends response code (HTTP)', () => {});

test('Streams a response stream to the socket', () => {});
test('Sends a JSON to the response', () => {});
test('Sends a serializable data to the response', () => {});

test('Reads body correctly', () => {});
