/// <reference types="node" />
import Client, { MessageEvent, Server as WServer, ServerOptions } from 'ws';
import { IncomingMessage, Server } from 'http';
declare type UserClient = {
    secId: string;
    [k: string]: any;
};
declare type AuthAccess<T> = {
    access: boolean;
    message?: string;
    client?: T;
};
export declare type WsMessageHandler<D = any, UC extends UserClient = UserClient, M = any> = (data: D, client: UC, _ws: ClientWS<UC>, _event: MessageEvent) => Promise<M> | M;
declare type ClientWS<UC extends UserClient = UserClient> = Client & {
    userClient: UC;
};
export declare class WebSocketServer {
    #private;
    private opts;
    _internal: WServer;
    private customUpgradeDone;
    constructor(server: Server, opts?: ServerOptions);
    private _start;
    defineUpgrade<T>(fn: (request: IncomingMessage) => Promise<AuthAccess<T>> | AuthAccess<T>): void;
    private doUpgrade;
    private rejectUpgrade;
    private attachTypesHandling;
    private send;
    declareReceiver<D = any, C extends UserClient = UserClient>(receiver: {
        type: string;
        handler: WsMessageHandler<D, C>;
    }): void;
    getClientById<T extends UserClient>(id: string): ClientWS<T> | undefined;
    getClientByCriteria<T extends UserClient>(criteria: string, value: any, criteriaFunction?: (client: ClientWS<T>) => boolean): Client | undefined;
    handleManualConnect<T extends UserClient>(fn: (socket: ClientWS<T>, client: T) => Promise<void> | void): void;
}
export {};
