const express = require('express');
const app = express();
const port = 3001;

app.get('/route', (req, res) => {
  res.send('JUST RESPONSE');
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
