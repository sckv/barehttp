import Router from 'find-my-way';

import { BareRequest, CacheOpts } from './request';
import { logMe } from './logger';
import { context, enableContext, newContext } from './context';
import { generateReport } from './report';
import { CookieManagerOptions } from './middlewares/cookies/cookie-manager';

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

type ErrorHandler = (err: any, flow: BareRequest) => void;

type ServerParams<A extends `${number}.${number}.${number}.${number}`> = {
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
  #router = Router({ ignoreTrailingSlash: true });
  #flows: Map<string, BareRequest> = new Map();
  #errorHandler: ErrorHandler;

  #runMiddlewaresSequence: (flow: BareRequest) => void = (_) => _;

  constructor(private params: ServerParams<A> = {}) {
    if (params.context) enableContext();

    this.server = createServer(this.#listener.bind(this));
    this.#errorHandler = params?.errorHandlerMiddleware || this.basicErrorHandler;

    this.#middlewares.push(...(params?.middlewares || []));

    if (params.statisticReport) this.registerReport();
    return this;
  }

  #listener = (request: IncomingMessage, response: ServerResponse) => {
    const { requestTimeFormat, logging } = this.params;

    const flow = new BareRequest(request, response, logging);

    newContext('request');
    context.current?.store.set('id', flow.uuid);

    if (requestTimeFormat) flow['setTimeFormat'](requestTimeFormat);

    request.on('close', () => this.#flows.delete(flow.uuid)); // remove already finished flow from the memory

    this.#flows.set(flow.uuid, flow);
    this.applyMiddlewares(flow.uuid);
  };

  /**
   * This function generates defined middlewares for the sequential execution
   */
  #writeMiddlewares = () => {
    const lines: string[] = [];
    let order = 0;
    const maxOrder = this.#middlewares.length;

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    if (maxOrder > 0) {
      while (order <= maxOrder - 1) {
        lines.push(`await this.resolveMiddleware(${order}, flow);`);
        order++;
      }
    }

    const text = lines.join('\n');

    this.#runMiddlewaresSequence = new AsyncFunction('flow', text);
  };

  private async applyMiddlewares(flowId: string) {
    const flow = this.#flows.get(flowId)!;
    await flow['readBody']();

    // attach special cookies middleware
    if (this.params.cookies) {
      flow['attachCookieManager'](this.params.cookiesOptions);
      flow['populateCookies']();
    }

    // to test in cloud provider
    if (this.params.reverseDns) {
      const remoteClient = await dns.promises.reverse(flow.remoteIp!);
      flow['setRemoteClient'](remoteClient[0]);
    }

    if (this.#middlewares.length) await this.#runMiddlewaresSequence(flow);
    this.#router.lookup(flow._originalRequest, flow._originalResponse);
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

    this.#router.on(method, route, (req, _, routeParams) => {
      this.#routes.get(encode)!.hits++;
      this.handleRoute(req, routeParams, handler, encode, opts);
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

    // apply possible options
    if (opts?.disableCache) flow.disableCache();
    if (opts?.cache) flow.setCache(opts.cache);
    if (opts?.timeout) flow['attachTimeout'](opts.timeout);

    // populate with route params
    if (routeParams) flow.setParams(routeParams);

    // attach a statistic reports counter
    if (this.params.statisticReport) {
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
    if (flow._originalResponse.headersSent) return;
    if (!response) flow.send();

    switch (response.constructor) {
      case Uint8Array:
      case Uint16Array:
      case Uint32Array:
      case ArrayBuffer:
      case Buffer:
      case Number:
        flow.send(response);
        break;
      case Writable:
        flow.stream(response);
        break;
      case String:
        flow.json(response);
        break;
      default:
        logMe.warn('Unknown type to send');
    }
  }

  private encodeRoute(method: string, route: string) {
    return `${method} ${route}`;
  }

  private basicErrorHandler(e: any, flow: BareRequest) {
    flow.status(500);
    flow.json({ ...e, message: e.message, stack: e.stack });
  }

  // ========= PUBLIC APIS ==========

  start(cb?: (address: string) => void) {
    this.#writeMiddlewares();

    const port = this.params?.serverPort || process.env.PORT || 3000;
    const address = this.params?.serverAddress || '0.0.0.0';

    // https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
    this.server.listen(+port, address, undefined, () =>
      cb ? cb(`http://localhost:${port}`) : void 0,
    );
  }

  stop(cb?: (e?: Error) => void) {
    for (const flow of Object.values(this.#flows)) {
      if (!flow._originalResponse.headersSent) {
        flow.status(500);
        flow.send('Server terminated');
      }
    }
    this.server?.close(cb);
  }

  use(middleware: Middleware) {
    this.#middlewares.push(middleware);
    return this;
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
    throw new Error(`A route path for the method ${key} is not a a string`);
  } else if (routeSetUp.route[0] !== '/') {
    throw new Error(
      `A route path should start with '/' for route ${routeSetUp.route} for method ${key}`,
    );
  } else if (routeSetUp.route[1] === '/') {
    throw new Error(
      `Declared route ${routeSetUp.route} for method ${key} is not correct, review the syntax`,
    );
  } else if (typeof routeSetUp.handler !== 'function') {
    throw new Error(
      `Handler for the route ${routeSetUp.route} for method ${key} is not a function`,
    );
  }
}
