import EventEmitter from 'events';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'http';
import { RequestFlow } from './request';
import { CustomMap } from './utils/custom-map';

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

export class WebServer {
  #server: Server | null = null;
  middlewares: Array<Middleware> = [];
  routes: CustomMap<string, Handler> = new Map();
  errorHandler?: ErrorHandler;

  constructor(private params: ServerParams) {
    this.#server = createServer(this.listener);
    this.errorHandler = params.errorHandlerMiddleware;
    params.middlewares?.forEach((m) => this.middlewares.push(m));
    return this;
  }

  listener(request: IncomingMessage, response: ServerResponse) {
    const flow = new RequestFlow(request, response);
  }

  applyMiddlewares(flow: RequestFlow) {
    let order = 0;
    const maxOrder = this.middlewares.length - 1;
    const middlewaresHandler = new EventEmitter({ captureRejections: true });
    const nextFn = (e?: any) => middlewaresHandler.emit('next', e);

    middlewaresHandler
      .on('next', (e?: any) => {
        if (e) return;

        if (order <= maxOrder) {
          this.middlewares[order](flow, nextFn);
          order++;
        }
      })
      .on('error', (e: any) => {
        // todo design a basic error handler
        this.errorHandler!(e, flow);
      });
  }

  start(cb?: () => void) {
    this.#server?.listen(this.params.serverPort || process.env.PORT || 3000, cb);
  }

  stop(cb?: (e?: Error) => void) {
    this.#server?.close(cb);
  }

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  get(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('get', route), handler);
    return this;
  }
  post(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('post', route), handler);
    return this;
  }
  put(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('put', route), handler);
    return this;
  }
  patch(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('patch', route), handler);
    return this;
  }
  delete(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('delete', route), handler);
    return this;
  }
  options(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('options', route), handler);
    return this;
  }
  head(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('head', route), handler);
    return this;
  }

  encodeRoute(method: string, route: string) {
    return `${method.toUpperCase()}:${route}`;
  }

  getRoutes() {
    return [...this.routes.keys()];
  }

  private basicErrorHandler(e: any, flow: RequestFlow) {}
}
