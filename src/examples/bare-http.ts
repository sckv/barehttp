import { logMe } from '../logger';
import { BareServer } from '../server';

const server = new BareServer();

server.route.get('/route', async function routeV1(flow) {
  // logMe.info('message');
  throw new Error('wooooha');
  return 'JUST MESSAGE';
});

server.route.post('/route', async function routeV1(flow) {
  // logMe.info('message');
  throw new Error('wooooha');
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
