# bare-http

A slim web server in node used for microservices, with observability, speed and optimizations implicit.

## Features

Fully-featured production-ready HTTP/1.1 web server.

- safe and fast serialization-deserialization of JSON
- UUID (adopted or generated)
- Request-Time header and log
- promise or conventional middlewares
- fast logging in production and development (DataDog schema for production)
- routes usage report and endpoint
- headers cache handling
- cookies creation/parsing
- request execution isolated context
- request execution cancellation
- streaming of chunked multipart response
