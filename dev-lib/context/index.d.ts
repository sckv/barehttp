/// <reference types="node" />
import { Execution } from './execution';
import asyncHooks from 'async_hooks';
declare type Context = {
    current?: Execution;
    enabled: boolean;
};
declare const newContext: (type: string) => void;
declare const context: Context;
declare const enableContext: () => asyncHooks.AsyncHook;
export { context, newContext, enableContext };
