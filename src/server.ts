import EventEmitter from 'events';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'http';
import { RequestFlow } from './request';
import FastRouter from 'find-my-way';

type Middleware = (flow: RequestFlow, next: (e: any) => void) => void;
type Handler = (flow: RequestFlow) => void;
type ErrorHandler = (err: any, flow: RequestFlow) => void;

type ServerParams = {
  middlewares?: Array<Middleware>;
  swaggerRoute?: string;
  bodyParserLimit?: '512kb' | '1mb' | '2mb' | '4mb' | '8mb' | '16mb';
  serverPort?: number;
  disableEtag?: boolean;
  enableRequestAbort?: boolean;
  errorHandlerMiddleware?: ErrorHandler;
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
export class WebServer {
  #server: Server | null = null;
  middlewares: Array<Middleware> = [];
  routes: Set<string> = new Set();
  router = FastRouter({ ignoreTrailingSlash: true });
  flows: { [k: string]: RequestFlow } = {};
  errorHandler: ErrorHandler;

  constructor(private params?: ServerParams) {
    this.#server = createServer(this.listener.bind(this));
    this.errorHandler = params?.errorHandlerMiddleware || this.basicErrorHandler;
    params?.middlewares?.forEach((m) => this.middlewares.push(m));
    return this;
  }

  listener(request: IncomingMessage, response: ServerResponse) {
    response.on('close', () => delete this.flows[flow.uuid]);
    const flow = new RequestFlow(request, response);
    // console.log({ flow });
    this.flows[flow.uuid] = flow;
    this.applyMiddlewares(flow.uuid);
  }

  applyMiddlewares(flowId: string) {
    const flow = this.flows[flowId];
    let order = 0;
    const maxOrder = this.middlewares.length - 1;
    if (maxOrder < 0) {
      this.router.lookup(flow.originalRequest, flow.originalResponse);
      return;
    }

    const middlewaresHandler = new EventEmitter({ captureRejections: true });
    const nextFn = (e?: any) => middlewaresHandler.emit('next', e);

    middlewaresHandler
      .on('next', (e?: any) => {
        if (e) this.errorHandler(e, flow);

        if (order <= maxOrder) {
          this.middlewares[order](flow, nextFn);
          order++;
        } else {
          this.router.lookup(flow.originalRequest, flow.originalResponse);
        }
      })
      .on('error', (e: any) => {
        this.errorHandler(e, flow);
      });
  }

  start(cb?: (address: string) => void) {
    const port = this.params?.serverPort || process.env.PORT || 3000;
    this.#server?.listen(port, () => (cb ? cb(`http://localhost:${port}`) : void 0));
  }

  stop(cb?: (e?: Error) => void) {
    Object.values(this.flows).forEach((flow) => {
      if (!flow.response.headersSent) flow.setStatus(500).send('Server terminated');
    });
    this.#server?.close(cb);
  }

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  // TODO: to extract to class proxy handler
  get(route: string, handler: Handler) {
    this.routes.add(this.encodeRoute(HttpMethods.get, route));
    this.setRoute(HttpMethods.get, route, handler);
    return this;
  }
  post(route: string, handler: Handler) {
    this.routes.add(this.encodeRoute(HttpMethods.post, route));
    this.setRoute(HttpMethods.post, route, handler);
    return this;
  }
  put(route: string, handler: Handler) {
    this.routes.add(this.encodeRoute(HttpMethods.put, route));
    this.setRoute(HttpMethods.put, route, handler);
    return this;
  }
  patch(route: string, handler: Handler) {
    this.routes.add(this.encodeRoute(HttpMethods.patch, route));
    this.setRoute(HttpMethods.patch, route, handler);
    return this;
  }
  delete(route: string, handler: Handler) {
    this.routes.add(this.encodeRoute(HttpMethods.delete, route));
    this.setRoute(HttpMethods.delete, route, handler);
    return this;
  }
  options(route: string, handler: Handler) {
    this.routes.add(this.encodeRoute(HttpMethods.options, route));
    this.setRoute(HttpMethods.options, route, handler);
    return this;
  }
  head(route: string, handler: Handler) {
    this.routes.add(this.encodeRoute(HttpMethods.head, route));
    this.setRoute(HttpMethods.options, route, handler);
    return this;
  }

  private setRoute(method: Methods, route: string, handler: Handler) {
    this.router.on(method, route, (req, _, params) => {
      const flow = this.flows[(req as any).id];
      flow.setParams(params);
      handler(flow);
    });
  }

  encodeRoute(method: string, route: string) {
    return `${method} ${route}`;
  }

  getRoutes() {
    return [...this.routes.keys()];
  }

  private basicErrorHandler(e: any, flow: RequestFlow) {}
}
