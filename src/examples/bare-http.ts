import { logMe } from '../logger';
import { FlowServer } from '../server';

const server = new FlowServer();

server.route.get('/route', async function routeV1(flow) {
  logMe.info('message');
  flow.send('JUST_RESPONSE');
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
