import { GoogleGenAI } from '@google/genai';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// In a real app, this should come from your .env file
// Example: EXPO_PUBLIC_AI_PROXY_URL="https://studyos-ai-proxy.YOUR_USERNAME.workers.dev"
const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;

// We still keep the Master Prompt here for Personal API Keys
export const MASTER_PROMPT = `=== IDENTITY ===
You are StudyOS AI Tutor — a precise, structured, exam-focused University AI Tutor built exclusively for StudyOS students. Your top priority is ACCURACY over speed or creativity.

# RESPONSE STYLE

Explain concepts like a university professor.

For every technical topic:

1. Definition
2. Why it exists
3. How it works
4. Example
5. Advantages
6. Disadvantages
7. Exam points

Use headings and bullet points when helpful.

---

# CODING QUESTIONS

If the topic involves programming:

- Explain the algorithm first.
- Explain time complexity.
- Explain space complexity.
- Then provide clean code.
- Finally explain each important step.

---

# EXAM MODE

If the user asks:

"for exam"

or

"5 marks"

or

"short answer"

Then provide a concise exam-oriented answer.

If the user asks:

"detailed"

Provide a complete explanation.

---

# DIAGRAMS

Whenever a diagram would improve understanding:

Generate an ASCII diagram.

Example:

CPU
 │
 ▼
Memory
 │
 ▼
Disk

---

# MATHEMATICS

Show calculations step-by-step.

Never skip intermediate steps.

---

# COMPARISON QUESTIONS

Whenever comparing concepts:

Use a table.

---

# OUTPUT QUALITY

Prefer clarity over complexity.

Use simple English unless the user requests otherwise.

Avoid unnecessary jargon.

---

# CONTEXT RESOLUTION

If multiple retrieved chunks discuss the same concept:

Merge them into one coherent explanation.

Avoid repeating identical sentences.

---

# CONFIDENCE

If retrieval strongly supports the answer:

Do not mention confidence.

If retrieval is weak:

Mention what information is missing.

---

# FINAL RULE

Every answer should help the student understand the topic rather than memorize isolated facts.
# KNOWLEDGE PRIORITY

Always follow this order:

1. Retrieved Context (Highest Priority)
2. Previous conversation
3. General knowledge (Only if retrieval has no answer)

Never ignore retrieved information.

---

# WHEN CONTEXT EXISTS

If retrieved documents contain the answer:

- Base your response on them.
- Merge information from multiple retrieved chunks.
- Resolve small wording differences.
- Keep the answer factually consistent.
- Do not invent missing details.`;

export async function generateAiResponse(
  messages: any[], 
  syllabusText: string, 
  courseName: string,
  courseCode?: string,
  userLearningProfile?: string
): Promise<string> {
  // 1. Check if user has a personal VIP key
  const personalKey = await SecureStore.getItemAsync('gemini_api_key');
  
  if (personalKey && personalKey.trim().length > 10) {
    // USE PERSONAL KEY DIRECTLY (Unlimited)
    
    // RAG SYSTEM: Query Pinecone for relevant PPT knowledge
    let ragContext = "";
    const PINECONE_HOST = process.env.EXPO_PUBLIC_PINECONE_HOST;
    const PINECONE_KEY = process.env.EXPO_PUBLIC_PINECONE_API_KEY;
    
    if (PINECONE_HOST && PINECONE_KEY && messages.length > 0) {
       try {
          let lastMsg = messages[messages.length - 1].parts[0].text;
          
          let requestedFiles: string[] = [];
          const instructionMarker = '[USER INSTRUCTION: ONLY focus your answer strictly on the following files: ';
          const markerIdx = lastMsg.indexOf(instructionMarker);
          if (markerIdx !== -1) {
              const afterMarker = lastMsg.substring(markerIdx + instructionMarker.length);
              const endMarkerIdx = afterMarker.indexOf('. Do not use');
              if (endMarkerIdx !== -1) {
                  const filesStr = afterMarker.substring(0, endMarkerIdx);
                  requestedFiles = filesStr.split(', ').map((f: string) => f.trim());
              }
              // Clean the prompt for embedding so it doesn't skew vector search
              lastMsg = lastMsg.substring(0, markerIdx).trim();
          }

          let embedText = lastMsg || 'Explain the topic';
          if (requestedFiles.length > 0) {
              const cleanedFiles = requestedFiles.map((f: string) => f.replace(/\.(pptx|pdf|docx|txt)$/i, '').replace(/Topic \d+\.\d+(?:\.\d+)?\s*-\s*/i, '')).join(' ');
              embedText = `${embedText}. Context: ${cleanedFiles}`;
          }

          let vector: number[] = [];
          const isGemini = personalKey.startsWith('AIza');
          const isClaude = personalKey.startsWith('sk-ant-');
          const isGroq = personalKey.startsWith('gsk_');
          const isNvidia = personalKey.startsWith('nvapi-');
          const isOpenAI = personalKey.startsWith('sk-') && !isClaude;

          if (isGemini) {
             const client = new GoogleGenAI({ apiKey: personalKey });
             const embedRes = await client.models.embedContent({
                model: 'text-embedding-004',
                contents: embedText
             });
             vector = embedRes.embeddings?.[0]?.values?.slice(0, 768) || [];
          } else {
             // For non-Gemini keys, hit the Proxy for embeddings
             if (!PROXY_URL) throw new Error("NO_PROXY_URL");
             const proxyRes = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'embed', text: embedText })
             });
             if (proxyRes.ok) {
                const proxyData = await proxyRes.json();
                vector = proxyData.vector || [];
             }
          }
          
          if (vector.length > 0) {
             const baseUrl = PINECONE_HOST.startsWith('http') ? PINECONE_HOST : `https://${PINECONE_HOST}`;
             const queryTopK = requestedFiles.length > 0 ? 2000 : 20;
             const pineconeRes = await fetch(`${baseUrl}/query`, {
                 method: 'POST',
                 headers: {
                    'Api-Key': PINECONE_KEY,
                    'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({
                     vector: vector,
                     topK: queryTopK,
                     includeMetadata: true
                  })
             });
             
             if (pineconeRes.ok) {
                 const pcData = await pineconeRes.json();
                 if (pcData.matches && pcData.matches.length > 0) {
                     let matches = pcData.matches;
                     
                     if (courseCode || courseName) {
                         matches = matches.filter((m: any) => {
                             if (!m.metadata?.subject) return false;
                             const dbSubject = m.metadata.subject.toLowerCase();
                             let searchCode = (courseCode || '').toLowerCase();
                             searchCode = searchCode.replace('cont_', '');
                             const searchName = (courseName || '').toLowerCase();
                             
                             let isMatch = searchCode && dbSubject.includes(searchCode);
                             if (!isMatch && (searchCode === "25csh-211" || searchName.includes("database") || searchName.includes("dbms"))) {
                                 isMatch = dbSubject.includes("dbms");
                             }
                             return isMatch;
                         });
                     }

                     if (requestedFiles.length > 0) {
                         matches = matches.filter((m: any) => {
                             if (!m.metadata?.source) return false;
                             return requestedFiles.some(f => m.metadata.source.endsWith(f));
                         });
                     }
                     // Use top 15 relevant chunks as per Efficient Retrieval Strategy
                     matches = matches.slice(0, 15);
                     
                     const uniqueSources = [...new Set(matches.map((m: any) => m.metadata?.source).filter(Boolean).map((s: string) => s.split('/').pop()))] as string[];
                     ragContext = "\n\nFILES DETECTED IN KNOWLEDGE BASE:\n" + uniqueSources.map((s, i) => `${i+1}. ${s}`).join('\n') + 
                                  "\n\nEXACT EXTRACTS FROM THE ADMIN'S SYLLABUS PPTs:\n" +
                                  matches.map((m: any) => `[Source: ${m.metadata.source}]\n${m.metadata.text}`).join('\n---\n');
                 }
             }
          }
       } catch (e) {
          console.error("[aiManager] RAG Query failed:", e);
       }
    }
    
    const TOKEN_SAVER_SKILL = "[TOKEN SAVING MODE]: Please provide direct, concise answers without any pleasantries, conversational filler, or verbose explanations. Prioritize brevity to minimize token usage while answering the core question.";
    const systemContext = TOKEN_SAVER_SKILL + `\n\nSYLLABUS CONTEXT FOR THIS SPECIFIC COURSE (${courseName || 'Unknown'}):\n---\n${syllabusText || 'No syllabus provided.'}\n${ragContext}\n---`;
    
    const isGemini = personalKey.startsWith('AIza');
    const isClaude = personalKey.startsWith('sk-ant-');
    const isGroq = personalKey.startsWith('gsk_');
    const isNvidia = personalKey.startsWith('nvapi-');
    const isOpenAI = personalKey.startsWith('sk-') && !isClaude;

    let aiResponseText = "Sorry, no response generated.";

    try {
        if (isGemini) {
           const client = new GoogleGenAI({ apiKey: personalKey });
           const contents = [
              { role: 'user', parts: [{ text: systemContext }] },
              { role: 'model', parts: [{ text: "Understood. I will strictly follow your instructions and act as their helpful AI tutor for this course, using the exact extracts from the syllabus." }] },
              ...messages
           ];
           const response = await client.models.generateContent({
             model: 'gemini-1.5-flash',
             contents: contents
           });
           aiResponseText = response.text || aiResponseText;
        } else if (isClaude) {
           const anthropicMessages = messages.map(m => ({
              role: m.role === 'model' ? 'assistant' : 'user',
              content: m.parts[0].text
           }));
           const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'x-api-key': personalKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
              body: JSON.stringify({
                 model: 'claude-3-5-sonnet-20241022',
                 max_tokens: 2048,
                 system: systemContext + "\nUnderstood. I will strictly follow your instructions and act as their helpful AI tutor for this course, using the exact extracts from the syllabus.",
                 messages: anthropicMessages
              })
           });
           const data = await res.json();
           if (data.content && data.content.length > 0) aiResponseText = data.content[0].text;
           else console.error("Claude error:", data);
        } else if (isOpenAI || isGroq || isNvidia) {
           const openAIMessages = [
              { role: 'system', content: systemContext + "\nUnderstood. I will strictly follow your instructions and act as their helpful AI tutor for this course, using the exact extracts from the syllabus." },
              ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.parts[0].text }))
           ];
           
           let endpoint = 'https://api.openai.com/v1/chat/completions';
           let model = 'gpt-4o-mini';
           
           if (isGroq) {
               endpoint = 'https://api.groq.com/openai/v1/chat/completions';
               model = 'llama-3.3-70b-versatile';
           } else if (isNvidia) {
               endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
               model = 'meta/llama-3.1-70b-instruct';
           }

           const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${personalKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                 model: model,
                 messages: openAIMessages
              })
           });
           
           if (!res.ok) {
              const errText = await res.text();
              console.error(`[aiManager] API Error ${res.status}:`, errText);
              aiResponseText = `Error from AI Provider (${res.status}): ${errText.substring(0, 100)}... Please check your API key.`;
           } else {
              const data = await res.json();
              if (data.choices && data.choices.length > 0) aiResponseText = data.choices[0].message.content;
              else console.error("OpenAI/Groq error:", data);
           }
        }
    } catch (e: any) {
        console.error("Multi-provider generation failed:", e);
        aiResponseText = `Network or Parse Error: ${e.message}`;
    }

    return aiResponseText + " 🟢";
  }

  // 2. NO PERSONAL KEY: USE CLOUDFLARE PROXY (Shared Pool)
  console.log("[aiManager] PROXY_URL is:", PROXY_URL);
  if (!PROXY_URL) {
      console.error("[aiManager] Error: NO_PROXY_URL");
      throw new Error("NO_PROXY_URL");
  }

  // Check Daily Limit for Shared Pool
  const today = new Date().toISOString().split('T')[0];
  const usageRaw = await AsyncStorage.getItem('ai_daily_usage');
  let usage = usageRaw ? JSON.parse(usageRaw) : { date: today, count: 0 };
  
  if (usage.date !== today) {
    usage = { date: today, count: 0 };
  }

  console.log("[aiManager] Daily usage:", usage.count);
  if (usage.count >= 100) {
    console.error("[aiManager] Error: DAILY_LIMIT_REACHED");
    throw new Error('DAILY_LIMIT_REACHED');
  }

  try {
    const response = await fetch(PROXY_URL, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
          messages,
          syllabusText,
          courseName,
          courseCode,
          userLearningProfile
       })
    });

    console.log("[aiManager] Proxy response status:", response.status);
    const data = await response.json();
    console.log("[aiManager] Proxy response data:", data);

    if (!response.ok) {
       console.error("[aiManager] Proxy returned not OK:", data);
       if (data.error === 'NO_POOL_KEYS') throw new Error('NO_POOL_KEYS');
       throw new Error('PROXY_ERROR');
    }

    // Increment usage count on success
    usage.count += 1;
    await AsyncStorage.setItem('ai_daily_usage', JSON.stringify(usage));
    
    return validateAndSanitizeOutput(data.text);
  } catch (error) {
    console.error("[aiManager] Final Catch:", error);
    throw error;
  }
}

// Extra Practical Layer: Output Scanning
function validateAndSanitizeOutput(text: string): string {
  let finalResponse = text || "I'm sorry, I couldn't generate a response.";
  
  // Output scanning: check if there's a big code block violating the 2-3 line rule
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = finalResponse.match(codeBlockRegex);
  if (matches) {
     for (const match of matches) {
        const lines = match.split('\n').length;
        // Allowing ~7 lines total (``` language \n code \n code \n code \n ```)
        if (lines > 8) {
           finalResponse = "⚠️ **Security Flag:** The AI attempted to generate a large functional code block, which is restricted in StudyOS. As an academic tutor, I can only explain theoretical concepts or show tiny pseudocode snippets. Please refine your question to focus on the concepts rather than implementation.";
           break;
        }
     }
  }
  
  return finalResponse;
}

export async function reflectAndLearn(messages: any[], currentProfile: string): Promise<string | null> {
    const personalKey = await AsyncStorage.getItem('gemini_api_key');
    const reflectSystemPrompt = `You are a learning pattern analyzer.
Analyze the provided chat history between a student and an AI Tutor.
Extract the student's implicit learning preferences (e.g., likes real-world examples, prefers short answers, uses Hindi/Hinglish, struggles with math).
Output a concise bulleted list of these preferences.
If the student explicitly states a preference, prioritize it.
Combine these with any existing preferences provided in the history.
Do NOT output anything else except the bulleted list.`;

    const formattedMessages = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));

    if (currentProfile) {
        formattedMessages.unshift({ role: 'user', parts: [{ text: `Here is the current learning profile, combine any new findings with this: ${currentProfile}` }] });
    }

    if (personalKey && personalKey.trim().length > 10) {
        try {
            const client = new GoogleGenAI({ apiKey: personalKey });
            const contents = [
               { role: 'user', parts: [{ text: reflectSystemPrompt }] },
               { role: 'model', parts: [{ text: "Understood." }] },
               ...formattedMessages
            ];
            const response = await client.models.generateContent({
               model: 'gemini-1.5-flash',
               contents: contents
            });
            return response.text || null;
        } catch(e) {
            console.error("[aiManager] Personal Key Reflect error", e);
            return null;
        }
    }

    const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
    if (!PROXY_URL) return null;
    try {
        const response = await fetch(PROXY_URL, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
              action: 'reflect',
              messages: formattedMessages
           })
        });
        const data = await response.json();
        return data.text || null;
    } catch(e) {
        console.error("[aiManager] Proxy Reflect error", e);
        return null;
    }
}
