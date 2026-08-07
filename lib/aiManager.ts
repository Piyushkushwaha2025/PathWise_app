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
  userLearningProfile?: string,
  activeProvider?: string
): Promise<string> {
  // 1. Check active BYOK provider key or fallback to available connected key
  let personalKey: string | null = null;
  if (activeProvider === 'groq') {
      personalKey = await SecureStore.getItemAsync('byok_key_groq');
  } else if (activeProvider === 'openrouter') {
      personalKey = await SecureStore.getItemAsync('byok_key_openrouter');
  } else if (activeProvider === 'claude') {
      personalKey = await SecureStore.getItemAsync('byok_key_claude');
  } else if (activeProvider === 'openai') {
      personalKey = await SecureStore.getItemAsync('byok_key_openai');
  } else if (activeProvider === 'nvidia') {
      personalKey = await SecureStore.getItemAsync('byok_key_nvidia');
  } else if (activeProvider === 'gemini') {
      personalKey = await SecureStore.getItemAsync('byok_key_gemini') || await SecureStore.getItemAsync('gemini_api_key');
  }
  
  if (!personalKey) {
      personalKey = await SecureStore.getItemAsync('byok_key_gemini') ||
                    await SecureStore.getItemAsync('gemini_api_key') ||
                    await SecureStore.getItemAsync('byok_key_groq') ||
                    await SecureStore.getItemAsync('byok_key_openrouter') ||
                    await SecureStore.getItemAsync('byok_key_claude') ||
                    await SecureStore.getItemAsync('byok_key_openai') ||
                    await SecureStore.getItemAsync('byok_key_nvidia');
  }
  
  if (!personalKey || personalKey.trim().length <= 10) {
     throw new Error('NO_PERSONAL_KEY');
  }

  // USE PERSONAL KEY DIRECTLY (BYOK Mode)
    
    // RAG SYSTEM: Query Pinecone for relevant PPT knowledge
    let ragContext = "";
    const PINECONE_HOST = (process.env.EXPO_PUBLIC_PINECONE_HOST || '').replace(/['"]/g, '').trim();
    const PINECONE_KEY = (process.env.EXPO_PUBLIC_PINECONE_API_KEY || '').replace(/['"]/g, '').trim();
    
    if (PINECONE_HOST && PINECONE_KEY && messages.length > 0) {
       try {
          let lastMsg = messages[messages.length - 1].parts[0].text;
          
          let requestedFiles: string[] = [];
          const markers = ['[TOPIC FOCUS: ', '[USER INSTRUCTION: ONLY focus your answer strictly on the following files: '];
          for (const instructionMarker of markers) {
              const markerIdx = lastMsg.indexOf(instructionMarker);
              if (markerIdx !== -1) {
                  const afterMarker = lastMsg.substring(markerIdx + instructionMarker.length);
                  let endMarkerIdx = afterMarker.indexOf('].');
                  if (endMarkerIdx === -1) endMarkerIdx = afterMarker.indexOf('. ');
                  if (endMarkerIdx !== -1) {
                      const filesStr = afterMarker.substring(0, endMarkerIdx);
                      requestedFiles = filesStr.split(/\|\|\||, /).map((f: string) => f.trim()).filter(Boolean);
                  }
                  // Clean the prompt for embedding so it doesn't skew vector search
                  lastMsg = lastMsg.substring(0, markerIdx).trim();
                  break;
              }
          }

          let embedText = lastMsg || 'Explain the topic';
          if (requestedFiles.length > 0) {
              const cleanedFiles = requestedFiles.map((f: string) => f.replace(/\.(pptx|pdf|docx|txt)$/i, '').replace(/Topic \d+\.\d+(?:\.\d+)?\s*-\s*/i, '')).join(' ');
              embedText = `${embedText}. Context: ${cleanedFiles}`;
          }

          let vector: number[] = [];
          let embeddingKey: string | null = null;
          if (personalKey && (personalKey.startsWith('AIza') || personalKey.startsWith('AQ.'))) {
             embeddingKey = personalKey;
          } else {
             embeddingKey = await SecureStore.getItemAsync('byok_key_gemini') || await SecureStore.getItemAsync('gemini_api_key');
          }

          if (embeddingKey && (embeddingKey.startsWith('AIza') || embeddingKey.startsWith('AQ.'))) {
             try {
               const client = new GoogleGenAI({ apiKey: embeddingKey });
               let embedRes: any;
               try {
                   embedRes = await client.models.embedContent({
                      model: 'gemini-embedding-2',
                      contents: embedText
                   });
               } catch (fallbackErr) {
                   embedRes = await client.models.embedContent({
                      model: 'text-embedding-004',
                      contents: embedText
                   });
               }
               vector = embedRes?.embedding?.values?.slice(0, 768) || embedRes?.embeddings?.[0]?.values?.slice(0, 768) || [];
             } catch (embErr) {
               console.warn("[aiManager] Embedding failed gracefully:", embErr);
               vector = [];
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
                      
                      // 1. STRICT SUBJECT ISOLATION: First filter by current course code/name to prevent cross-subject contamination
                      if (courseCode || courseName) {
                          const subjectFiltered = matches.filter((m: any) => {
                              if (!m.metadata?.subject) return false;
                              const dbSubject = m.metadata.subject.toLowerCase();
                              let searchCode = (courseCode || '').toLowerCase().replace('cont_', '').trim();
                              const searchName = (courseName || '').toLowerCase().trim();
                              
                              let targetKey = searchCode;
                              if (searchName.includes('database') || searchName.includes('dbms') || searchCode.includes('25csh-211') || searchCode.includes('25csh211')) targetKey = 'dbms';
                              else if (searchName.includes('data structure') || searchName.includes('dsa') || searchName.includes('algorithm') || searchCode.includes('25csh-209') || searchCode.includes('25csh209')) targetKey = '25csh-209';
                              else if (searchName.includes('architecture') || searchName.includes('organization') || searchName.includes('coa') || searchCode.includes('25cst-208') || searchCode.includes('25cst208')) targetKey = '25cst-208';
                              else if (searchName.includes('python') || searchName.includes('gui') || searchCode.includes('25csh-214') || searchCode.includes('25csh214')) targetKey = '25csh-214';
                              else if (searchName.includes('discrete') || searchName.includes('mathematics') || searchCode.includes('25mtt-202') || searchCode.includes('25mtt202')) targetKey = '25mtt-202';
                              else if (searchName.includes('environmental') || searchName.includes('evs') || searchName.includes('ecology') || searchCode.includes('25uct-201') || searchCode.includes('25uct201')) targetKey = '25uct-201';

                              let isMatch = targetKey && dbSubject.includes(targetKey);
                              if (!isMatch && searchCode) isMatch = dbSubject.includes(searchCode);
                              if (!isMatch && searchName) {
                                  const nameWords = searchName.split(/\s+/).filter((w: string) => w.length >= 4);
                                  isMatch = nameWords.some((word: string) => dbSubject.includes(word));
                              }
                              return isMatch;
                          });
                          
                          if (subjectFiltered.length > 0) {
                              matches = subjectFiltered;
                          }
                      }
                      
                      // 2. FILE FILTERING WITHIN ISOLATED SUBJECT: Match against the user's selected PPTs
                      if (requestedFiles.length > 0) {
                          const fileFiltered = matches.filter((m: any) => {
                              if (!m.metadata?.source) return false;
                              const sourceLower = m.metadata.source.toLowerCase().replace(/\.(pptx|pdf|docx|txt|ppt)$/i, '').trim();
                              return requestedFiles.some(f => {
                                  const fClean = f.toLowerCase().replace(/\.(pptx|pdf|docx|txt|ppt)$/i, '').trim();
                                  if (!fClean) return false;
                                  return sourceLower === fClean || sourceLower.includes(fClean) || fClean.includes(sourceLower);
                              });
                          });
                          if (fileFiltered.length > 0) {
                              matches = fileFiltered;
                          }
                      }
                      
                      // Use top 20 relevant chunks from this subject as per Efficient Retrieval Strategy
                      matches = matches.slice(0, 20);
                     
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
    const systemContext = TOKEN_SAVER_SKILL + `\n\n[CRITICAL RULE]: You are strictly an AI Tutor for the subject "${courseName || courseCode || 'Selected Subject'}". NEVER discuss concepts or explain slides from unrelated subjects or other courses.\n\nSYLLABUS CONTEXT FOR THIS SPECIFIC COURSE (${courseName || 'Unknown'}):\n---\n${syllabusText || 'No syllabus provided.'}\n${ragContext}\n---`;
    
    const isGemini = personalKey && (personalKey.startsWith('AIza') || personalKey.startsWith('AQ.'));
    const isClaude = personalKey && personalKey.startsWith('sk-ant-');
    const isGroq = personalKey && personalKey.startsWith('gsk_');
    const isNvidia = personalKey && personalKey.startsWith('nvapi-');
    const isOpenRouter = personalKey && personalKey.startsWith('sk-or-');
    const isOpenAI = personalKey && (personalKey.startsWith('sk-') && !isClaude && !isOpenRouter);

    if (!personalKey || personalKey.trim().length < 10) {
        throw new Error("NO_PERSONAL_KEY");
    }

    let engineTag = "Gemini Flash Latest";
    if (isOpenRouter) engineTag = "Hermes 3 (Free)";
    else if (isGroq) engineTag = "Groq Llama 3.3";
    else if (isClaude) engineTag = "Claude 3.5 Sonnet";
    else if (isOpenAI) engineTag = "OpenAI GPT-4o-mini";
    else if (isNvidia) engineTag = "Nvidia Llama";

    let aiResponseText = "I'm sorry, I couldn't generate a response. Please try again.";

    try {
        if (isGemini) {
           const contents = [
              { role: 'user', parts: [{ text: systemContext }] },
              { role: 'model', parts: [{ text: "Understood. I will strictly follow your instructions and act as their helpful AI tutor for this course, using the exact extracts from the syllabus." }] },
              ...messages.map((m: any) => ({
                  role: m.role === 'model' ? 'model' : 'user',
                  parts: [{ text: m.parts[0].text }]
              }))
           ];
           const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${personalKey}`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', 'X-goog-api-key': personalKey },
               body: JSON.stringify({ contents }),
               signal: AbortSignal.timeout(25000)
           });
           const data = await response.json();
           if (!response.ok) {
               console.error("[aiManager] Gemini API Error:", data);
               throw new Error(data.error?.message || 'Gemini API Error');
           }
           aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || aiResponseText;
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
           else {
               console.error("Claude error:", data);
               throw new Error(data.error?.message || 'Claude API Error');
           }
        } else if (isOpenAI || isGroq || isNvidia || isOpenRouter) {
           const openAIMessages = [
              { role: 'system', content: systemContext + "\nUnderstood. I will strictly follow your instructions and act as their helpful AI tutor for this course, using the exact extracts from the syllabus." },
              ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.parts[0].text }))
           ];
           
           let endpoint = 'https://api.openai.com/v1/chat/completions';
           let model = 'gpt-4o-mini';
           let customHeaders: Record<string, string> = {};
           
           if (isOpenRouter) {
               endpoint = 'https://openrouter.ai/api/v1/chat/completions';
               model = 'nousresearch/hermes-3-llama-3.1-405b:free';
               customHeaders = {
                   'HTTP-Referer': 'https://studyos.app',
                   'X-Title': 'StudyOS AI Tutor'
               };
           } else if (isGroq) {
               endpoint = 'https://api.groq.com/openai/v1/chat/completions';
               model = 'llama-3.3-70b-versatile';
           } else if (isNvidia) {
               endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
               model = 'meta/llama-3.1-70b-instruct';
           }

           const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${personalKey}`, 'Content-Type': 'application/json', ...customHeaders },
              body: JSON.stringify({ model: model, messages: openAIMessages })
           });
           
           if (!res.ok) {
              const errText = await res.text();
              console.error(`[aiManager] API Error ${res.status}:`, errText);
              throw new Error(`AI Provider Error (${res.status})`);
           } else {
              const data = await res.json();
              if (data.choices && data.choices.length > 0) aiResponseText = data.choices[0].message.content;
              else console.error("OpenAI/Groq error:", data);
           }
        }
    } catch (e: any) {
        console.error("Multi-provider generation failed:", e);
        throw e;
    }

    return validateAndSanitizeOutput(aiResponseText);
}

// Output validation — just sanitize empty responses
function validateAndSanitizeOutput(text: string): string {
  return text || "I'm sorry, I couldn't generate a response. Please try again.";
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
