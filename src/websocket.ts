import Client, { MessageEvent, OPEN, Server as WServer, ServerOptions } from 'ws';
import callsites from 'callsites';
import hyperid from 'hyperid';

import { logMe } from './logger';
import { JSONParse, JSONStringify } from './utils';

import { IncomingMessage, Server } from 'http';
import { Duplex } from 'stream';

const generateId = hyperid();

type UserClient = { secId: string; [k: string]: any };
type AuthAccess<T> = { access: boolean; message?: string; client?: T };
export type WsMessageHandler<D = any, UC extends UserClient = UserClient, M = any> = (
  data: D,
  client: UC,
  _ws: ClientWS<UC>,
  _event: MessageEvent,
) => Promise<M> | M;

type ClientWS<UC extends UserClient = UserClient> = Client & { userClient: UC };

export class WebSocketServer {
  _internal!: WServer;

  #httpServer: Server;
  #types: Map<string, { loc: string; handler: WsMessageHandler<any, any, any> }> = new Map();

  private customUpgradeDone = false;

  constructor(server: Server, private opts: ServerOptions = {}) {
    this.#httpServer = server;
  }

  private _start() {
    if (!this._internal) {
      this.#createWServer({ server: this.#httpServer });
    }
  }

  #createWServer(newOptions: ServerOptions = {}) {
    const opts = Object.assign({}, this.opts, newOptions);
    this._internal = new WServer(opts);
    this.attachTypesHandling();
  }

  defineUpgrade<T>(fn: (request: IncomingMessage) => Promise<AuthAccess<T>> | AuthAccess<T>) {
    if (this.customUpgradeDone) {
      throw new Error('Cannot redeclare again a custom upgrade.');
    }

    const newOptions = Object.assign({}, this.opts, { noServer: true });
    this.#createWServer(newOptions);

    this.#httpServer.on('upgrade', (request, socket, head) => {
      try {
        const response = fn(request);
        if (response instanceof Promise) {
          response
            .then((answer) => this.doUpgrade(answer, request, socket, head))
            .catch((e) => this.rejectUpgrade(request, socket, e?.message, e));
        } else {
          this.doUpgrade(response, request, socket, head);
        }
      } catch (e) {
        if (e instanceof Error) {
          this.rejectUpgrade(request, socket, e?.message, e);
        }
      }
    });

    this.customUpgradeDone = true;
  }

  private doUpgrade(
    answer: AuthAccess<any>,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    if (!answer.access) this.rejectUpgrade(request, socket, answer.message);
    else {
      this._internal.handleUpgrade(request, socket, head, (ws) => {
        const userClient = {
          secId: request.headers['sec-websocket-key'] || generateId(),
          ...(answer.client || {}),
        };

        (ws as ClientWS).userClient = userClient;
        this._internal.emit('connection', ws, request, userClient);
      });
    }
  }

  private rejectUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    message = 'Not Authorized',
    data?: any,
  ) {
    logMe.warn(
      message || `Upgrade rejected for the client from ${request.socket.remoteAddress}`,
      data,
    );
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); // TODO: enhance to be able to personalize this
    socket.destroy();
  }

  private attachTypesHandling() {
    this._internal.on('connection', (ws: ClientWS, _: IncomingMessage, client: any) => {
      ws.onmessage = (event) => {
        const decode = JSONParse<{ [k: string]: any; type: string }>(event.data);
        if (decode === null) {
          logMe.error('Incorrect data received from the client', {
            data: event.data,
            client: client ?? 'UNDEFINED_CLIENT',
          });
        } else if (!decode.type) {
          logMe.error(`Data from the client does not contain 'type' field`, {
            data: event.data,
            client: client ?? 'UNDEFINED_CLIENT',
          });
        } else {
          const procedure = this.#types.get(decode.type);
          if (!procedure || typeof procedure.handler !== 'function') {
            logMe.error(`There's no correct procedure for type "${decode.type}"`, {
              data: event.data,
              client: client ?? 'UNDEFINED_CLIENT',
            });
          } else {
            try {
              const response = procedure.handler(decode, client, ws, event);
              if (response instanceof Promise) {
                response
                  .then((resolvedResponse) => {
                    if (!resolvedResponse) return;
                    this.send(
                      { ws, client },
                      JSONStringify({ type: `${decode.type}_RESPONSE`, ...resolvedResponse }),
                    );
                  })
                  .catch((e) =>
                    logMe.error(`Error working out a handler for type ${decode.type}`, {
                      error: e,
                      client,
                      data: decode,
                    }),
                  );
              } else {
                if (!response) return;
                this.send(
                  { ws, client },
                  JSONStringify({ type: `${decode.type}_RESPONSE`, ...response }),
                );
              }
            } catch (e) {
              logMe.error(`Error working out a handler for type ${decode.type}`, {
                error: e,
                client,
                data: decode,
              });
            }
          }
        }
      };
    });
  }

  private send(ctx: { ws: ClientWS; client: any }, data: string | null) {
    if (ctx.ws.readyState === OPEN) {
      ctx.ws.send(data);
    } else {
      logMe.error('Could not send data for the client', { client: ctx.client });
    }
  }

  declareReceiver<D = any, C extends UserClient = UserClient>(receiver: {
    type: string;
    handler: WsMessageHandler<D, C>;
  }) {
    const previousDeclaration = this.#types.get(receiver.type);
    if (previousDeclaration) {
      throw new Error(
        `Can not redeclare a type ${receiver.type} for the WS Server, already declared at ${previousDeclaration.loc}`,
      );
    }

    if (typeof receiver.handler !== 'function') {
      throw new Error(
        `Can't declare a handler with type ${typeof receiver.handler}, should be a function with following signature: WsMessageHandler<T,?>`,
      );
    }

    const place = callsites()[2];
    const loc = `${place.getFileName()}:${place.getLineNumber()}:${place.getColumnNumber()}`;

    this.#types.set(receiver.type, { loc, handler: receiver.handler });
  }

  getClientById<T extends UserClient>(id: string) {
    for (const client of this._internal.clients.values()) {
      if ((client as ClientWS).userClient.secId === id) {
        return client as ClientWS<T>;
      }
    }
  }

  getClientByCriteria<T extends UserClient>(
    criteria: string,
    value: any,
    criteriaFunction?: (client: ClientWS<T>) => boolean,
  ) {
    for (const client of this._internal.clients.values()) {
      if (typeof criteriaFunction === 'function') {
        if (criteriaFunction(client as ClientWS<T>)) {
          return client;
        }
      }
      if ((client as ClientWS).userClient[criteria] === value) {
        return client as ClientWS<T>;
      }
    }
  }

  handleManualConnect<T extends UserClient>(
    fn: (socket: ClientWS<T>, client: T) => Promise<void> | void,
  ) {
    this._internal.on('connection', (ws, _, client) => fn(ws, client));
  }
}
