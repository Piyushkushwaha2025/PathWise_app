import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Animated, BackHandler, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

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
import { useSubscription } from '../../../../../hooks/useSubscription';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
    let displayText = text;
    let hiddenFiles: string[] = [];

    const topicFocusMarker = '\n\n[TOPIC FOCUS: ';
    const instructionMarker = '\n\n[USER INSTRUCTION: ONLY focus your answer strictly on the following files: ';

    let markerIndex = -1;
    let markerLength = 0;

    if (text.indexOf(topicFocusMarker) !== -1) {
        markerIndex = text.indexOf(topicFocusMarker);
        markerLength = topicFocusMarker.length;
    } else if (text.indexOf(instructionMarker) !== -1) {
        markerIndex = text.indexOf(instructionMarker);
        markerLength = instructionMarker.length;
    }

    if (markerIndex !== -1) {
        displayText = text.substring(0, markerIndex).trim();
        const afterMarker = text.substring(markerIndex + markerLength);
        const endBracketIndex = afterMarker.indexOf(']');
        const endDotIndex = afterMarker.indexOf('. Do not use general knowledge');
        
        let filesString = afterMarker;
        if (endBracketIndex !== -1 && (endDotIndex === -1 || endBracketIndex < endDotIndex)) {
            filesString = afterMarker.substring(0, endBracketIndex);
        } else if (endDotIndex !== -1) {
            filesString = afterMarker.substring(0, endDotIndex);
        }

        hiddenFiles = filesString.split('|||').map(f => f.trim()).filter(Boolean);
    }
    
    return { displayText, hiddenFiles };
};

export default function AITutorChatScreen() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const kbOffset = insets.top;

  const { isSubscriptionRequired } = useSubscription();
  const isAccessGranted = !isSubscriptionRequired;
  
  useEffect(() => {
    if (isSubscriptionRequired) {
      router.replace("/(app)/_pathwise_subscription");
    }
  }, [isSubscriptionRequired]);

  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  interface ConnectedModel {
    id: string;
    name: string;
    icon: string;
    key: string;
  }
  const [connectedModels, setConnectedModels] = useState<ConnectedModel[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('gemini');
  const [showModelSwitcherModal, setShowModelSwitcherModal] = useState(false);
  const [syllabusScraped, setSyllabusScraped] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [scrapingError, setScrapingError] = useState('');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(44);
  const animatedHeight = useRef(new Animated.Value(44)).current;
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: Math.max(44, inputHeight),
      duration: 100, // fast & smooth transition
      useNativeDriver: false,
    }).start();
  }, [inputHeight]);

  
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
       // Decode URL-encoded id and name
       const rawId = decodeURIComponent(id?.toString() || '');
       const rawName = decodeURIComponent(name?.toString() || '').toLowerCase();
       // Extract core code like 25CSH-214 from CONT_25CSH-214
       const coreCodeMatch = rawId.match(/([0-9]{2}[A-Z]{2,3}-[0-9]{3})/i);
       let courseCode = (coreCodeMatch ? coreCodeMatch[1] : rawId).toUpperCase();
       
       // Intelligent Subject Mappings to match Backend Index Names
       if (rawName.includes('database') || rawName.includes('dbms') || courseCode.includes('25CSH-211') || courseCode.includes('25CSH211')) {
          courseCode = 'DBMS';
       } else if (rawName.includes('data structure') || rawName.includes('dsa') || rawName.includes('algorithm') || courseCode.includes('25CSH-209') || courseCode.includes('25CSH209')) {
          courseCode = '25CSH-209';
       } else if (rawName.includes('architecture') || rawName.includes('organization') || rawName.includes('coa') || courseCode.includes('25CST-208') || courseCode.includes('25CST208')) {
          courseCode = '25CST-208';
       } else if (rawName.includes('python') || rawName.includes('gui') || courseCode.includes('25CSH-214') || courseCode.includes('25CSH214')) {
          courseCode = '25CSH-214';
       } else if (rawName.includes('discrete') || rawName.includes('mathematics') || courseCode.includes('25MTT-202') || courseCode.includes('25MTT202')) {
          courseCode = '25MTT-202';
       } else if (rawName.includes('environmental') || rawName.includes('evs') || rawName.includes('ecology') || courseCode.includes('25UCT-201') || courseCode.includes('25UCT201')) {
          courseCode = '25UCT-201';
       }
       
       const res = await fetch('https://studyos-ai-proxy.piyushkushwaha2520.workers.dev', {
          method: 'POST',
          headers: { 
             'Content-Type': 'application/json',
             'Cache-Control': 'no-cache, no-store, must-revalidate',
             'Pragma': 'no-cache',
             'Expires': '0'
          },
          body: JSON.stringify({ action: 'list-files', courseCode: courseCode, _t: Date.now() })
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
          // API already returns data grouped by unit keys like "25CSH-214 Unit 1"
          // Just use the data directly — don't re-group into hardcoded Unit 1..5 buckets
          const grouped: Record<string, string[]> = {};
          
          Object.entries(data.data as Record<string, string[]>).forEach(([unitKey, files]) => {
             if (!Array.isArray(files) || files.length === 0) return;
             // Clean up the key to show a nicer label e.g. "25CSH-214 Unit 1" -> "Unit 1"
             const cleanKey = unitKey.replace(/^[A-Z0-9_\-]+\s*/i, '').trim() || unitKey;
             const uniqueFiles = [...new Set(files)].filter(f => f && f !== 'System Overview');
             if (uniqueFiles.length > 0) {
                grouped[cleanKey] = uniqueFiles;
             }
          });
          
          setAvailableFiles(grouped);
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

  const getModelInfo = (key: string, overrideId?: string) => {
    if (key.startsWith('AIza') || key.startsWith('AQ.')) return { id: 'gemini', name: 'Gemini Flash', icon: '⚡', key };
    if (key.startsWith('gsk_')) return { id: 'groq', name: 'Groq Llama 3.3', icon: '🔥', key };
    if (key.startsWith('sk-ant-')) return { id: 'claude', name: 'Claude 3.5 Sonnet', icon: '🧠', key };
    if (key.startsWith('sk-or-')) return { id: 'openrouter', name: 'Hermes 3 (Free)', icon: '🚀', key };
    if (key.startsWith('nvapi-')) return { id: 'nvidia', name: 'Nvidia Llama', icon: '💻', key };
    return { id: overrideId || 'openai', name: 'OpenAI GPT-4o', icon: '🤖', key };
  };

  const loadApiKey = async () => {
    const geminiKey = await SecureStore.getItemAsync('byok_key_gemini') || await SecureStore.getItemAsync('gemini_api_key') || await AsyncStorage.getItem('gemini_api_key');
    const groqKey = await SecureStore.getItemAsync('byok_key_groq');
    const claudeKey = await SecureStore.getItemAsync('byok_key_claude');
    const openRouterKey = await SecureStore.getItemAsync('byok_key_openrouter');
    const openAiKey = await SecureStore.getItemAsync('byok_key_openai');
    const nvidiaKey = await SecureStore.getItemAsync('byok_key_nvidia');

    const loadedModels: ConnectedModel[] = [];
    if (geminiKey && geminiKey.length > 10) {
       const info = getModelInfo(geminiKey, 'gemini');
       if (!loadedModels.some(m => m.id === info.id)) loadedModels.push(info);
    }
    if (groqKey && groqKey.length > 10) {
       const info = getModelInfo(groqKey, 'groq');
       if (!loadedModels.some(m => m.id === info.id)) loadedModels.push(info);
    }
    if (claudeKey && claudeKey.length > 10) {
       const info = getModelInfo(claudeKey, 'claude');
       if (!loadedModels.some(m => m.id === info.id)) loadedModels.push(info);
    }
    if (openRouterKey && openRouterKey.length > 10) {
       const info = getModelInfo(openRouterKey, 'openrouter');
       if (!loadedModels.some(m => m.id === info.id)) loadedModels.push(info);
    }
    if (openAiKey && openAiKey.length > 10) {
       const info = getModelInfo(openAiKey, 'openai');
       if (!loadedModels.some(m => m.id === info.id)) loadedModels.push(info);
    }
    if (nvidiaKey && nvidiaKey.length > 10) {
       const info = getModelInfo(nvidiaKey, 'nvidia');
       if (!loadedModels.some(m => m.id === info.id)) loadedModels.push(info);
    }

    setConnectedModels(loadedModels);

    if (loadedModels.length > 0) {
       setHasSavedKey(true);
       setIsEditingKey(false);
       const savedActive = await AsyncStorage.getItem('active_byok_provider');
       const activeM = loadedModels.find(m => m.id === savedActive) || loadedModels[0];
       setActiveProvider(activeM.id);
       setApiKey(activeM.key);
    } else {
       setHasSavedKey(false);
       setIsEditingKey(true);
       setShowSettings(true);
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
      if (key.startsWith('AIza') || key.startsWith('AQ.')) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { headers: { 'X-goog-api-key': key } });
        if (!res.ok) throw new Error('Invalid Gemini key');
      } else if (key.startsWith('sk-ant-')) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'test' }] })
        });
        const data = await res.json();
        if (data.type === 'error') throw new Error(data.error.message);
      } else if (key.startsWith('gsk_')) {
        const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': `Bearer ${key}` } });
        if (!res.ok) throw new Error('Invalid Groq key');
      } else if (key.startsWith('sk-or-')) {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', { headers: { 'Authorization': `Bearer ${key}` } });
        if (!res.ok) throw new Error('Invalid OpenRouter / Hermes AI key');
      } else if (key.startsWith('sk-')) {
        const res = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${key}` } });
        if (!res.ok) throw new Error('Invalid OpenAI key');
      } else if (key.startsWith('nvapi-')) {
        const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'meta/llama-3.1-8b-instruct', max_tokens: 1, messages: [{ role: 'user', content: 'test' }] })
        });
        if (!res.ok) throw new Error('Invalid Nvidia key');
      } else {
        throw new Error('Unsupported key format. Must start with sk-or-, AIza, sk-ant-, sk-, gsk_, or nvapi-');
      }
      
      const info = getModelInfo(key);
      if (info.id === 'gemini') {
         await SecureStore.setItemAsync('byok_key_gemini', key);
         await SecureStore.setItemAsync('gemini_api_key', key);
      } else if (info.id === 'groq') {
         await SecureStore.setItemAsync('byok_key_groq', key);
      } else if (info.id === 'claude') {
         await SecureStore.setItemAsync('byok_key_claude', key);
      } else if (info.id === 'openrouter') {
         await SecureStore.setItemAsync('byok_key_openrouter', key);
      } else if (info.id === 'nvidia') {
         await SecureStore.setItemAsync('byok_key_nvidia', key);
      } else {
         await SecureStore.setItemAsync('byok_key_openai', key);
      }

      await AsyncStorage.setItem('active_byok_provider', info.id);
      await loadApiKey();
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
    if (activeProvider === 'gemini') {
       await SecureStore.deleteItemAsync('byok_key_gemini');
       await SecureStore.deleteItemAsync('gemini_api_key');
       await AsyncStorage.removeItem('gemini_api_key');
    } else if (activeProvider === 'groq') {
       await SecureStore.deleteItemAsync('byok_key_groq');
    } else if (activeProvider === 'claude') {
       await SecureStore.deleteItemAsync('byok_key_claude');
    } else if (activeProvider === 'openrouter') {
       await SecureStore.deleteItemAsync('byok_key_openrouter');
    } else if (activeProvider === 'openai') {
       await SecureStore.deleteItemAsync('byok_key_openai');
    } else if (activeProvider === 'nvidia') {
       await SecureStore.deleteItemAsync('byok_key_nvidia');
    }
    await loadApiKey();
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSettings) {
        if (!hasSavedKey) {
          router.navigate('/(app)/studyos' as any);
          return true;
        }
        setShowSettings(false);
        return true;
      }
      if (showHistoryModal || showFileModal || showClearConfirm || showModelSwitcherModal) {
        setShowHistoryModal(false);
        setShowFileModal(false);
        setShowClearConfirm(false);
        setShowModelSwitcherModal(false);
        return true;
      }
      router.navigate('/(app)/studyos' as any);
      return true;
    });
    return () => sub.remove();
  }, [showSettings, showHistoryModal, showFileModal, showClearConfirm, showModelSwitcherModal, router]);

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
       currentText += `\n\n[TOPIC FOCUS: ${selectedFiles.join('|||')}]. Please explain this subject comprehensively using the course syllabus and educational concepts. Even if specific extracts are not attached, provide a complete, exam-focused professor explanation of this topic.`;
    }

    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', text: currentText };
    setInputText('');
    setInputHeight(44);
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
      const aiText = await generateAiResponse(history, syllabusText, name as string, id as string, learningProfile, activeProvider);

      // Trigger self-learning in the background
      if (apiKey) {
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
      
      if (error.message?.includes('DAILY_LIMIT_REACHED') || error.message?.includes('NO_PERSONAL_KEY')) {
         errMsg = "To chat with your AI Tutor without limits, please save your free personal API Key!";
         setShowSettings(true);
      } else if (error.message?.includes('NO_POOL_KEYS') || error.message?.includes('PROXY_ERROR') || error.message?.includes('NO_PROXY_URL')) {
         errMsg = "Please tap the Settings gear icon at the top right to enter your own free API Key.";
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

  const styles = useMemo(() => StyleSheet.create({
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
    chatInput: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 15, textAlignVertical: 'top', lineHeight: 20 },
    historyButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 8, alignSelf: 'flex-end' },
    sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginLeft: 8, alignSelf: 'flex-end' },
    sendButtonDisabled: { backgroundColor: colors.border },
    
    // Modal Mechanics styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: (insets.bottom || 20) + 70, maxHeight: '75%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold' },
    modalOption: { paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalOptionText: { color: '#d1d5db', fontSize: 15, fontFamily: 'Inter_500Medium' },
    modalOptionTextSelected: { color: colors.primary, fontFamily: 'Inter_700Bold' },
  }), [colors]);

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
          <Text style={styles.title}>Setup AI Tutor (BYOK)</Text>
          <Text style={styles.subtitle}>To get unlimited daily tutoring without server rate limits, paste your free personal API Key below.</Text>
          
          {(!hasSavedKey || isEditingKey) && (
              <View style={{ width: '100%', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: colors.primary + '20', borderWidth: 1, borderColor: colors.primary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}
                  >
                    <Text style={{ color: colors.primary, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13 }}>⚡ Free Gemini Key</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: '#f59e0b20', borderWidth: 1, borderColor: '#f59e0b', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => Linking.openURL('https://console.groq.com/keys')}
                  >
                    <Text style={{ color: '#f59e0b', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13 }}>🔥 Free Groq Key</Text>
                  </TouchableOpacity>
                </View>
              </View>
          )}
          
          {hasSavedKey && !isEditingKey ? (
             <View style={{ width: '100%' }}>
                <View style={{ backgroundColor: colors.background, padding: 16, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="lock-closed" size={16} color={colors.success} style={{ marginRight: 8 }} />
                      <Text style={{ color: colors.text, fontFamily: 'JetBrainsMono_400Regular' }}>{(apiKey || '').substring(0, 8)}••••••••••</Text>
                   </View>
                   <View style={{ backgroundColor: colors.success + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                      <Text style={{ color: colors.success, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>
                         {(apiKey || '').startsWith('AIza') || (apiKey || '').startsWith('AQ.') ? 'Gemini Flash' : (apiKey || '').startsWith('sk-ant-') ? 'Claude 3.5' : (apiKey || '').startsWith('gsk_') ? 'Groq Llama 3.3' : (apiKey || '').startsWith('nvapi-') ? 'Nvidia' : (apiKey || '').startsWith('sk-or-') ? 'Hermes 3 (Free)' : (apiKey || '').startsWith('sk-') ? 'OpenAI GPT-4o' : 'Valid Key'}
                      </Text>
                   </View>
                </View>

                <TouchableOpacity style={[styles.button, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setIsEditingKey(true)}>
                   <Text style={[styles.buttonText, { color: colors.text }]}>Change API Key</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error, marginTop: 12 }]} onPress={removeApiKey}>
                   <Text style={[styles.buttonText, { color: colors.error }]}>Remove API Key</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: colors.primary, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} 
                  onPress={() => { setShowSettings(false); setShowHistoryModal(true); }}
                >
                   <Ionicons name="chatbubbles-outline" size={18} color="white" />
                   <Text style={styles.buttonText}>Chat History</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, { backgroundColor: 'transparent', marginTop: 12 }]} onPress={() => setShowSettings(false)}>
                   <Text style={[styles.buttonText, { color: colors.textDim }]}>Back to Chat</Text>
                </TouchableOpacity>
             </View>
          ) : (
             <View style={{ width: '100%' }}>
                <TextInput 
                  style={[styles.input, keyError ? { borderColor: colors.error } : null]}
                  placeholder="Paste sk-or-... (Free Hermes AI), Gemini, Groq..."
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
                
                <TouchableOpacity style={[styles.button, { backgroundColor: 'transparent', marginTop: 12 }]} onPress={() => { 
                   if (!hasSavedKey || connectedModels.length === 0) {
                      router.navigate('/(app)/studyos' as any);
                   } else {
                      const activeM = connectedModels.find(m => m.id === activeProvider) || connectedModels[0];
                      if (activeM) setApiKey(activeM.key);
                      setIsEditingKey(false);
                      setShowSettings(false);
                   }
                }}>
                   <Text style={[styles.buttonText, { color: colors.text }]}>{!hasSavedKey ? 'Exit to Dashboard' : 'Cancel'}</Text>
                </TouchableOpacity>
             </View>
          )}
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
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={kbOffset}>
        
        {/* Clean Fixed Top Controls Bar (No Tile, No Text Overlap) */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          paddingHorizontal: 16, 
          paddingVertical: 10, 
          backgroundColor: colors.background,
          zIndex: 10
        }}>
          {/* Left: Back to LMS */}
          <TouchableOpacity
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface + '80', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => router.navigate('/(app)/studyos' as any)}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          {/* Right: Active Model Selector & Settings */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {hasSavedKey && (
              <TouchableOpacity 
                style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colors.primary + '40', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => setShowModelSwitcherModal(true)}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {connectedModels.find(m => m.id === activeProvider)?.icon || '⚡'} {connectedModels.find(m => m.id === activeProvider)?.name || 'BYOK Model'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.primary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface + '80', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

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
                                const displayName = f.trim().split('/').pop() || f;
                                return (
                                   <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                      <Ionicons name="document-attach" size={15} color="rgba(255,255,255,0.9)" style={{ marginRight: 6 }} />
                                      <Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 }} numberOfLines={2}>{displayName}</Text>
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

            <AnimatedTextInput 
               style={[styles.chatInput, { height: animatedHeight }]}
               placeholder="Ask about a topic..."
               placeholderTextColor={colors.textMuted}
               value={inputText}
               onChangeText={setInputText}
               multiline={true}
               scrollEnabled={true}
               textAlignVertical="top"
               maxLength={1000}
               onContentSizeChange={(e) => {
                 if (!inputText) return;
                 const h = e.nativeEvent.contentSize.height;
                 setInputHeight(Math.min(Math.max(h, 44), 104));
               }}
            />
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
                  style={[styles.modalOption, { borderBottomWidth: 0, marginTop: 12, paddingVertical: 14, backgroundColor: colors.primary + '15', borderRadius: 12, alignItems: 'center' }]} 
                  onPress={() => createNewSession()}
                >
                   <Text style={{ color: colors.primary, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' }}>+ Create New Chat</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Connected Models Switcher Modal */}
      <Modal visible={showModelSwitcherModal} animationType="fade" transparent={true} onRequestClose={() => setShowModelSwitcherModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ Connected AI Models</Text>
              <TouchableOpacity onPress={() => setShowModelSwitcherModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 16, fontFamily: 'Inter_400Regular' }}>
               Switch instantly between your connected BYOK AI models, or connect additional keys:
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
               {connectedModels.map((model) => (
                 <TouchableOpacity
                    key={model.id}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => {
                       setActiveProvider(model.id);
                       setApiKey(model.key);
                       AsyncStorage.setItem('active_byok_provider', model.id);
                       setShowModelSwitcherModal(false);
                    }}
                 >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                       <Text style={{ fontSize: 20 }}>{model.icon}</Text>
                       <View>
                          <Text style={{ color: activeProvider === model.id ? colors.primary : colors.text, fontSize: 16, fontFamily: activeProvider === model.id ? 'SpaceGrotesk_700Bold' : 'Inter_500Medium' }}>
                             {model.name}
                          </Text>
                          <Text style={{ color: colors.success, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 2, textTransform: 'uppercase' }}>
                             Active BYOK Key ({model.key.substring(0, 6)}•••)
                          </Text>
                       </View>
                    </View>
                    <Ionicons name={activeProvider === model.id ? "radio-button-on" : "radio-button-off"} size={22} color={activeProvider === model.id ? colors.primary : colors.textDim} />
                 </TouchableOpacity>
               ))}

               <TouchableOpacity 
                 style={{ marginTop: 20, paddingVertical: 14, backgroundColor: colors.primary + '15', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.primary + '40', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                 onPress={() => {
                    setShowModelSwitcherModal(false);
                    setTimeout(() => {
                       setIsEditingKey(true);
                       setApiKey('');
                       setKeyError('');
                       setShowSettings(true);
                    }, 300);
                 }}
               >
                 <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                 <Text style={{ color: colors.primary, fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold' }}>+ Connect Another AI Model</Text>
               </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}
