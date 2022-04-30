"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BareHttp = exports.BareServer = void 0;
const find_my_way_1 = __importDefault(require("find-my-way"));
const request_1 = require("./request");
const logger_1 = require("./logger");
const context_1 = require("./context");
const utils_1 = require("./utils");
const cors_1 = require("./middlewares/cors/cors");
const websocket_1 = require("./websocket");
const dns_1 = __importDefault(require("dns"));
const http_1 = require("http");
class BareServer {
    bareOptions;
    server;
    ws;
    #middlewares = [];
    #routes = new Map();
    #routesLib = new Map();
    #router = (0, find_my_way_1.default)({ ignoreTrailingSlash: true });
    #errorHandler = this.basicErrorHandler;
    #corsInstance;
    #port = 3000;
    #host = '0.0.0.0';
    #globalMiddlewaresRun = (_) => _;
    #routeMiddlewaresStore = new Map();
    constructor(bareOptions = {}) {
        this.bareOptions = bareOptions;
        // init
        this.server = (0, http_1.createServer)(this.#listener.bind(this));
        this.attachGracefulHandlers();
        this.attachRoutesDeclarator();
        this.applyLaunchOptions();
        return this;
    }
    #listener = (request, response) => {
        const flow = new request_1.BareRequest(request, response, this.bareOptions);
        // init and attach request uuid to the context
        if (this.bareOptions.context) {
            (0, context_1.newContext)('request');
            context_1.context.current?.store.set('id', flow.ID.code);
        }
        this.#router.lookup(flow._originalRequest, flow._originalResponse);
    };
    /**
     * This function generates previously defined middlewares for the sequential execution
     */
    #writeMiddlewares = () => {
        const lines = [];
        let order = 0;
        const maxOrder = this.#middlewares.length;
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        if (maxOrder > 0) {
            while (order <= maxOrder - 1) {
                lines.push(`if (flow.sent) return;`);
                lines.push(`await this.resolveMiddleware(flow, ${order});`);
                order++;
            }
        }
        const text = lines.join('\n');
        this.#globalMiddlewaresRun = new AsyncFunction('flow', text);
    };
    applyLaunchOptions = () => {
        const { bareOptions: bo } = this;
        this.#port = +(bo.serverPort || process.env.PORT || 3000);
        this.#host = typeof bo.serverAddress === 'string' ? bo.serverAddress : '0.0.0.0';
        // context setting
        if (bo.context)
            (0, context_1.enableContext)();
        // ws attachment
        if (bo.ws) {
            this.ws = new websocket_1.WebSocketServer(this.server, bo.wsOptions);
        }
        // middlewares settings
        if (bo.errorHandlerMiddleware) {
            this.#errorHandler = bo.errorHandlerMiddleware;
        }
        if (this.bareOptions.cors) {
            const corsOpts = typeof this.bareOptions.cors === 'object' ? this.bareOptions.cors : {};
            this.#corsInstance = new cors_1.Cors(corsOpts);
        }
        this.#middlewares.push(...(bo.middlewares || []));
    };
    async applyMiddlewares(flow) {
        if (this.bareOptions.cors) {
            this.resolveMiddleware(flow, 0, this.#corsInstance?.corsMiddleware.bind(this.#corsInstance));
        }
        if (this.bareOptions.doNotParseBody !== true) {
            // invoke body stream consumption
            await flow['readBody']();
        }
        // attach cookies middleware
        if (this.bareOptions.cookies) {
            flow['attachCookieManager'](this.bareOptions.cookiesOptions);
            flow['populateCookies']();
        }
        // to test in cloud provider
        // this should resolve the name of the first hop from the dns chain
        if (this.bareOptions.reverseDns) {
            const remoteClient = await dns_1.default.promises.reverse(flow.remoteIp);
            flow['setRemoteClient'](remoteClient[0]);
        }
        if (this.#middlewares.length)
            await this.#globalMiddlewaresRun(flow);
    }
    /**
     * This handler is used in async generated middlewares runtime function
     */
    async resolveMiddleware(flow, order, middleware) {
        try {
            const toExecute = middleware || this.#middlewares[order];
            const response = toExecute(flow);
            if (response instanceof Promise)
                await response;
        }
        catch (e) {
            this.#errorHandler(e, flow);
        }
    }
    setRoute(method, route, isRuntime, handler, opts) {
        const encode = this.encodeRoute(method, route);
        const handleFn = (req, _, routeParams) => {
            this.handleRoute(req, checkParams(routeParams), handler, opts);
        };
        this.#routesLib.set(encode, handleFn);
        if (isRuntime) {
            this.#router.reset();
            this.#routesLib.forEach((handlerFn, route) => {
                const [m, r] = this.explodeRoute(route);
                this.#router.on(m, r, handlerFn);
            });
        }
        else {
            this.#router.on(method, route, handleFn);
        }
    }
    handleRoute(req, routeParams, handle, routeOpts) {
        const flow = req.flow;
        if (!flow) {
            throw new Error(`No flow been found to route this request, theres a sync mistake in the server.`); // should NEVER happen
        }
        // populate with route params
        if (routeParams)
            flow['setParams'](routeParams);
        // apply possible route options
        if (routeOpts) {
            if (routeOpts.disableCache)
                flow.disableCache();
            if (routeOpts.cache)
                flow.setCache(routeOpts.cache);
            if (routeOpts.timeout)
                flow['attachTimeout'](routeOpts.timeout);
        }
        // execute global middlewares on the request
        this.applyMiddlewares(flow).catch((e) => this.#errorHandler(e, flow, 400));
        // if middlewares sent the response back, stop here
        if (flow.sent)
            return;
        try {
            const routeReturn = handle(flow);
            if (flow.sent)
                return;
            if (routeReturn instanceof Promise) {
                routeReturn.then((result) => flow.send(result)).catch((e) => this.#errorHandler(e, flow));
                return;
            }
            flow.send(routeReturn);
        }
        catch (e) {
            this.#errorHandler(e, flow);
        }
    }
    encodeRoute(method, route) {
        if (route.endsWith('/'))
            route = route.slice(0, -1);
        return `${method}?${route}`;
    }
    explodeRoute(route) {
        return route.split('?');
    }
    basicErrorHandler(e, flow, status) {
        flow.status(status ?? 500).json({ ...e, message: e.message, stack: e.stack });
    }
    async stopWs() {
        if (!this.ws)
            return;
        if (this.bareOptions.wsOptions?.closeHandler) {
            await this.bareOptions.wsOptions.closeHandler(this.ws);
        }
        this.ws._internal.close();
    }
    attachGracefulHandlers() {
        const graceful = async (code = 0) => {
            await this.stop();
            process.exit(code);
        };
        // Stop graceful
        process.on('uncaughtException', (err) => {
            console.error(err);
            graceful(1);
        });
        process.on('unhandledRejection', (err) => {
            console.error(err);
        });
        process.on('SIGTERM', graceful);
        process.on('SIGINT', graceful);
    }
    attachRoutesDeclarator() {
        for (const method of [...Object.keys(utils_1.HttpMethods), 'declare']) {
            this[method] = (routeSetUp) => {
                checkRouteSetUp(routeSetUp, method);
                if (method === 'declare') {
                    for (const m of new Set(routeSetUp.methods))
                        this.setRoute(utils_1.HttpMethods[m], routeSetUp.route, false, routeSetUp.handler, routeSetUp.options);
                }
                else {
                    this.setRoute(utils_1.HttpMethods[method], routeSetUp.route, false, routeSetUp.handler, routeSetUp.options);
                }
                return this;
            };
        }
    }
    // ========= PUBLIC APIS ==========
    // TODO: add working options setter
    // setOption<B extends BareOptions<any>, O extends keyof B>(option: O, arg: B[O]) {
    //   throw new Error('Not implemented')
    // }
    get runtimeRoute() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        return new Proxy({}, {
            get(_, key) {
                if (typeof key === 'symbol')
                    return this;
                if (!self.server?.listening) {
                    console.warn('Runtime route declaration can be done only while the server is running. Follow documentation for more details');
                    return this;
                }
                if ([...Object.keys(utils_1.HttpMethods), 'declare'].includes(key)) {
                    return (routeSetUp) => {
                        checkRouteSetUp(routeSetUp, key);
                        if (key === 'declare') {
                            for (const m of new Set(routeSetUp.methods))
                                self.setRoute(utils_1.HttpMethods[m], routeSetUp.route, true, routeSetUp.handler, routeSetUp.options);
                        }
                        else {
                            self.setRoute(utils_1.HttpMethods[key], routeSetUp.route, true, routeSetUp.handler, routeSetUp.options);
                        }
                        return this;
                    };
                }
                return this;
            },
        });
    }
    start(cb) {
        this.#writeMiddlewares();
        this.ws?.['_start']();
        return new Promise((res) => 
        // https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
        this.server.listen(this.#port, this.#host, undefined, () => {
            cb ? cb(`http://0.0.0.0:${this.#port}`) : void 0;
            res();
        }));
    }
    async stop(cb) {
        // TODO: to solve problem announcing to clients the disconnect
        // for (const flow of this.#flows.values()) {
        //   if (!flow.sent) {
        //     flow.status(500);
        //     flow.send('Server terminated');
        //   }
        // }
        if (!this.ws)
            await this.stopWs();
        await new Promise((res, rej) => {
            this.server?.close((e) => {
                if (e) {
                    rej(e);
                    cb?.(e);
                }
                else {
                    cb?.();
                    res();
                }
            });
        });
    }
    use(middleware) {
        this.#middlewares.push(middleware);
        return this;
    }
    getMiddlewares() {
        return this.#middlewares;
    }
    setCustomErrorHandler(eh) {
        this.#errorHandler = eh;
    }
    getRoutes() {
        return [...this.#routes.keys()];
    }
}
exports.BareServer = BareServer;
function checkRouteSetUp(routeSetUp, key) {
    if (typeof routeSetUp.route !== 'string') {
        throw new TypeError(`A route path for the method ${key} is not a a string`);
    }
    else if (routeSetUp.route[0] !== '/') {
        throw new SyntaxError(`A route path should start with '/' for route ${routeSetUp.route} for method ${key}`);
    }
    else if (routeSetUp.route[1] === '/') {
        throw new SyntaxError(`Declared route ${routeSetUp.route} for method ${key} is not correct, review the syntax`);
    }
    else if (typeof routeSetUp.handler !== 'function') {
        throw new TypeError(`Handler for the route ${routeSetUp.route} for method ${key} is not a function`);
    }
    else if (routeSetUp.options?.timeout &&
        typeof routeSetUp.options.timeout !== 'number' &&
        !Number.isFinite(routeSetUp.options.timeout)) {
        throw new TypeError(`Only numeric values are valid per-route timeout, submitted ${routeSetUp.options.timeout}`);
    }
}
function checkParams(params) {
    if (!params || Object.keys(params).length === 0)
        return params;
    for (const [param, value] of Object.entries(params)) {
        if (value === undefined)
            continue;
        if (/(\.\/)(\.\.)(\\.)/.test(decodeURI(value))) {
            logger_1.logMe.warn(`Param ${param} value ${value} was redacted because contained dangerous characters`);
            param[param] = 'REDACTED';
        }
    }
    return params;
}
const BareHttp = BareServer;
exports.BareHttp = BareHttp;
