import { BareHttp } from '../index';

const app = new BareHttp({ logging: true });

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
app.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async (flow) => {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    await wait();
    return 'JUST MESSAGE 2';
  },
});

app.route.post({
  route: '/route',
  handler: async function routeV1() {
    return 'JUST MESSAGE';
  },
});

app
  .use(() => {
    return;
  })
  .use(async () => {
    return;
  });

console.log(app.getRoutes());

app.start((address) => {
  console.log(`BareHttp started at ${address}`);
});
