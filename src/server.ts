import Router from 'find-my-way';
import { Server as WServer, ServerOptions } from 'ws';

import { BareRequest, CacheOpts } from './request';
import { logMe } from './logger';
import { context, enableContext, newContext } from './context';
import { generateReport } from './report';
import { CookiesManagerOptions } from './middlewares/cookies/cookie-manager';
import { StatusCodes } from './utils';

import dns from 'dns';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { Writable } from 'stream';

type Middleware = (flow: BareRequest) => Promise<void> | void;
type Handler = (flow: BareRequest) => any;

type RouteOpts<C> = {
  disableCache?: C extends true ? C : undefined;
  cache?: C extends true ? undefined : CacheOpts;
  /**
   * Request timeout handler in `ms`
   */
  timeout?: number;
};
interface HandlerExposed<K> {
  <R extends `/${string}`, C>(
    setUp: K extends 'declare'
      ? {
          route: R;
          options?: RouteOpts<C>;
          handler: Handler;
          methods: Array<keyof typeof HttpMethods>;
        }
      : {
          route: R;
          options?: RouteOpts<C>;
          handler: Handler;
        },
  ): BareServer<any> & Routes;
}

type ErrorHandler = (
  err: any,
  flow: BareRequest,
  status?: typeof StatusCodes[keyof typeof StatusCodes],
) => void;

type BareOptions<A extends `${number}.${number}.${number}.${number}`> = {
  middlewares?: Array<Middleware>;
  serverPort?: number;
  /**
   * Address to bind the web server to
   * Default '0.0.0.0'
   */
  serverAddress?: A | 'localhost';
  /**
   * Enable request context storage
   * Default `false`
   */
  context?: boolean;
  /**
   * Enable request/response predefined logging
   * Default `false`
   */
  logging?: boolean;
  errorHandlerMiddleware?: ErrorHandler;
  /**
   * Request time format in `seconds` or `milliseconds`
   * Default 's' - seconds
   */
  requestTimeFormat?: 's' | 'ms';
  /**
   * Control over cookies.
   * This will enable automatic cookies decoding
   */
  cookies?: boolean;
  cookiesOptions?: CookiesManagerOptions;
  /**
   * Log the resolved reverse DNS first hop for remote ip of the client (first proxy)
   */
  reverseDns?: boolean;
  /**
   * Exposes a report with the routes usage.
   * Default `false`
   */
  statisticsReport?: boolean;
  /**
   * WebSocket server exposure
   */
  ws?: boolean;
  wsOptions?: Omit<ServerOptions, 'host' | 'port' | 'server' | 'noServer'> & {
    closeHandler?: (server: WServer) => Promise<void>;
  };
};

type Methods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
const HttpMethods = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
  options: 'OPTIONS',
  head: 'HEAD',
} as const;

export type RouteReport = { hits: number; success: number; fails: number };

export type Routes = {
  [K in keyof typeof HttpMethods | 'declare']: HandlerExposed<K>;
};

export type BareHttpType<A extends `${number}.${number}.${number}.${number}` = any> =
  BareServer<A> & Routes;

export type ServerMergedType = {
  new <A extends `${number}.${number}.${number}.${number}`>(args?: BareOptions<A>): BareHttpType<A>;
};

export class BareServer<A extends `${number}.${number}.${number}.${number}`> {
  server: Server;
  ws?: WServer;

  #middlewares: Array<Middleware> = [];
  #routes: Map<string, RouteReport> = new Map();
  #routesLib: Map<string, any> = new Map();
  #router = Router({ ignoreTrailingSlash: true });
  #flows: WeakMap<{ code: string }, BareRequest> = new WeakMap();
  #errorHandler: ErrorHandler = this.basicErrorHandler;
  #port = 3000;
  #host = '0.0.0.0';

  #runMiddlewaresSequence: (flow: BareRequest) => void = (_) => _;

  constructor(private bareOptions: BareOptions<A> = {}) {
    // init
    this.server = createServer(this.#listener.bind(this));
    this.attachGracefulHandlers();
    this.attachRoutesDeclarator();
    this.mainOptionsSetter();

    return this;
  }

  #listener = (request: IncomingMessage, response: ServerResponse) => {
    const { requestTimeFormat, logging } = this.bareOptions;

    const flow = new BareRequest(request, response, logging);

    // init and attach request uuid to the context
    if (this.bareOptions.context) {
      newContext('request');
      context.current?.store.set('id', flow.ID.code);
    }

    if (requestTimeFormat) flow['setTimeFormat'](requestTimeFormat);

    // attach a flow to the flow memory storage
    this.#flows.set(flow.ID, flow);
    this.applyMiddlewares(flow.ID).catch((e) => this.#errorHandler(e, flow, 400));
  };

  /**
   * This function generates previously defined middlewares for the sequential execution
   */
  #writeMiddlewares = () => {
    const lines: string[] = [];
    let order = 0;
    const maxOrder = this.#middlewares.length;

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    if (maxOrder > 0) {
      while (order <= maxOrder - 1) {
        lines.push(`if (flow.sent) return;`);
        lines.push(`await this.resolveMiddleware(${order}, flow);`);
        order++;
      }
    }

    const text = lines.join('\n');

    this.#runMiddlewaresSequence = new AsyncFunction('flow', text);
  };

  private mainOptionsSetter = () => {
    const { bareOptions: bo } = this;

    this.#port = +(bo.serverPort || process.env.PORT || 3000);
    this.#host = typeof bo.serverAddress === 'string' ? bo.serverAddress : '0.0.0.0';

    // context setting
    if (bo.context) enableContext();

    // ws attachment
    if (bo.ws) {
      const wsOpts = { server: this.server };
      if (bo.wsOptions) Object.assign(wsOpts, bo.wsOptions);
      this.ws = new WServer(wsOpts);
    }

    // middlewares settings
    if (bo.errorHandlerMiddleware) {
      this.#errorHandler = bo.errorHandlerMiddleware;
    }

    this.#middlewares.push(...(bo.middlewares || []));
    if (bo.statisticsReport) this.registerReport();
  };

  private async applyMiddlewares(flowId: { code: string }) {
    const flow = this.#flows.get(flowId);
    if (!flow) {
      throw new Error(`No flow been found for id ${flowId}, theres a sync mistake in the server.`); // should NEVER happen
    }

    // invoke body stream consumption
    await flow['readBody']();

    // attach cookies middleware
    if (this.bareOptions.cookies) {
      flow['attachCookieManager'](this.bareOptions.cookiesOptions);
      flow['populateCookies']();
    }

    // to test in cloud provider
    // this should resolve the name of the first hop from the dns chain
    if (this.bareOptions.reverseDns) {
      const remoteClient = await dns.promises.reverse(flow.remoteIp!);
      flow['setRemoteClient'](remoteClient[0]);
    }

    if (this.#middlewares.length) await this.#runMiddlewaresSequence(flow);

    // now route the request if middlewares did not send the response back
    if (!flow.sent) {
      this.#router.lookup(flow._originalRequest, flow._originalResponse);
    }
  }

  /**
   * This handler is used in async generated middlewares runtime function
   */
  private async resolveMiddleware(order: number, flow: BareRequest) {
    try {
      const response = this.#middlewares[order](flow);
      if (response instanceof Promise) await response;
    } catch (e) {
      this.#errorHandler(e, flow);
    }
  }

  private setRoute(
    method: Methods,
    route: string,
    runtime: boolean,
    handler: Handler,
    opts?: RouteOpts<any>,
  ) {
    const encode = this.encodeRoute(method, route);
    this.#routes.set(encode, { hits: 0, fails: 0, success: 0 });

    const handleFn = (req, _, routeParams) => {
      this.#routes.get(encode)!.hits++;

      this.handleRoute(req, checkParams(routeParams), handler, encode, opts);
    };

    this.#routesLib.set(encode, handleFn);

    if (runtime) {
      this.#router.reset();

      this.#routesLib.forEach((handlerFn, route) => {
        const [m, r] = this.explodeRoute(route);

        this.#router.on(m, r, handlerFn);
      });
    } else {
      this.#router.on(method, route, handleFn);
    }
  }

  private registerReport() {
    this.setRoute('GET', '/_report', false, (flow) => {
      flow.setHeader('content-type', 'text/html');
      flow.send(generateReport(this.#routes));
    });
  }

  private handleRoute(
    req: IncomingMessage,
    routeParams: { [k: string]: string | undefined },
    handle: Handler,
    encodedRoute: string,
    opts?: RouteOpts<any>,
  ) {
    const flow = this.#flows.get((req as any).id)!;

    // apply possible route options
    if (opts) {
      if (opts.disableCache) flow.disableCache();
      if (opts.cache) flow.setCache(opts.cache);
      if (opts.timeout) flow['attachTimeout'](opts.timeout);
    }

    // populate with route params
    if (routeParams) flow['setParams'](routeParams);

    // attach a general statistic reports counter
    if (this.bareOptions.statisticsReport) {
      flow._originalRequest.on('close', () => {
        if (flow.statusToSend < 300 && flow.statusToSend >= 200) {
          this.#routes.get(encodedRoute)!.success++;
        } else {
          this.#routes.get(encodedRoute)!.fails++;
        }
      });
    }

    try {
      const routeReturn = handle.bind(undefined)(flow);
      if (routeReturn instanceof Promise) {
        routeReturn
          .catch((e) => this.#errorHandler(e, flow))
          .then((result) => this.soundRouteReturn(result, flow));
      } else {
        this.soundRouteReturn(routeReturn, flow);
      }
    } catch (e) {
      this.#errorHandler(e, flow);
    }
  }

  private soundRouteReturn(response: any, flow: BareRequest) {
    if (flow.sent) return;
    if (typeof response === 'undefined' || response === null) return flow.send();

    switch (response.constructor) {
      case Uint8Array:
      case Uint16Array:
      case Uint32Array:
      case Buffer:
      case String:
        flow.send(response);
        break;
      case Boolean:
      case Number:
        flow.send('' + response);
      case Writable:
        flow.stream(response);
        break;
      case Object:
        flow.json(response);
        break;
      default:
        flow.send();
        logMe.warn('Unknown type to send');
    }
  }

  private encodeRoute(method: string, route: string) {
    if (route.endsWith('/')) route = route.slice(0, -1);
    return `${method}?${route}`;
  }

  private explodeRoute(route: string) {
    return route.split('?') as [method: Methods, route: string];
  }

  private basicErrorHandler(
    e: any,
    flow: BareRequest,
    status?: typeof StatusCodes[keyof typeof StatusCodes],
  ) {
    flow.status(status ?? 500);
    flow.json({ ...e, message: e.message, stack: e.stack });
  }

  private async stopWs() {
    if (!this.ws) return;

    if (this.bareOptions.wsOptions?.closeHandler) {
      await this.bareOptions.wsOptions.closeHandler(this.ws);
    }

    this.ws.close();
  }

  private attachGracefulHandlers() {
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

  private attachRoutesDeclarator() {
    for (const method of [...Object.keys(HttpMethods), 'declare']) {
      this[method] = (routeSetUp: any) => {
        checkRouteSetUp(routeSetUp, method);

        if (method === 'declare') {
          for (const m of new Set<string>(routeSetUp.methods))
            this.setRoute(
              HttpMethods[m],
              routeSetUp.route,
              false,
              routeSetUp.handler,
              routeSetUp.options,
            );
        } else {
          this.setRoute(
            HttpMethods[method],
            routeSetUp.route,
            false,
            routeSetUp.handler,
            routeSetUp.options,
          );
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
    return new Proxy({} as Readonly<Routes>, {
      get(_, key) {
        if (typeof key === 'symbol') return this;
        if (!self.server?.listening) {
          console.warn(
            'Runtime route declaration can be done only while the server is running. Follow documentation for more details',
          );
          return this;
        }

        if ([...Object.keys(HttpMethods), 'declare'].includes(key as string)) {
          return (routeSetUp: any) => {
            checkRouteSetUp(routeSetUp, key);
            if (key === 'declare') {
              for (const m of new Set<string>(routeSetUp.methods))
                self.setRoute(
                  HttpMethods[m],
                  routeSetUp.route,
                  true,
                  routeSetUp.handler,
                  routeSetUp.options,
                );
            } else {
              self.setRoute(
                HttpMethods[key],
                routeSetUp.route,
                true,
                routeSetUp.handler,
                routeSetUp.options,
              );
            }
            return this;
          };
        }

        return this;
      },
    });
  }

  start(cb?: (address: string) => void) {
    this.#writeMiddlewares();
    return new Promise<void>((res) =>
      // https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
      this.server.listen(this.#port, this.#host, undefined, () => {
        cb ? cb(`http://0.0.0.0:${this.#port}`) : void 0;
        res();
      }),
    );
  }

  async stop(cb?: (e?: Error) => void) {
    // TODO: to solve problem with weakmap as we have no way to iterate through all clients
    // for (const flow of this.#flows.values()) {
    //   if (!flow.sent) {
    //     flow.status(500);
    //     flow.send('Server terminated');
    //   }
    // }
    if (!this.ws) await this.stopWs();
    await new Promise<void>((res, rej) => {
      this.server?.close((e) => {
        if (e) {
          rej(e);
          cb?.(e);
        } else {
          cb?.();
          res();
        }
      });
    });
  }

  use(middleware: Middleware) {
    this.#middlewares.push(middleware);
    return this;
  }

  getMiddlewares(): Middleware[] {
    return this.#middlewares;
  }

  setCustomErrorHandler(eh: ErrorHandler) {
    this.#errorHandler = eh;
  }

  getRoutes() {
    return [...this.#routes.keys()];
  }
}

function checkRouteSetUp(routeSetUp: { [setting: string]: any }, key: string) {
  if (typeof routeSetUp.route !== 'string') {
    throw new TypeError(`A route path for the method ${key} is not a a string`);
  } else if (routeSetUp.route[0] !== '/') {
    throw new SyntaxError(
      `A route path should start with '/' for route ${routeSetUp.route} for method ${key}`,
    );
  } else if (routeSetUp.route[1] === '/') {
    throw new SyntaxError(
      `Declared route ${routeSetUp.route} for method ${key} is not correct, review the syntax`,
    );
  } else if (typeof routeSetUp.handler !== 'function') {
    throw new TypeError(
      `Handler for the route ${routeSetUp.route} for method ${key} is not a function`,
    );
  } else if (
    routeSetUp.options?.timeout &&
    typeof routeSetUp.options.timeout !== 'number' &&
    !Number.isFinite(routeSetUp.options.timeout)
  ) {
    throw new TypeError(
      `Only numeric values are valid per-route timeout, submitted ${routeSetUp.options.timeout}`,
    );
  }
}

function checkParams(params: { [param: string]: string | undefined }) {
  if (!params || Object.keys(params).length === 0) return params;
  for (const [param, value] of Object.entries(params)) {
    if (value === undefined) continue;

    if (/(\.\/)(\.\.)(\\.)/.test(decodeURI(value))) {
      logMe.warn(
        `Param ${param} value ${value} was redacted because contained dangerous characters`,
      );
      param[param] = 'REDACTED';
    }
  }

  return params;
}

const BareHttp = BareServer as ServerMergedType;

export { BareHttp };
