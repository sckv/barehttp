import { BareHttp } from '../index';

const brt = new BareHttp({ statisticsReport: true });

brt.get({
  route: '/myroute',
  handler: (flow) => {
    flow._send('just response');
  },
});

brt.start(() => console.log('server started'));
