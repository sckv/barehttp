const express = require('express');
const app = express();
const port = 3000;

app.route.get('/myroute', (req, res) => {
  res.json({ ping: 'pong' });
});

app.listen(port, () => {
  console.log(`Express app listening at http://localhost:${port}`);
});
