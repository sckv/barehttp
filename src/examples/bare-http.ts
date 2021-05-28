import { logMe } from '../logger';
import { BareServer } from '../server';

const server = new BareServer({ cookies: true });

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
server.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async (flow) => {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    await wait();
    // throw new Error('just fail');
    return 'JUST MESSAGE 2';
  },
});

server.route.post({
  route: '/route',
  handler: async function routeV1(flow) {
    // logMe.info('message');
    // await wait();
    return 'JUST MESSAGE';
  },
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
