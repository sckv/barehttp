import { WebServer } from '../server';

const server = new WebServer();

server.route.get('/route', async (flow) => {
  flow.send('JUST_RESPONSE');
});

server;
// .use((flow) => {
//   // console.log('middleware 1 triggered');
//   // flow.setHeader('middleware-1', 'gone');
//   // throw 'ERROR';
//   // return;
// })
// .use(async (flow) => {
//   // flow.setHeader('middleware-2', 'gone');
//   // console.log('middleware 2 triggered');
//   // console.log(flow.uuid);
//   return;
// });

console.log(server.getRoutes());
server.start((address) => {
  console.log(`Server started at ${address}`);
});
