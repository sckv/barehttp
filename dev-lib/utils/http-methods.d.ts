export declare const HttpMethods: {
    readonly get: "GET";
    readonly post: "POST";
    readonly put: "PUT";
    readonly delete: "DELETE";
    readonly patch: "PATCH";
    readonly options: "OPTIONS";
    readonly head: "HEAD";
};
export declare type HttpMethodsUnion = keyof typeof HttpMethods;
export declare type HttpMethodsUnionUppercase = typeof HttpMethods[keyof typeof HttpMethods];
