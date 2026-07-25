const fetch = require('node-fetch');

async function test() {
  const res = await fetch('https://studyos-ai-proxy.piyushkushwaha2520.workers.dev/list');
  const data = await res.json();
  const models = data.models ? data.models.map(m => m.name) : data;
  console.log(JSON.stringify(models, null, 2));
}

test();
