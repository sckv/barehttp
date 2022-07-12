import { BareHttp } from '../index';

const app = new BareHttp({ logging: false });

app.get({
  route: '/simple_route',
  handler: function simpleRoute() {},
});

app.declare({
  route: '/multiple_declaration_route',
  handler: function multipleDeclarationRoute() {},
  methods: ['get', 'post'],
});

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));

app
  .get({
    route: '/:route/:fine/:salome',
    options: { timeout: 2000 },
    handler: async (flow) => {
      flow.params.fine
      flow.cm?.setCookie('MY KOOKIE', 'value', { domain: 'localhost' });

      // await wait();
      return 'JUST GET MESSAGE';
    },
  })
  .post({
    route: '/route',
    handler: async function routeV1() {
      return 'JUST POST MESSAGE';
    },
  });

app
  .use(() => {
    app.runtimeRoute.get({
      route: `/runtime_route`,
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

console.log(app.getRoutes());

app.start((address) => {
  console.log(`BareHttp started at ${address}`);
});
