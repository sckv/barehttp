import { BareHttp } from '../index';

const app = new BareHttp({ logging: false });

interface Ok {
  haha: number;
}

type Cool = { okey?: boolean };
type NotCool = { notOk: boolean; optional: string[] };

type Generic<G extends boolean = boolean> = { prop: G };
type SomeReturning = {
  fine: string;
  justNullable?: number;
  justArray: string[];
  twoDifferentObjects: Cool | NotCool;
  mergedObjects: Cool & NotCool;
  generical?: Generic | number | (Ok | null)[];
  justUnionArray?: (string | number)[];
  otherUnion: number | boolean;
  coolData: number | string | 'dasdas' | Ok | null;
  strangeArray: (Cool | NotCool)[];
  kek?: Ok & Cool;
};

const returning: SomeReturning = {
  fine: 'fine',
  coolData: 1123,
  kek: { haha: null },
  otherUnion: 1233232,
  generical: { prop: false },
  justArray: [],
  strangeArray: [{ okey: true }],
  twoDifferentObjects: { notOk: 23423423 },
  mergedObjects: { notOk: 0, optional: [3423423] },
} as any;

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));

app.route.get({
  route: '/route',
  options: { timeout: 2000 },
  handler: async function (flow) {
    flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });
    // await wait();
    // if (flow.remoteIp) {
    //   return { special: 'return' };
    // }
    // return returning;
    flow.send(returning);
  },
});

app.route.declare({
  route: '/multiple_declaration_route',
  handler: function multipleDeclarationRoute() {},
  methods: ['get', 'post'],
});

const _wait = () => new Promise((resolve) => setTimeout(resolve, 5000));

// app.route
//   .get({
//     route: '/route',
//     options: { timeout: 2000 },
//     handler: async (flow) => {
//       flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });

//       // await wait();
//       return 'JUST GET MESSAGE';
//     },
//   })
//   .post({
//     route: '/route',
//     handler: async function routeV1() {
//       return 'JUST POST MESSAGE';
//     },
//   });

app
  .use(() => {
    app.runtimeRoute.get({
      route: '/runtime_route',
      options: { timeout: 2000 },
      handler: async () => {
        return 'JUST MESSAGE 2';
      },
    });
    return;
  })
  .use(async () => {
    return;
  });

// console.log(app.getRoutes());

app.start((address) => {
  console.log(`BareHttp started at ${address}`);
});
