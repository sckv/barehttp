import { logMe } from '../logger';
import { FlowServer } from '../server';

const server = new FlowServer();

server.route.get('/route', async function routeV1() {
  logMe.info('message');
  return Buffer.from('asdfasdfasdfasdfasdfsa');
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
  console.log(`FlowServer started at ${address}`);
});
