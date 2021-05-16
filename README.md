# barehttp

Full-featured slim webserver for microservices with extremely low overhead and production features

[![Known Vulnerabilities](https://snyk.io/test/github/sckv/bare-http/badge.svg)](https://snyk.io/test/github/sckv/bare-http)

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

## Example

### Basic

```typescript
import { BareHttp, logMe } from 'barehttp';

const server = new BareHttp({ logging: false });

server.route.get('/route', function routeV1(flow) {
  flow.json({ everythings: 'OK' });
});

// Define a middleware
server.use((flow) => {
  logMe.info('my middleware');
});

server.start((address) => {
  console.log(`BareHttp started at ${address}`);
});
```

### async-await

```typescript
import { BareHttp, logMe } from 'barehttp';

const server = new BareHttp({ logging: false });

server.route.get('/route', async function routeV1() {
  return { promised: 'data' };
});

// Define a middleware
server.use(async (flow) => {
  logMe.info('my middleware');
  await someAuthentication();
});

server.start((address) => {
  console.log(`BareHttp started at ${address}`);
});
```

## Features

Some of the features are in progress.

- [x] Request wide context storage and incorporated tracing (ready for cloud)
- [x] UID (adopted or generated)
- [x] Request-Processing-Time header and value
- [x] Promised or conventional middlewares
- [x] Logging and serialized with `pino`
- [ ] Routes usage report and endpoint
- [ ] Cache headers handy handling, per route
- [ ] Cookies creation/parsing
- [ ] Request execution cancellation by timeout
- [ ] Streaming of chunked multipart response
- [ ] Safe and fast serialization-deserialization of JSON

## Benchmarks

WIP

## Support

Please open an issue if you have any questions or need support

## License

Licensed under [MIT](https://github.com/sckv/bare-http/blob/master/LICENSE).

Konstantin Knyazev
