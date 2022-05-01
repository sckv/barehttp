const fastify = require('fastify')();

// Declare a route
fastify.get('/myroute', function (request, reply) {
  reply.send({
    fine: 'fine',
    coolData: 1123,
    kek: { haha: null },
    otherUnion: 1233232,
    generical: { prop: false },
    justArray: [],
    strangeArray: [{ okey: true }],
    twoDifferentObjects: { notOk: 23423423 },
    mergedObjects: { notOk: 0, optional: [3423423] },
  });
});

// Run the server!
fastify.listen(3000, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log('rutting server');
  fastify.log.info(`server listening on ${address}`);
});
