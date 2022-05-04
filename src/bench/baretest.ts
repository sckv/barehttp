import { BareHttp } from '../index';

const brt = new BareHttp({ logging: false });

brt.route.get({
  route: '/myroute',
  handler: (flow) => {
    flow.json({ ping: 'pong' });
  },
});

// let clt = 0;

// brt.ws?.declareReceiver<{ ok: string }>({
//   type: 'BASE_TYPE',
//   handler: async (data, client) => {
//     console.log({ data });
//     return { cool: 'some answer', client };
//   },
// });

// brt.ws?.defineUpgrade(async (req) => {
//   return { access: true, client: ++clt };
// });

// brt.ws?.handleManualConnect((ws, client) => {
//   console.log('connected!', ws.userClient.secId);
// });

brt.start(() => console.log('server started'));
