const fetch = require('node-fetch'); // or native fetch if Node 18+

async function test() {
  const res = await fetch('https://studyos-ai-proxy.piyushkushwaha2520.workers.dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      syllabusText: '',
      courseName: 'Test'
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
