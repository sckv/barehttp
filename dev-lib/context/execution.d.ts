export declare class Execution {
    id: string;
    type: string;
    store: Map<string, string | number>;
    headers: Map<string, string | number>;
    constructor(type: string);
}
