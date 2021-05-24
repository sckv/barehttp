import { logMe } from '../logger';
import { BareServer } from '../server';

const server = new BareServer({ context: true, logging: true, serverAddress: '0.0.0.0' });

// const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
server.route.get('/route', { disableCache: true }, async function handle(flow) {
  return 'JUST MESSAGE 2';
});
// server.route.get('/route', async function routeV1(flow) {
//   // this.cache = 'asdf';

//   // logMe.info('message');
//   // throw new Error('wooooha');
//   return 'JUST MESSAGE';
// });

server.route.post('/route', async function routeV1(flow) {
  // logMe.info('message');
  // throw new Error('wooooha');
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
