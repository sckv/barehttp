const fastify = require('fastify')({
  logger: true,
});

// Declare a route
fastify.get('/route', function (request, reply) {
  reply.send('JUST RESPONSE');
});

// Run the server!
fastify.listen(3002, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log('rutting server');
  fastify.log.info(`server listening on ${address}`);
});
