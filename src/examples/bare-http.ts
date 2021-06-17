import { BareHttp } from '../index';

const app = new BareHttp({ logging: true });

let counter = 0;
const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
app.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async (flow) => {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    // await wait();

    app.runtimeRoute.get({
      route: `/p${counter}`,
      options: { timeout: 2000 },
      handler: async (flowI) => {
        flowI.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });

        return 'JUST MESSAGE 2';
      },
    });

    counter++;

    return 'JUST MESSAGE 1';
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
