const fastify = require('fastify')();

// Declare a route
fastify.get('/myroute', function (request, reply) {
  reply.send({ ping: 'pong' });
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
