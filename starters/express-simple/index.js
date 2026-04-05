const express = require('express');
const { resolve } = require('path');

const app = express();
const port = 3010;
const host = '0.0.0.0'; // 🔥 ADD THIS LINE - Critical for WebContainer!

app.use(express.static('static'));

app.get('/', (req, res) => {
  res.sendFile(resolve(__dirname, 'pages/index.html'));
});

// 🔥 CHANGE THIS LINE - Add 'host' parameter
app.listen(port, host, () => {
  console.log(`Example app listening at http://localhost:${port}`);
  console.log(`Server bound to: ${host}`); // Optional: confirm binding
});