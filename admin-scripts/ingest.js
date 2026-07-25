import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
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
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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

async function processPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

async function getEmbedding(text) {
  const response = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: text
  });
  return response.embeddings[0].values;
}

async function main() {
  console.log("🚀 Starting Data Ingestion...");
  
  const index = pinecone.index(PINECONE_INDEX_NAME);
  const dataDir = path.join(__dirname, 'data');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
    console.log(`📁 Created 'data' folder at ${dataDir}. Please put your PDFs inside it and run again.`);
    return;
  }

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf'));
  if (files.length === 0) {
    console.log("⚠️ No PDF files found in the 'data' folder.");
    return;
  }

  for (const file of files) {
    console.log(`\n📄 Processing ${file}...`);
    const filePath = path.join(dataDir, file);
    
    try {
      const text = await processPdf(filePath);
      console.log(`   ✅ Extracted ${text.length} characters.`);
      
      const chunks = chunkText(text);
      console.log(`   ✂️ Splitted into ${chunks.length} chunks.`);
      
      const vectors = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`   🧠 Embedding chunk ${i+1}/${chunks.length}...`);
        
        // Add subject metadata (extract from filename e.g. "COA_Unit1.pdf" -> "COA")
        const subjectMatch = file.split('_')[0];
        
        const embedding = await getEmbedding(chunk);
        
        vectors.push({
          id: `${file}-chunk-${i}`,
          values: embedding,
          metadata: {
            text: chunk,
            source: file,
            subject: subjectMatch || 'General'
          }
        });
        
        // Pinecone recommends upserting in batches of ~100
        if (vectors.length >= 50 || i === chunks.length - 1) {
          console.log(`   ☁️ Upserting ${vectors.length} vectors to Pinecone...`);
          await index.upsert(vectors);
          vectors.length = 0; // clear array
        }
      }
      
      console.log(`🎉 Finished ${file}!`);
    } catch (e) {
      console.error(`❌ Failed to process ${file}:`, e);
    }
  }
  
  console.log("\n✅ All files processed successfully!");
}

main().catch(console.error);
