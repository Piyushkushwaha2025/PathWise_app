const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('d:\\AI\\LearnPath-AI\\PathWise_Versions\\v1.0.2\\catalog_utf8.json', 'utf8'));
  
  const roadmaps = [];
  
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (item.title) roadmaps.push(item.title);
      else if (item.name) roadmaps.push(item.name);
    });
  } else if (data.roadmaps) {
    data.roadmaps.forEach(item => {
      if (item.title) roadmaps.push(item.title);
      else if (item.name) roadmaps.push(item.name);
    });
  } else {
    for (const key in data) {
      if (Array.isArray(data[key])) {
        data[key].forEach(item => {
          if (item.title) roadmaps.push(item.title);
          else if (item.name) roadmaps.push(item.name);
        });
      } else if (data[key] && typeof data[key] === 'object' && data[key].title) {
        roadmaps.push(data[key].title);
      }
    }
  }
  
  console.log("Total roadmaps found:", roadmaps.length);
  console.log(roadmaps.join('\n'));
} catch (e) {
  console.error("Error reading or parsing catalog_utf8.json:", e.message);
}
