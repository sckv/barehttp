import Router from 'find-my-way';

import { BareRequest, CacheOpts } from './request';
import { logMe } from './logger';
import { context, enableContext, newContext } from './context';
import { generateReport } from './report';
import { CookieManagerOptions } from './middlewares/cookies/cookie-manager';
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
interface HandlerExposed {
  <R extends `/${string}`, C>(setUp: {
    route: R;
    options?: RouteOpts<C>;
    handler: Handler;
  }): BareServer<any>;
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
  cookiesOptions?: CookieManagerOptions;
  /**
   * Log the resolved reverse DNS first hop for remote ip of the client (first proxy)
   */
  reverseDns?: boolean;
  /**
   * Exposes a report with the routes usage.
   * Default `false`
   */
  statisticReport?: boolean;
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

export class BareServer<A extends `${number}.${number}.${number}.${number}`> {
  server: Server;
  #middlewares: Array<Middleware> = [];
  #routes: Map<string, RouteReport> = new Map();
  #routesLib: Map<string, any> = new Map();

  #router = Router({ ignoreTrailingSlash: true });
  #flows: Map<string, BareRequest> = new Map();
  #errorHandler: ErrorHandler;

  #runMiddlewaresSequence: (flow: BareRequest) => void = (_) => _;

  constructor(private bareOptions: BareOptions<A> = {}) {
    // init
    this.server = createServer(this.#listener.bind(this));
    this.attachGracefulHandlers();

    // context setting
    if (bareOptions.context) enableContext();

    // middlewares settings
    this.#errorHandler = bareOptions?.errorHandlerMiddleware || this.basicErrorHandler;
    this.#middlewares.push(...(bareOptions?.middlewares || []));
    if (bareOptions.statisticReport) this.registerReport();

    return this;
  }

  #listener = (request: IncomingMessage, response: ServerResponse) => {
    const { requestTimeFormat, logging } = this.bareOptions;

    const flow = new BareRequest(request, response, logging);

    // init and attach request uuid to the context
    if (this.bareOptions.context) {
      newContext('request');
      context.current?.store.set('id', flow.uuid);
    }

    if (requestTimeFormat) flow['setTimeFormat'](requestTimeFormat);

    // listener to remove already finished flow from the memory storage
    request.on('close', () => this.#flows.delete(flow.uuid));

    // attach a flow to the flow memory storage
    this.#flows.set(flow.uuid, flow);
    this.applyMiddlewares(flow.uuid).catch((e) => this.#errorHandler(e, flow, 400));
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

  private async applyMiddlewares(flowId: string) {
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

  private setRoute(method: Methods, route: string, handler: Handler, opts?: RouteOpts<any>) {
    const encode = this.encodeRoute(method, route);
    this.#routes.set(encode, { hits: 0, fails: 0, success: 0 });

    const handleFn = (req, _, routeParams) => {
      this.#routes.get(encode)!.hits++;

      this.handleRoute(req, checkParams(routeParams), handler, encode, opts);
    };

    this.#routesLib.set(encode, handleFn);

    this.#router.on(method, route, handleFn);
  }

  private setRuntimeRoute(method: Methods, route: string, handler: Handler, opts?: RouteOpts<any>) {
    const encode = this.encodeRoute(method, route);
    this.#routes.set(encode, { hits: 0, fails: 0, success: 0 });

    if (this.#routesLib.get(encode)) {
      this.#routesLib.delete(encode);
    }

    const handleFn = (req, _, routeParams) => {
      this.#routes.get(encode)!.hits++;
      this.handleRoute(req, checkParams(routeParams), handler, encode, opts);
    };

    this.#routesLib.set(encode, handleFn);

    this.#router.reset();

    this.#routesLib.forEach((handlerFn, route) => {
      const [m, r] = this.explodeRoute(route);

      this.#router.on(m, r, handlerFn);
    });
  }

  private registerReport() {
    this.setRoute('GET', '/_report', (flow) => {
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
    if (opts?.disableCache) flow.disableCache();
    if (opts?.cache) flow.setCache(opts.cache);
    if (opts?.timeout) flow['attachTimeout'](opts.timeout);

    // populate with route params
    if (routeParams) flow['setParams'](routeParams);

    // attach a general statistic reports counter
    if (this.bareOptions.statisticReport) {
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
    if (!response) flow.send();

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

  // ========= PUBLIC APIS ==========

  get runtimeRoute() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Proxy(
      {},
      {
        get(_, key) {
          if (typeof key === 'symbol') return self;
          if (!self.server?.listening) {
            console.warn(
              'Runtime route declaration can be done only while the server is running. Follow documentation for more details',
            );
            return self;
          }

          if (Object.keys(HttpMethods).includes(key as string)) {
            return function (routeSetUp: any) {
              checkRouteSetUp(routeSetUp, key);
              self.setRuntimeRoute(
                HttpMethods[key],
                routeSetUp.route,
                routeSetUp.handler,
                routeSetUp.options,
              );
              return self;
            };
          }

          return self;
        },
      },
    ) as Readonly<
      {
        [K in keyof typeof HttpMethods]: HandlerExposed;
      }
    >;
  }

  start(cb?: (address: string) => void) {
    this.#writeMiddlewares();

    const port = this.bareOptions?.serverPort || process.env.PORT || 3000;
    const address = this.bareOptions?.serverAddress || '0.0.0.0';

    // https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
    return new Promise<void>((res) =>
      this.server.listen(+port, address, undefined, () => {
        cb ? cb(`http://0.0.0.0:${port}`) : void 0;
        res();
      }),
    );
  }

  stop(cb?: (e?: Error) => void) {
    for (const flow of this.#flows.values()) {
      if (!flow.sent) {
        flow.status(500);
        flow.send('Server terminated');
      }
    }
    return new Promise<void>((res, rej) => {
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

  get route() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Proxy(
      {},
      {
        get(_, key) {
          if (typeof key === 'symbol') return self;

          if (Object.keys(HttpMethods).includes(key as string)) {
            return function (routeSetUp: any) {
              checkRouteSetUp(routeSetUp, key);
              self.setRoute(
                HttpMethods[key],
                routeSetUp.route,
                routeSetUp.handler,
                routeSetUp.options,
              );
              return self;
            };
          }

          return self;
        },
      },
    ) as Readonly<
      {
        [K in keyof typeof HttpMethods]: HandlerExposed;
      }
    >;
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
