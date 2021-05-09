import { WebServer } from './server';

const server = new WebServer();

server.get('/route', (flow) => {
  flow.send('JUST RESPONSE');
});

console.log(server.getRoutes());
server.start((address) => {
  console.log(`Server started at ${address}`);
});
