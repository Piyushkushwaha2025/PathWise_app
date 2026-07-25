import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { parseOffice } from 'officeparser';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'studyos-index';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!PINECONE_API_KEY || !GEMINI_API_KEY) {
  console.error("❌ ERROR: Missing PINECONE_API_KEY or GEMINI_API_KEY in .env file.");
  process.exit(1);
}

const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Chunking function: Splits text into roughly 500-1000 character chunks cleanly
function chunkText(text, maxChunkSize = 800) {
  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/); // split by blank lines
  
  let currentChunk = '';
  for (const p of paragraphs) {
    const cleaned = p.trim().replace(/\s+/g, ' ');
    if (!cleaned) continue;
    
    if (currentChunk.length + cleaned.length > maxChunkSize) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = cleaned;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + cleaned;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } else if (ext === '.pptx' || ext === '.ppt' || ext === '.docx') {
    const res = await parseOffice(filePath);
    const text = typeof res.toText === 'function' ? res.toText() : res.content;
    return text || "";
  } else {
    throw new Error("Unsupported file type: " + ext);
  }
}

async function getEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
  const result = await model.embedContent(text);
  // Gemini embedding 2 returns 3072 dimensions. Our Pinecone index is 768.
  // We can safely slice the first 768 dimensions because the model uses Matryoshka Representation Learning.
  return result.embedding.values.slice(0, 768);
}

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, file));
    }
  });
  return arrayOfFiles.filter(f => f.match(/\.(pdf|pptx?|docx)$/i));
}

async function main() {
  const customSubject = process.argv[2];
  
  console.log("🚀 Starting Data Ingestion...");
  if (customSubject) {
     console.log(`📌 Using custom subject for all files: ${customSubject}`);
  }
  
  const index = pinecone.index(PINECONE_INDEX_NAME);
  const dataDir = path.join(__dirname, 'data');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
    console.log(`📁 Created 'data' folder at ${dataDir}. Please put your PDFs and PPTs inside it and run again.`);
    return;
  }

  const allFiles = getAllFiles(dataDir).filter(f => f.includes('25CSH-214'));
  if (allFiles.length === 0) {
    console.log("⚠️ No supported files (PDF, PPTX, PPT, DOCX) found in the 'data' folder.");
    return;
  }

  // Group files by subject for overview generation
  const subjectFiles = {};

  for (const filePath of allFiles) {
    const file = path.basename(filePath);
    // Relative path to get folder structure, e.g. DBMS\Unit 1\Topic.pptx
    const relativePath = path.relative(dataDir, filePath);
    const pathParts = relativePath.split(path.sep);
    // If inside subject/unit folder (e.g. 25CSH-209/Unit 1), use "25CSH-209 Unit 1"
    let folderSubject = 'General';
    if (pathParts.length > 2) {
        folderSubject = `${pathParts[0]} ${pathParts[1]}`;
    } else if (pathParts.length > 1) {
        folderSubject = pathParts[0];
    }
    const subjectMatch = customSubject ? `${customSubject} ${pathParts.length > 2 ? pathParts[1] : ''}`.trim() : folderSubject;
    
    if (!subjectFiles[subjectMatch]) subjectFiles[subjectMatch] = [];
    subjectFiles[subjectMatch].push(file);

    console.log(`\n📄 Processing ${file} (Subject: ${subjectMatch})...`);
    
    try {
      const text = await processFile(filePath);
      
      if (!text || text.trim().length === 0) {
         console.log(`   ⚠️ No text could be extracted from ${file}. Skipping.`);
         continue;
      }
      
      console.log(`   ✅ Extracted ${text.length} characters.`);
      const chunks = chunkText(text);
      console.log(`   ✂️ Splitted into ${chunks.length} chunks.`);
      
      const vectors = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`   🧠 Embedding chunk ${i+1}/${chunks.length}...`);
        
        await new Promise(r => setTimeout(r, 3000)); // Delay to prevent 429
        const embedding = await getEmbedding(chunk);
        
        vectors.push({
          id: `${file.replace(/[^a-zA-Z0-9-]/g, '_')}-chunk-${i}`,
          values: embedding,
          metadata: {
            text: chunk,
            source: file,
            subject: subjectMatch
          }
        });
        
        if (vectors.length >= 50 || i === chunks.length - 1) {
          console.log(`   ☁️ Upserting ${vectors.length} vectors to Pinecone...`);
          await index.upsert(vectors);
          vectors.length = 0;
        }
      }
      console.log(`🎉 Finished ${file}!`);
    } catch (e) {
      console.error(`❌ Failed to process ${file}:`, e);
    }
  }
  
  for (const [subject, files] of Object.entries(subjectFiles)) {
    console.log(`📝 Generating Overview Chunk for subject: ${subject}...`);
    const overviewText = `[SYLLABUS OVERVIEW - TOPICS COVERED IN THIS UNIT]: If the student asks 'what is in this unit', 'what are the topics', or 'give me an overview', you must list these files/topics: \n` + files.map(f => `- ${f.replace(/\.(pptx|pdf)$/i, '')}`).join('\n');
    
    try {
      const embedding = await getEmbedding(overviewText);
      await index.upsert([{
        id: `${subject.replace(/[^a-zA-Z0-9-]/g, '_')}-overview`,
        values: embedding,
        metadata: {
          text: overviewText,
          source: 'System Overview',
          subject: subject
        }
      }]);
      console.log("✅ Overview chunk upserted!");
    } catch (e) {
      console.error("❌ Failed to upsert overview:", e);
    }
  }

  console.log("\n✅ All files processed successfully!");
}

main().catch(console.error);
