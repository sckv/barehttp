import { context, enableContext, newContext } from '../../context/index.js';

test("Do not create execution if it's not enabled", () => {
  newContext('newContext');

  expect(context.current).toBeUndefined();
});

test('Starts context and attaches an Execution class', () => {
  const hook = enableContext();

  newContext('newContext');

  expect(context.current?.id).toEqual(expect.any(String));
  expect(context.current?.type).toBe('newContext');

  hook.disable();
});

test('Execution class store exists and can store values', () => {
  const hook = enableContext();

  newContext('newContext');

  context.current?.store.set('store', 'value');

  expect(context.current?.store.get('store')).toBe('value');

  hook.disable();
});
