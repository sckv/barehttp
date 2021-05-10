import { WebServer } from './server';

const server = new WebServer();

server.route.get('/route', (flow) => {
  flow.send('JUST_RESPONSE');
});

// server
//   .use((flow) => {
//     // console.log('middleware triggered');
//     // throw 'ERROR';
//     // return;
//   })
//   .use(async (flow) => {
//     // console.log('middleware triggered');
//     // console.log(flow.uuid);
//     return;
//   });

console.log(server.getRoutes());
server.start((address) => {
  console.log(`Server started at ${address}`);
});
