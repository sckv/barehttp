import { getStatusLevel, parseError, serializeHttp, serializeLog } from '../../logger/serializers';

describe('logger - loglevel', () => {
  test('Correctly gets http log level from the returning http status <300', () => {
    expect(getStatusLevel(200)).toBe('info');
  });
  test('Correctly gets http log level from the returning http status >=400 && <500', () => {
    expect(getStatusLevel(422)).toBe('warn');
  });
  test('Correctly gets http log level from the returning http status >=500', () => {
    expect(getStatusLevel(500)).toBe('error');
  });
});
const req = {
  socket: { remoteAddress: '123.123.123.123' },
  method: 'POST',
  url: '/route',
  httpVersionMajor: 1,
  httpVersionMinor: 1,
  headers: { 'request-header': 'JAS(D*8y2joidA&T12' },
  httpVersion: '1.1',
};
const res = {
  statusCode: 200,
};

describe('logger - http call serializer', () => {
  test('Correctly serializes an req/res for an http log', () => {
    expect(
      serializeHttp(
        { 'my-header': 'header-value' },
        { toISOString: () => 'SOME_DATE' } as any,
        'remote.client',
        req as any,
        res as any,
      ),
    ).toEqual({
      level: 'info',
      logObject: {
        message: '123.123.123.123 remote.client SOME_DATE "POST /route HTTP/1.1" 200 -',
        timestamp: expect.any(Number),
        trace: undefined,
        request: {
          headers: { 'request-header': 'JAS(D*8y2joidA&T12' },
          http_version: '1.1',
          id: 'unknown',
          method: 'POST',
          url: '/route',
        },
        response: {
          status_code: res.statusCode,
          headers: { 'my-header': 'header-value' },
        },
        duration: 'unknown',
      },
    });
  });
});

describe('logger - parse error with fields', () => {
  test('Correctly parses an error with additional enumerable fields', () => {
    const customError = new Error('custom error message') as any;
    customError.additionalProp = 'value';
    expect(parseError(customError, {})).toEqual({
      error: {
        additionalProp: 'value',
        kind: 'Error',
        stack: expect.any(String),
      },
      message: 'custom error message',
    });
  });
});

// common logger
describe('logger - common logger serializer', () => {
  test('Correctly serializes log for only text', () => {
    expect(serializeLog('just log message')).toEqual({
      location: expect.any(String),
      logger: {
        method_name: 'asyncJestTest',
        name: 'pino',
        version: 'v1.0.0',
      },
      message: 'just log message',
      timestamp: expect.any(Number),
      trace: undefined,
    });
  });

  test('Correctly serializes log for text + object', () => {
    expect(serializeLog('just log message', { obj: 'to_log' })).toEqual({
      location: expect.any(String),
      logger: {
        method_name: 'asyncJestTest',
        name: 'pino',
        version: 'v1.0.0',
      },
      message: 'just log message',
      timestamp: expect.any(Number),
      trace: undefined,
      args: [{ obj: 'to_log' }],
    });
  });

  test('Correctly serializes log for object', () => {
    expect(serializeLog({ obj: 'to_log', anotherKey: 9839485 })).toEqual({
      location: expect.any(String),
      logger: {
        method_name: 'asyncJestTest',
        name: 'pino',
        version: 'v1.0.0',
      },
      message: 'EMPTY_MESSAGE',
      timestamp: expect.any(Number),
      trace: undefined,
      args: { obj: 'to_log', anotherKey: 9839485 },
    });
  });

  test('Correctly serializes log for multiple objects', () => {
    expect(
      serializeLog({ obj: 'to_log', anotherKey: 9839485 }, { additional: 'properties' }),
    ).toEqual({
      location: expect.any(String),
      logger: {
        method_name: 'asyncJestTest',
        name: 'pino',
        version: 'v1.0.0',
      },
      message: 'EMPTY_MESSAGE',
      timestamp: expect.any(Number),
      trace: undefined,
      args: [{ obj: 'to_log', anotherKey: 9839485 }, { additional: 'properties' }],
    });
  });

  test('Correctly serializes log for error', () => {
    const customError = new Error('custom error message') as any;
    customError.additionalProp = 'value';

    expect(serializeLog(customError)).toEqual({
      location: expect.any(String),
      logger: {
        method_name: 'asyncJestTest',
        name: 'pino',
        version: 'v1.0.0',
      },
      message: 'custom error message',
      timestamp: expect.any(Number),
      trace: undefined,
      error: {
        additionalProp: 'value',
        kind: 'Error',
        stack: expect.any(String),
      },
    });
  });

  test('Correctly serializes log for error when error is not first argument', () => {
    const customError = new Error('custom error message') as any;
    customError.additionalProp = 'value';

    expect(serializeLog('message for the log', customError)).toEqual({
      location: expect.any(String),
      logger: {
        method_name: 'asyncJestTest',
        name: 'pino',
        version: 'v1.0.0',
      },
      message: 'message for the log',
      timestamp: expect.any(Number),
      trace: undefined,
      args: [
        {
          error: {
            additionalProp: 'value',
            kind: 'Error',
            stack: expect.any(String),
          },
          message: 'custom error message',
        },
      ],
    });
  });
});
