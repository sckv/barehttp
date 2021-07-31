const express = require('express');
const app = express();
const port = 3001;

app.get('/myroute', (req, res) => {
  res.send('just response');
});

app.listen(port, () => {
  console.log(`Express app listening at http://localhost:${port}`);
});
