import { BareHttp, logMe, context } from '../index';

const app = new BareHttp({ cookies: true });

interface Ok {
  haha: number;
}

type Cool = { okey?: boolean };

type Generic<G extends boolean = boolean> = { prop: G };
type SomeReturning = {
  fine: string;
  justNullable?: number;
  justArray: string[];
  generical?: Generic | number | Ok[];
  justUnionArray?: (string | number)[];
  otherUnion: number | boolean;
  coolData: number | string | 'dasdas' | Ok | null;
  kek?: Ok & Cool;
};

const returning: SomeReturning = {
  fine: 'fine',
  coolData: 1123,
  kek: { haha: 123123 },
  otherUnion: 1233232,
  generical: { prop: false },
};

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
app.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async function (flow) {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    await wait();
    if (flow.remoteIp) {
      return { special: 'return' };
    }
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
