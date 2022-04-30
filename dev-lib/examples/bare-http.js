"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const app = new index_1.BareHttp({ logging: false });
app.get({
    route: '/simple_route',
    handler: function simpleRoute() { },
});
app.declare({
    route: '/multiple_declaration_route',
    handler: function multipleDeclarationRoute() { },
    methods: ['get', 'post'],
});
const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));
app
    .get({
    route: '/route',
    options: { timeout: 2000 },
    handler: async (flow) => {
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
