import { BareHttp, logMe, context } from '../index';

const app = new BareHttp({ cookies: true });

interface Ok {
  haha: number;
}
type SomeReturning = {
  fine: string;
  coolData: number;
  kek?: Ok;
};

const returning: SomeReturning = {
  fine: 'fine',
  coolData: 1123,
  kek: { haha: 123123 },
};

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
app.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async function (flow) {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    await wait();
    // throw new Error('just fail');
    return returning;
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
