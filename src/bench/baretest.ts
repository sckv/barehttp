import { BareHttp } from '../index';

const brt = new BareHttp({ statisticsReport: true, ws: true });

brt.get({
  route: '/myroute',
  handler: (flow) => {
    flow._send('just response');
  },
});

let clt = 0;

brt.ws?.declareReceiver<{ ok: string }, number>('BASE.TYPE', async (data, client) => {
  console.log({ data });
  return { cool: 'some answer', client };
});

brt.ws?.defineUpgrade(async (req) => {
  return { access: true, client: ++clt };
});

brt.start(() => console.log('server started'));
