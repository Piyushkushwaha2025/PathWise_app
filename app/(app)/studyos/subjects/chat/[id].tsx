import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { GoogleGenAI } from '@google/genai';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../../../store/useThemeStore';
import { CenterPopModal } from '../../../../../components/ui/CenterPopModal';
import Markdown from 'react-native-markdown-display';
import { generateAiResponse, reflectAndLearn } from '../../../../../lib/aiManager';
import { useAuth } from '@clerk/clerk-expo';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

const sortFilesByTopicNumbers = (files: string[]) => {
  if (!files || !Array.isArray(files)) return [];
  return [...files].filter(Boolean).sort((a, b) => {
    if (!a || !b) return 0;
    // Extract leading numbers like 1.1.1, 1.2, 2.0 etc.
    const regex = /(?:^|\s)(\d+(?:\.\d+)*)/;
    const matchA = a.match(regex);
    const matchB = b.match(regex);

    if (matchA && matchB) {
      const partsA = matchA[1].split('.').map(Number);
      const partsB = matchB[1].split('.').map(Number);
      
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA !== numB) {
          return numA - numB;
        }
      }
    }
    return a.localeCompare(b);
  });
};

const renderUserMessage = (text: string) => {
    const instructionMarker = '\n\n[USER INSTRUCTION: ONLY focus your answer strictly on the following files: ';
    const instructionIndex = text.indexOf(instructionMarker);
    if (instructionIndex === -1) {
        return { displayText: text, hiddenFiles: [] };
    }
    
    const displayText = text.substring(0, instructionIndex);
    const afterMarker = text.substring(instructionIndex + instructionMarker.length);
    const endMarkerIndex = afterMarker.indexOf('. Do not use general knowledge unless asked.]');
    
    let hiddenFiles: string[] = [];
    if (endMarkerIndex !== -1) {
        const filesString = afterMarker.substring(0, endMarkerIndex);
        hiddenFiles = filesString.split('|||');
    }
    
    return { displayText, hiddenFiles };
};

export default function AITutorChatScreen() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);
  const { userId } = useAuth();

  const isAccessGranted = true;

  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [syllabusScraped, setSyllabusScraped] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [scrapingError, setScrapingError] = useState('');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // File Selection State
  const [showFileModal, setShowFileModal] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<Record<string, string[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Create a strictly unique storage key using both ID and Subject Name 
  // to ensure chats never mix even if course ID fails to parse.
  const STORAGE_KEY = `@chat_history_${id}_${name?.toString().replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  useEffect(() => {
    setSessions([]);
    setCurrentSessionId(null);
    loadApiKey();
    loadSessions();
    fetchAvailableFiles();
  }, [id, name]);

  const fetchAvailableFiles = async () => {
    setIsLoadingFiles(true);
    setFetchError(null);
    try {
       const res = await fetch('https://studyos-ai-proxy.piyushkushwaha2520.workers.dev', {
          method: 'POST',
          headers: { 
             'Content-Type': 'application/json',
             'Cache-Control': 'no-cache, no-store, must-revalidate',
             'Pragma': 'no-cache',
             'Expires': '0'
          },
          body: JSON.stringify({ action: 'list-files', courseCode: id?.toString() || '', _t: Date.now() })
       });
       
       if (!res.ok) {
          throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
       }
       
       const textData = await res.text();
       let data;
       try {
           data = JSON.parse(textData);
       } catch(err) {
           throw new Error(`JSON Parse Error: ${textData.substring(0, 50)}...`);
       }

       if (data.success && data.data) {
          const valuesArray = Object.values(data.data) as string[][];
          let allFiles: string[] = [];
          valuesArray.forEach(arr => {
             if (Array.isArray(arr)) allFiles = allFiles.concat(arr);
          });
          const uniqueFiles = [...new Set(allFiles)].filter(Boolean);
          const groupedByUnit: Record<string, string[]> = {
             "Unit 1": [], "Unit 2": [], "Unit 3": [], "Unit 4": [], "Unit 5": [], "Other Files": []
          };
          
          uniqueFiles.forEach(file => {
             if (!file) return;
             // Look for patterns like "1.1", "topic 1.1", "2.1.4"
             const match = file.match(/(?:topic\s*|-|^|\s|\b)([1-5])\.\d/i);
             if (match) {
                 groupedByUnit[`Unit ${match[1]}`].push(file);
             } else {
                 groupedByUnit["Other Files"].push(file);
             }
          });
          
          setAvailableFiles(groupedByUnit);
       } else {
          setFetchError(data.error || "Unknown API Error");
       }
    } catch (e) {
       console.error("Failed to fetch available files:", e);
       setFetchError(String(e));
    }
    setIsLoadingFiles(false);
  };

  const loadSessions = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: ChatSession[] = JSON.parse(stored);
        if (parsed.length > 0) {
          parsed.sort((a, b) => b.updatedAt - a.updatedAt);
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
          return;
        }
      }
      createNewSession(true);
    } catch (e) {
      console.error(e);
      createNewSession(true);
    }
  };

  const createNewSession = (clearExisting = false) => {
    setSessions(prev => {
      const currentSessions = clearExisting ? [] : prev;
      if (currentSessions.length >= 5) return currentSessions;
      
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: `Chat ${currentSessions.length + 1}`,
        messages: [{
          id: 'welcome',
          role: 'model',
          text: `Hello! I am your AI Tutor for **${name}**. I've read your entire syllabus and course materials. What would you like to learn today?`
        }],
        updatedAt: Date.now()
      };
      
      const updated = [newSession, ...currentSessions];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setCurrentSessionId(newSession.id);
      setShowHistoryModal(false);
      return updated;
    });
  };

  const loadApiKey = async () => {
    let key = await SecureStore.getItemAsync('gemini_api_key');
    if (!key) {
      const oldKey = await AsyncStorage.getItem('gemini_api_key');
      if (oldKey) {
        key = oldKey;
        await SecureStore.setItemAsync('gemini_api_key', oldKey);
        await AsyncStorage.removeItem('gemini_api_key');
      }
    }
    if (key) {
      setApiKey(key);
      setHasSavedKey(true);
      setIsEditingKey(false);
    } else {
      setHasSavedKey(false);
      setIsEditingKey(true);
    }
  };

  const saveApiKey = async () => {
    setKeyError('');
    const key = apiKey.trim().replace(/['"]/g, '');
    if (key.length <= 10) {
      setKeyError('Key must be at least 11 characters long.');
      return;
    }
    
    setIsValidatingKey(true);
    try {
      if (key.startsWith('AIza')) {
        // Gemini Validation
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) throw new Error('Invalid Gemini key');
      } else if (key.startsWith('sk-ant-')) {
        // Anthropic Validation (POST to /messages with max_tokens: 1 to ensure key is fully active)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'test' }] })
        });
        const data = await res.json();
        if (data.type === 'error') throw new Error(data.error.message);
      } else if (key.startsWith('gsk_')) {
        // Groq Validation
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!res.ok) throw new Error('Invalid Groq key');
      } else if (key.startsWith('sk-')) {
        // OpenAI Validation
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!res.ok) throw new Error('Invalid OpenAI key');
      } else if (key.startsWith('nvapi-')) {
        // Nvidia Validation
        const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'meta/llama-3.1-8b-instruct', max_tokens: 1, messages: [{ role: 'user', content: 'test' }] })
        });
        if (!res.ok) throw new Error('Invalid Nvidia key');
      } else {
        throw new Error('Unsupported key format. Must start with AIza, sk-ant-, sk-, gsk_, or nvapi-');
      }
      
      await SecureStore.setItemAsync('gemini_api_key', key);
      setHasSavedKey(true);
      setIsEditingKey(false);
      setShowSettings(false);
    } catch (e: any) {
      console.error("[API Key Validation Failed]:", e.message);
      setKeyError(e.message || 'It is not a valid key');
      setApiKey('');
    } finally {
      setIsValidatingKey(false);
    }
  };

  const removeApiKey = async () => {
    await SecureStore.deleteItemAsync('gemini_api_key');
    setApiKey('');
    setHasSavedKey(false);
    setIsEditingKey(true);
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  const clearAllChats = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setSessions([]);
      createNewSession(true);
      setShowClearConfirm(false);
      setClearSuccess(true);
      setTimeout(() => {
        setClearSuccess(false);
        setShowSettings(false);
      }, 2000);
    } catch (e) {
      console.error(e);
      alert("Failed to delete chats.");
    }
  };

  const deleteSession = (sessionId: string) => {
    if (sessions.length <= 1) {
       clearAllChats();
       return;
    }
    const updated = sessions.filter(s => s.id !== sessionId);
    setSessions(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (currentSessionId === sessionId) {
       setCurrentSessionId(updated[0].id);
    }
  };

  const handleMessage = (event: any) => {
     // WebView removed, so no-op here if ever called
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !currentSessionId) return;

    let currentText = inputText.trim();
    if (selectedFiles.length > 0) {
       currentText += `\n\n[USER INSTRUCTION: ONLY focus your answer strictly on the following files: ${selectedFiles.join('|||')}. Do not use general knowledge unless asked.]`;
    }

    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', text: currentText };
    setInputText('');
    setIsTyping(true);
    setSelectedFiles([]);
    
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    // Save user msg to state & local storage
    setSessions(prevSessions => {
      const updated = prevSessions.map(s => {
         if (s.id === currentSessionId) {
            let newTitle = s.title;
            // Auto rename title if it's the first message
            if (s.messages.length === 1 && currentText.length > 3) {
               newTitle = currentText.substring(0, 20) + (currentText.length > 20 ? '...' : '');
            }
            return { ...s, messages: [...s.messages, newUserMsg], updatedAt: Date.now(), title: newTitle };
         }
         return s;
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    try {
      const activeSession = sessions.find(s => s.id === currentSessionId);
      const history = (activeSession?.messages.slice(1) || []).map(msg => ({
         role: msg.role === 'user' ? 'user' : 'model',
         parts: [{ text: msg.text }]
      }));
      history.push({ role: 'user', parts: [{ text: newUserMsg.text }] });

      const learningProfile = await AsyncStorage.getItem('ai_learning_profile') || undefined;
      const aiText = await generateAiResponse(history, syllabusText, name as string, id as string, learningProfile);

      // Trigger self-learning in the background
      if (!apiKey) {
         const fullHistory = [...history, { role: 'model' as const, parts: [{ text: aiText }] }];
         reflectAndLearn(fullHistory, learningProfile || "").then(newProfile => {
             if (newProfile && newProfile.length > 5) {
                 AsyncStorage.setItem('ai_learning_profile', newProfile);
             }
         });
      }

      // Save AI msg to state & local storage
      setSessions(prevSessions => {
        const updated = prevSessions.map(s => {
           if (s.id === currentSessionId) {
              return { ...s, messages: [...s.messages, { id: Date.now().toString() + 'ai', role: 'model' as const, text: aiText }], updatedAt: Date.now() };
           }
           return s;
        });
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      let errMsg = "Failed to get a response. Please check your internet connection.";
      
      if (error.message?.includes('DAILY_LIMIT_REACHED')) {
         errMsg = "You have reached your free daily limit for the shared AI pool. Please wait until tomorrow, or tap the Settings gear icon at the top right to enter your own free Gemini API Key for unlimited access!";
      } else if (error.message?.includes('NO_POOL_KEYS') || error.message?.includes('PROXY_ERROR')) {
         errMsg = "The shared AI servers are currently busy or unavailable. Please tap the Settings gear icon at the top right to enter your own free Gemini API Key.";
         setShowSettings(true);
      } else if (error.message?.includes('NO_PROXY_URL')) {
         errMsg = "Backend proxy is not configured yet. Please enter your Personal API Key in settings.";
         setShowSettings(true);
      }
      
      setSessions(prevSessions => {
        const updated = prevSessions.map(s => {
           if (s.id === currentSessionId) {
              return { ...s, messages: [...s.messages, { id: Date.now().toString() + 'err', role: 'model' as const, text: errMsg }], updatedAt: Date.now() };
           }
           return s;
        });
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
    setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 },
    setupCard: { backgroundColor: colors.surface, padding: 24, borderRadius: 16, width: '100%', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
    title: { fontSize: 22, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 24, lineHeight: 20 },
    input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.text, fontFamily: 'Inter_400Regular', marginBottom: 16 },
    button: { backgroundColor: colors.primary, padding: 14, borderRadius: 8, alignItems: 'center' },
    buttonText: { color: 'white', fontFamily: 'Inter_600SemiBold', fontSize: 16 },
    
    chatContainer: { flex: 1 },
    messagesList: { padding: 16, paddingBottom: 32 },
    messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 16, marginBottom: 16 },
    userBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    aiBubble: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    userText: { color: 'white', fontFamily: 'Inter_400Regular', fontSize: 15 },
    
    inputArea: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'flex-end' },
    chatInput: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, minHeight: 40, maxHeight: 100, color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 15 },
    historyButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 8, alignSelf: 'flex-end' },
    sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginLeft: 8, alignSelf: 'flex-end' },
    sendButtonDisabled: { backgroundColor: colors.border },
    
    // Modal Mechanics styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '60%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold' },
    modalOption: { paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalOptionText: { color: '#d1d5db', fontSize: 15, fontFamily: 'Inter_500Medium' },
    modalOptionTextSelected: { color: colors.primary, fontFamily: 'Inter_700Bold' },
  });

  const markdownStyles = {
    body: { color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
    heading1: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, marginVertical: 8 },
    heading2: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: colors.text, marginVertical: 8 },
    heading3: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: colors.text, marginVertical: 8 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    code_inline: { backgroundColor: colors.background, fontFamily: 'JetBrainsMono_400Regular', color: colors.primary, padding: 4, borderRadius: 4 },
    code_block: { backgroundColor: colors.background, fontFamily: 'JetBrainsMono_400Regular', color: colors.text, padding: 12, borderRadius: 8, marginVertical: 8 },
    strong: { fontFamily: 'Inter_600SemiBold' },
    link: { color: colors.primary, textDecorationLine: 'underline' } as const
  };

  if (showSettings) {
    return (
      <View style={styles.setupContainer}>
        <Stack.Screen options={{ title: "AI Tutor Settings", headerShadowVisible: false, headerStyle: { backgroundColor: colors.background } }} />
        <View style={styles.setupCard}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="key" size={24} color={colors.primary} />
          </View>
          <Text style={styles.title}>Personal API Key</Text>
          <Text style={styles.subtitle}>Enter your own API Key (Gemini, Claude, OpenAI, or Groq) for unlimited, fast responses. Leave blank to use the shared pool.</Text>
          
          {hasSavedKey && !isEditingKey ? (
             <View style={{ width: '100%' }}>
                <View style={{ backgroundColor: colors.background, padding: 16, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="lock-closed" size={16} color={colors.success} style={{ marginRight: 8 }} />
                      <Text style={{ color: colors.text, fontFamily: 'JetBrainsMono_400Regular' }}>{apiKey.substring(0, 8)}••••••••••</Text>
                   </View>
                   <View style={{ backgroundColor: colors.success + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                      <Text style={{ color: colors.success, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>
                         {apiKey.startsWith('AIza') ? 'Gemini' : apiKey.startsWith('sk-ant-') ? 'Claude' : apiKey.startsWith('gsk_') ? 'Groq' : apiKey.startsWith('nvapi-') ? 'Nvidia' : apiKey.startsWith('sk-') ? 'OpenAI' : 'Valid'}
                      </Text>
                   </View>
                </View>
                <TouchableOpacity style={styles.button} onPress={() => setIsEditingKey(true)}>
                   <Text style={styles.buttonText}>Change API Key</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error, marginTop: 12 }]} onPress={removeApiKey}>
                   <Text style={[styles.buttonText, { color: colors.error }]}>Remove API Key</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 12 }]} onPress={() => setShowSettings(false)}>
                   <Text style={[styles.buttonText, { color: colors.text }]}>Back to Chat</Text>
                </TouchableOpacity>
             </View>
          ) : (
             <View style={{ width: '100%' }}>
                <TextInput 
                  style={[styles.input, keyError ? { borderColor: colors.error } : null]}
                  placeholder="Paste your API Key here (Gemini, Claude, etc)"
                  placeholderTextColor={colors.textMuted}
                  value={apiKey}
                  onChangeText={(txt) => { setApiKey(txt); setKeyError(''); }}
                  autoCapitalize="none"
                  secureTextEntry
                />
                
                {keyError ? <Text style={{ color: colors.error, fontSize: 13, marginTop: -8, marginBottom: 12, fontFamily: 'Inter_500Medium' }}>{keyError}</Text> : null}
                
                <TouchableOpacity style={[styles.button, isValidatingKey && { opacity: 0.7 }]} onPress={saveApiKey} disabled={isValidatingKey}>
                   {isValidatingKey ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Save Key</Text>}
                </TouchableOpacity>
                
                <TouchableOpacity style={[styles.button, { backgroundColor: 'transparent', marginTop: 12 }]} onPress={() => { setIsEditingKey(false); if(!hasSavedKey) setShowSettings(false); }}>
                   <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
             </View>
          )}
          
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error, marginTop: 16 }]} 
            onPress={() => setShowClearConfirm(true)}
          >
             <Text style={[styles.buttonText, { color: colors.error }]}>Delete All Chat History</Text>
          </TouchableOpacity>
        </View>

        {/* Confirmation Modal */}
        <CenterPopModal isVisible={showClearConfirm} onClose={() => setShowClearConfirm(false)}>
           <View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 16, alignItems: 'center' }}>
              <Ionicons name="warning" size={48} color={colors.error} style={{ marginBottom: 16 }} />
              <Text style={{ fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, marginBottom: 8, textAlign: 'center' }}>Delete Chat History?</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 24, textAlign: 'center' }}>Are you sure you want to permanently delete all chat history for this subject? This cannot be undone.</Text>
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                 <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.background, alignItems: 'center' }} onPress={() => setShowClearConfirm(false)}>
                    <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.error, alignItems: 'center' }} onPress={clearAllChats}>
                    <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Delete</Text>
                 </TouchableOpacity>
              </View>
           </View>
        </CenterPopModal>

        {/* Success Modal */}
        <CenterPopModal isVisible={clearSuccess} onClose={() => {}}>
           <View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 16, alignItems: 'center' }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                 <Ionicons name="checkmark" size={32} color={colors.success} />
              </View>
              <Text style={{ fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, textAlign: 'center' }}>Chats Deleted</Text>
           </View>
        </CenterPopModal>

      </View>
    );
  }

  // Removed WebView wait container

  const activeSession = sessions.find(s => s.id === currentSessionId);
  const activeMessages = activeSession ? activeSession.messages : [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ 
          title: "AI Tutor", 
          headerShadowVisible: false, 
          headerStyle: { backgroundColor: colors.background },
          headerRight: () => (
             <TouchableOpacity onPress={() => setShowSettings(true)}>
                <Ionicons name="settings-outline" size={22} color={colors.text} />
             </TouchableOpacity>
          )
      }} />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}>
        
        <ScrollView 
          style={styles.chatContainer} 
          contentContainerStyle={styles.messagesList}
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
           {activeMessages.map(msg => {
              const { displayText, hiddenFiles } = msg.role === 'user' ? renderUserMessage(msg.text) : { displayText: msg.text, hiddenFiles: [] };
              return (
              <View key={msg.id} style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                 {msg.role === 'user' ? (
                    <View>
                       <Text style={styles.userText}>{displayText}</Text>
                       {hiddenFiles.length > 0 && (
                          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' }}>
                             {hiddenFiles.map((f, i) => {
                                const match = f.match(/(?:topic\s*|-|^|\s|\b)(\d+(?:\.\d+)*)/i);
                                const displayName = match ? `Topic ${match[1]}` : (f.length > 25 ? f.substring(0, 25) + '...' : f);
                                return (
                                   <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                      <Ionicons name="document-text" size={14} color="rgba(255,255,255,0.8)" style={{ marginRight: 6 }} />
                                      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontFamily: 'Inter_500Medium' }}>{displayName}</Text>
                                   </View>
                                );
                             })}
                          </View>
                       )}
                    </View>
                 ) : (
                    <Markdown style={markdownStyles}>
                       {msg.text}
                    </Markdown>
                 )}
              </View>
           )})}
           {isTyping && (
             <View style={[styles.messageBubble, styles.aiBubble, { width: 80, alignItems: 'center' }]}>
               <ActivityIndicator size="small" color={colors.primary} />
             </View>
           )}
        </ScrollView>

        <View style={styles.inputArea}>
           <TouchableOpacity 
             style={[styles.historyButton, { marginRight: 8 }]} 
             onPress={() => setShowSettings(true)}
           >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
           </TouchableOpacity>

           <TouchableOpacity 
             style={[styles.historyButton, { marginRight: 8 }]} 
             onPress={() => setShowHistoryModal(true)}
           >
              <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
           </TouchableOpacity>

           <TouchableOpacity 
             style={[styles.historyButton, { marginRight: 8 }]} 
             onPress={() => {
                setShowFileModal(true);
                const totalFiles = Object.values(availableFiles).flat().length;
                if (totalFiles === 0 && !isLoadingFiles) {
                   fetchAvailableFiles();
                }
             }}
           >
              <View>
                 <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
                 {selectedFiles.length > 0 && (
                    <View style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.error || 'red', borderRadius: 10, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}>
                       <Text style={{ color: 'white', fontSize: 10, fontFamily: 'SpaceGrotesk_700Bold' }}>{selectedFiles.length}</Text>
                    </View>
                 )}
              </View>
           </TouchableOpacity>

           <View style={{ flex: 1 }}>
               <TextInput 
                  style={[styles.chatInput, { marginBottom: 0 }]}
                  placeholder="Ask about a topic..."
                  placeholderTextColor={colors.textMuted}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={1000}
               />
           </View>
           <TouchableOpacity 
             style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]} 
             onPress={sendMessage}
             disabled={!inputText.trim() || isTyping}
           >
              <Ionicons name="send" size={18} color="white" style={{ marginLeft: 4 }} />
           </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* File Selection Modal */}
      <Modal visible={showFileModal} animationType="slide" transparent={true} onRequestClose={() => setShowFileModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%', paddingBottom: 32 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                 Select Files (Loaded: {Object.values(availableFiles).reduce((acc, curr) => acc + curr.length, 0)})
              </Text>
              <TouchableOpacity onPress={() => setShowFileModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            {isLoadingFiles ? (
               <ActivityIndicator size="large" color={colors.primary} style={{ margin: 40 }} />
            ) : fetchError ? (
               <View style={{ padding: 20, alignItems: 'center' }}>
                 <Ionicons name="alert-circle-outline" size={48} color={colors.error || 'red'} />
                 <Text style={{ color: colors.error || 'red', textAlign: 'center', marginTop: 12, fontFamily: 'Inter_500Medium' }}>Error Loading Files</Text>
                 <Text style={{ color: colors.text, textAlign: 'center', marginTop: 8, fontSize: 12 }}>{fetchError}</Text>
               </View>
            ) : Object.keys(availableFiles).length === 0 ? (
               <Text style={{ color: colors.textDim, textAlign: 'center', margin: 20 }}>No files found in database.</Text>
            ) : (
               <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                 {Object.keys(availableFiles).sort().map(unit => {
                    const isExpanded = expandedUnits.includes(unit);
                    return (
                    <View key={unit} style={{ marginBottom: 12 }}>
                       <TouchableOpacity 
                          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                          onPress={() => setExpandedUnits(prev => isExpanded ? prev.filter(u => u !== unit) : [...prev, unit])}
                       >
                          <Text style={{ fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>{unit}</Text>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textDim} />
                       </TouchableOpacity>
                       
                       {isExpanded && (
                          <View style={{ paddingTop: 8, paddingLeft: 8 }}>
                             {sortFilesByTopicNumbers(availableFiles[unit]).map(file => {
                                const isSelected = selectedFiles.includes(file);
                                return (
                                   <TouchableOpacity 
                                      key={file} 
                                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: isSelected ? colors.primary + '20' : 'transparent', borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: isSelected ? colors.primary : 'transparent' }}
                                      onPress={() => {
                                         if (isSelected) {
                                            setSelectedFiles(prev => prev.filter(f => f !== file));
                                         } else {
                                            setSelectedFiles(prev => [...prev, file]);
                                         }
                                      }}
                                   >
                                      <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={20} color={isSelected ? colors.primary : colors.textDim} style={{ marginRight: 12 }} />
                                      <Text style={{ fontSize: 14, color: isSelected ? colors.primary : colors.text, flex: 1 }} numberOfLines={2}>{file}</Text>
                                   </TouchableOpacity>
                                );
                             })}
                          </View>
                       )}
                    </View>
                 )})}
               </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* History Modal */}
      <Modal visible={showHistoryModal} animationType="fade" transparent={true} onRequestClose={() => setShowHistoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chat History</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {sessions.map((s, index) => (
                 <View key={s.id} style={[styles.modalOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                   <TouchableOpacity 
                      style={{ flex: 1 }}
                      onPress={() => {
                         setCurrentSessionId(s.id);
                         setShowHistoryModal(false);
                         setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 100);
                      }}
                   >
                      <Text style={[styles.modalOptionText, currentSessionId === s.id && styles.modalOptionTextSelected]} numberOfLines={1}>
                         {s.title}
                      </Text>
                   </TouchableOpacity>
                   <TouchableOpacity onPress={() => deleteSession(s.id)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={20} color={colors.error || 'red'} />
                   </TouchableOpacity>
                 </View>
              ))}
              
              {sessions.length < 5 && (
                <TouchableOpacity 
                  style={[styles.modalOption, { borderBottomWidth: 0, marginTop: 8 }]} 
                  onPress={() => createNewSession()}
                >
                   <Text style={{ color: colors.primary, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>+ Create New Chat</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
