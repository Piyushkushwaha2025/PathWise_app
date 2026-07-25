const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      fs.writeFileSync('dump.html', body);
      console.log('Dump saved to dump.html');
      res.end('ok');
    });
  }
});
server.listen(4000, '0.0.0.0', () => console.log('Listening on 4000'));
