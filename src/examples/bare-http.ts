import { BareHttp, logMe, context } from '../index';

const app = new BareHttp({ logging: true });

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
app.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async (flow) => {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    await wait();
    // throw new Error('just fail');
    return 'JUST MESSAGE 2';
  },
});

app.route.post({
  route: '/route',
  handler: async function routeV1(flow) {
    return 'JUST MESSAGE';
  },
});

app
  .use((flow) => {
    return;
  })
  .use(async (flow) => {
    return;
  });

console.log(app.getRoutes());

app.start((address) => {
  console.log(`BareHttp started at ${address}`);
});
