import { Execution } from './execution.js';

import asyncHooks from 'async_hooks';

const running = new Map<number, Execution>();
const previous = new Map<number, Execution>();

type Context = {
  current?: Execution;
  enabled: boolean;
};

const newContext = (type: string) => {
  if (!context.enabled) return;
  context.current = new Execution(type);
  running.set(asyncHooks.executionAsyncId(), context.current);
};

const context: Context = {
  enabled: false,
} as any;

function init(asyncId: number, _type: string, triggerAsyncId: number) {
  if (running.get(triggerAsyncId)) {
    running.set(asyncId, running.get(triggerAsyncId)!);
  }
}

function before(asyncId: number) {
  if (!running.get(asyncId)) return;

  previous.set(asyncId, context.current!);
  context.current = running.get(asyncId);
}

function after(asyncId: number) {
  if (!running.get(asyncId)) return;

  context.current = previous.get(asyncId);
}

function destroy(asyncId: number) {
  if (running.get(asyncId)) {
    running.delete(asyncId);
    previous.delete(asyncId);
  }
}

const hook = asyncHooks.createHook({
  init,
  before,
  after,
  destroy,
});

const enableContext = () => {
  context.enabled = true;
  return hook.enable();
};

export { context, newContext, enableContext };
