import { BareHttp } from '../index';

const brt = new BareHttp({ statisticsReport: true });

brt.get({
  route: '/myroute',
  handler: () => 'just response',
});

brt.start(() => console.log('server started'));
