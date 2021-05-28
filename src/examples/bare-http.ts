import { logMe } from '../logger';
import { BareServer } from '../server';

const server = new BareServer({ cookies: true });

// const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
server.route.get(
  '/route',
  { cache: { cacheability: 'no-cache', expirationKind: 'max-age' } },
  async (flow) => {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    // throw new Error('just fail');
    return 'JUST MESSAGE 2';
  },
);

server.route.post('/route', async function routeV1(flow) {
  // logMe.info('message');
  // await wait();
  return 'JUST MESSAGE';
});

server
  .use((flow) => {
    return;
  })
  .use(async (flow) => {
    return;
  });

console.log(server.getRoutes());

server.start((address) => {
  console.log(`BareHttp started at ${address}`);
});
