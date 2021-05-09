import { WebServer } from './server';

const server = new WebServer();

server.get('/route', (flow) => flow.json('JUST_RESPONSE'), { disableCache: true });

server
  .use((flow) => {
    // console.log('middleware triggered');
    // throw 'ERROR';
    // return;
  })
  .use(async (flow) => {
    // console.log('middleware triggered');
    // console.log(flow.uuid);
    //  Promise.resolve();
    // await next();
    return;
  });

console.log(server.getRoutes());
server.start((address) => {
  console.log(`Server started at ${address}`);
});
