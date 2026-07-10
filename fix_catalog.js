const fs = require('fs');

try {
    let raw = fs.readFileSync('catalog_utf8.json', 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const data = JSON.parse(raw);

    data.roadmaps.forEach(roadmap => {
        if (!roadmap.modules) return;
        roadmap.modules.forEach(mod => {
            if (!mod.topics) return;
            const fixedTopics = [];
            mod.topics.forEach(t => {
                if (typeof t === 'string' && t.startsWith('@{')) {
                    let inner = t.substring(2, t.length - 1).trim();
                    const obj = {};
                    const regex = /(\w+)=(.+?)(?=; \w+=|;?$|$)/g;
                    let match;
                    while ((match = regex.exec(inner)) !== null) {
                        const key = match[1];
                        let val = match[2].trim();
                        if (val === 'System.Object[]') val = [];
                        obj[key] = val;
                    }
                    // Handle missing objective text if needed, but [] is fine.
                    fixedTopics.push(obj);
                } else {
                    fixedTopics.push(t);
                }
            });
            mod.topics = fixedTopics;
        });
    });

    fs.writeFileSync('catalog_utf8.json', JSON.stringify(data, null, 2), 'utf-8');
    console.log('Fixed catalog_utf8.json topics!');
} catch (err) {
    console.error(err);
}
