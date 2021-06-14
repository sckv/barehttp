# barehttp

Full-featured slim webserver for microservices with extremely low overhead and ready for production

[![Known Vulnerabilities](https://snyk.io/test/github/sckv/bare-http/badge.svg)](https://snyk.io/test/github/sckv/bare-http)

## Table of Contents

- [Requirements](#Requirements)
- [Quick start](#Quick-start)
- [Usage](#Usage)
- [API](#API)
- [Features](#Features)
- [Support](#Support)

## Requirements

```bash
Node.js >= 14.8
```

## Quick start

Create directory

```bash
mkdir backend-application
cd backend-application
```

Install the service

npm

```bash
npm i barehttp --save
```

yarn

```bash
yarn add barehttp
```

## Usage

### Basic

```typescript
import { BareHttp, logMe } from 'barehttp';

const app = new BareHttp({ logging: false });

app.route.get({
  route: '/route',
  handler: function routeV1(flow) {
    flow.json({ everythings: 'OK' });
  })
});


app.route.post({
  route: '/route',
  handler: async function routeV1(flow) {
    return 'JUST MESSAGE';
  },
});

// Define a middleware
app.use((flow) => {
  logMe.info('my middleware');
});

app.start((address) => {
  console.log(`BareServer started at ${address}`);
});
```

### async-await

```typescript
import { BareHttp, logMe } from 'barehttp';

const app = new BareHttp({ logging: false });

app.route.get({
  route:'/route',
  handler: async function routeV1() {
    return { promised: 'data' };
  })
});

// Define a middleware
app.use(async (flow) => {
  logMe.info('my middleware');
  await someAuthenticationFlow();
});

app.start((address) => {
  console.log(`BareServer started at ${address}`);
});
```

# API

## `BareHttp(BareOptions)` (Class)

An instance of the application

### `BareOptions` (Object)

Options submitted to the server at initialization

#### `middlewares?` (Array<(flow: BareRequest) => Promise<void> | void>):

If provided, this will apply an array of middlewares to each incoming request.
The order of the array is the order of middlewares to apply

#### `serverPort?` (Number)

Default `3000`

Listening port

#### `serverAddress?` (String)

Default `'0.0.0.0'`

Address to bind the web server to

#### `context?` (Boolean)

Default `false`

Enables request context storage accessible through all application importing `import { context } from 'barehttp';`

#### `logging?` (Boolean)

Default `false`

Enable request/response logging, format varies from `production` or `development` environments, though to change use e.g. `NODE_ENV=production`

#### `errorHandlerMiddleware?` ((err: any, flow: BareRequest) => void)

If provided, will set a custom error handler to catch the bubbled errors from the handlers

#### `errorHandlerMiddleware?` (String: 's' | 'ms')

Default `'s'` - seconds

Request execution time format in `seconds` or `milliseconds`

#### `cookies?` (Boolean)

Control over cookies. If enabled this will turn on automatic cookies decoding, if you want to set up more settings for this (e.g. signed cookies), next option is available

#### `cookiesOptions?` (CookieManagerOptions)

To set options for the cookies decoding/encoding

#### `reverseDns?` (Boolean)

If enabled, and also with `logging: true`, will try to log the resolved reverse DNS of the first hop for remote ip of the client (first proxy).
Logs follow an [Apache Common Log Format](https://httpd.apache.org/docs/2.4/logs.html)

#### `statisticReport?` (Boolean)

Default `false`

Exposes a basic report with the routes usage under `GET /_report` route

### `BareServer.use` ((flow: BareRequest) => Promise<void> | void)

Attach a middleware `after` the middlewares optional array.
The order of the middlewares is followed by code declarations order.

### `BareServer.route` (Object)

To set a route for `get | post | patch | put | delete | options | head` with following parameters:

- `route` (String) - should follow a format of `/your_route`, including params as `/your_route/:param`
- `options` (Object) - `RouteOptions`
- `handler` (Function) - A function with the signature `(flow: BareRequest) => Promise<any> | any`

Example

```ts
app.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async (flow) => {
    return 'My route response';
  },
});
```

#### `RouteOptions` (Object)

If set, provide per-route options for behavior handling

##### `disableCache?` (Boolean)

Disables all cache headers for the response. This overrides any other cache setting.

##### `cache?` (CacheOptions)

If set, provides a granular cache handling per route.

##### `timeout?` (Number)

Request timeout value in `ms`. This will cancel the request _only_ for this route if time expired

## `BareRequest` (Class)

An instance of the request passed through to middlewares and handlers

### `getHeader` (Function)

Get an exact header stored to return with this request to the client

### `getCookie` (Function)

Get an exact client cookie of this request

### `getCookies` (Function)

Get all cookies of this request

### `disableCache` (Function)

Imperatively disables cache, does the same as `disableCache: true` in `RouteOptions`

### `setCache` (Function)

Imperatively sets the cache, does the same as `cache: CacheOptions` in `RouteOptions`

### `setHeader` (Function)

Set outgoing header as a (key, value) arguments `setHeader(header, value)`. Can overwrite

### `setHeaders` (Function)

Set outgoing headers in a "batch", merges provided headers object `{ [header: string]: value }` to already existing headers. Can overwrite

### `status` (Function)

Set a status for the outgoing request

### `sendStatus` (Function)

Set a status for the outgoing request and send it (end the request)

### `stream` (Function)

Stream (pipe) a response to the client

### `json` (Function)

Send a JSON response to the client (will attempt to stringify safely a provided object to JSON)

### `send` (Function)

Send a text/buffer response to the client

## Features

Some of the features are in progress.

- [x] Request wide context storage and incorporated tracing (ready for cloud)
- [x] UID (adopted or generated)
- [x] Request-Processing-Time header and value
- [x] Promised or conventional middlewares
- [x] Logging and serialized with `pino`
- [x] Routes usage report and endpoint
- [x] Cache headers handy handling, per route
- [x] Cookies creation/parsing
- [x] Request execution cancellation by timeout

## Benchmarks

(coming soon)

## Support

Please open an issue if you have any questions or need support

## License

Licensed under [MIT](https://github.com/sckv/bare-http/blob/master/LICENSE).

Konstantin Knyazev
