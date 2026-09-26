import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Animated, BackHandler, Linking, DeviceEventEmitter, FlatList, Image, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { GoogleGenAI } from '@google/genai';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore } from '../../../../../store/useThemeStore';
import { CenterPopModal } from '../../../../../components/ui/CenterPopModal';
import Markdown from 'react-native-markdown-display';
import { generateAiResponse, reflectAndLearn, getDailyAiUsage } from '../../../../../lib/aiManager';
import { useAuth } from '@clerk/clerk-expo';
import { useSubscription } from '../../../../../hooks/useSubscription';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { BlurView, BlurTargetView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { getNetworkState, reportNetworkError, reportNetworkSuccess, useNetworkStatus } from '../../../../../lib/networkManager';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageUri?: string;
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

const QuickChatOverlay = ({ colors, sessions, currentSessionId, blurTargetRef, isDoubtSolver }: any) => {
  const [visible, setVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('quickMenuVisible', (v) => setVisible(v));
    const sub2 = DeviceEventEmitter.addListener('quickMenuHover', (i) => setHoveredIndex(i));
    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'none' }}>
         {/* Pure Apple OS Frosted Glass Blur using BlurTargetView on SDK 56 */}
         <BlurView blurTarget={blurTargetRef} blurMethod="dimezisBlurView" intensity={15} style={StyleSheet.absoluteFill} tint={colors.text === '#f0f0f0' || colors.text === '#FFFFFF' ? 'dark' : 'light'} />
       
       <View style={{ position: 'absolute', top: 70, right: 54, width: 240, backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.3, shadowRadius: 20 }}>
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceHigh || '#f1f5f9' }}>
             <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, color: colors.text, fontSize: 14 }}>{isDoubtSolver ? "Switch Doubt" : "Switch Chat"}</Text>
             <Text style={{ fontFamily: 'Inter_400Regular', color: colors.textDim, fontSize: 11, marginTop: 2 }}>Slide down to select & release</Text>
          </View>
          {sessions.map((s: any, idx: number) => (
             <View key={s.id} style={{ height: 65, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: hoveredIndex === idx ? colors.primary + '20' : 'transparent', borderBottomWidth: idx < sessions.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ fontFamily: hoveredIndex === idx ? 'Inter_700Bold' : 'Inter_500Medium', color: hoveredIndex === idx ? colors.primary : colors.text, fontSize: 15 }} numberOfLines={1}>
                   {s.title}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', color: colors.textDim, fontSize: 12, marginTop: 2 }}>
                   {s.id === currentSessionId ? (isDoubtSolver ? 'Current Doubt' : 'Current Chat') : new Date(s.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </Text>
             </View>
          ))}
       </View>
    </View>
  );
};

export default function AITutorChatScreen() {
  const blurTargetRef = useRef<View>(null);
  const { id, name, mode, sessionId } = useLocalSearchParams();
  const isDoubtSolver = id === 'SNAP_SOLVE_DOUBTS' || mode === 'doubt_solver' || name?.toString().toLowerCase().includes('snap & solve');
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'black' || colors.text === '#f0f0f0' || colors.text === '#FFFFFF' || colors.background === '#050505';
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const kbOffset = insets.top;

  const { isSubscriptionRequired } = useSubscription();
  const netState = useNetworkStatus();
  const isAccessGranted = !isSubscriptionRequired;
  
  useEffect(() => {
    if (isSubscriptionRequired) {
      router.replace("/(app)/_pathwise_subscription");
    }
  }, [isSubscriptionRequired]);

  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isInitializingSettings, setIsInitializingSettings] = useState(true);
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
  const [dailyUsage, setDailyUsage] = useState<{ used: number; limit: number; remaining: number }>({ used: 0, limit: 50, remaining: 50 });
  const [showModelSwitcherModal, setShowModelSwitcherModal] = useState(false);
  const [syllabusScraped, setSyllabusScraped] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [scrapingError, setScrapingError] = useState('');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(44);
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<FlatList>(null);
  const shouldScrollToEndRef = useRef(false);

  
  // File Selection State
  const [showFileModal, setShowFileModal] = useState(false);
  const [showContextLimitModal, setShowContextLimitModal] = useState(false);

  // Photo Doubt Solving State
  const [attachedPhoto, setAttachedPhoto] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [showPhotoPickerModal, setShowPhotoPickerModal] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  const handleTakePhoto = async () => {
    setShowPhotoPickerModal(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Camera access is needed to photograph your doubts.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setAttachedPhoto({
          uri: asset.uri,
          base64: asset.base64 || '',
          mimeType: asset.mimeType || 'image/jpeg',
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("Take photo error:", e);
      Alert.alert("Error", "Could not take photo. Please try again.");
    }
  };

  const handleChooseFromGallery = async () => {
    setShowPhotoPickerModal(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Gallery access is needed to select doubt photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setAttachedPhoto({
          uri: asset.uri,
          base64: asset.base64 || '',
          mimeType: asset.mimeType || 'image/jpeg',
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("Pick image error:", e);
      Alert.alert("Error", "Could not pick image from gallery.");
    }
  };
  
  // Quick Chat Switcher Refs (State handled by standalone overlay to prevent full re-renders)
  const hoveredIndexRef = useRef(-1);
  const isQuickMenuVisible = useRef(false);
  const longPressTimer = useRef<any>(null);

  const updateHoveredIndex = (index: number) => {
     if (hoveredIndexRef.current !== index) {
        hoveredIndexRef.current = index;
        DeviceEventEmitter.emit('quickMenuHover', index);
        if (index !== -1) Haptics.selectionAsync();
     }
  };

  const [availableFiles, setAvailableFiles] = useState<Record<string, string[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Create a strictly unique storage key using both ID and Subject Name.
  // Dedicated isolated storage key for Snap & Solve AI vision doubts so they never mix with course chats.
  const STORAGE_KEY = isDoubtSolver 
    ? '@chat_history_SNAP_SOLVE_DOUBTS_ai_vision'
    : `@chat_history_${id}_${name?.toString().replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  useEffect(() => {
    setSessions([]);
    setCurrentSessionId(null);
    loadApiKey();
    loadSessions();
    fetchAvailableFiles();
    getDailyAiUsage().then(setDailyUsage).catch(() => {});
  }, [id, name, sessionId, mode]);

  useEffect(() => {
    if (isDoubtSolver) {
      const timer = setTimeout(() => {
        if (!attachedPhoto) {
          setShowPhotoPickerModal(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isDoubtSolver]);

  const fetchAvailableFiles = async () => {
    if (isDoubtSolver) {
      setIsLoadingFiles(false);
      return;
    }
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
       
       const textData = await res.text();
       let data: any = null;
       try {
           if (textData && !textData.trim().startsWith('<')) {
               data = JSON.parse(textData);
           }
       } catch {}

       if (!res.ok || !data) {
          throw new Error('Course materials temporarily unavailable.');
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

          // 1. Specific session requested via Start Chat picker
          if (sessionId) {
            const target = parsed.find(s => s.id === sessionId);
            if (target) {
              setCurrentSessionId(target.id);
              return;
            }
          }

          // 2. Start Fresh New Chat requested
          if (mode === 'new_chat') {
            createNewSession(false);
            return;
          }

          // 3. Default (mode === 'latest' or standard navigation): Open most recent active session
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
      
      const welcomeText = isDoubtSolver
        ? `👋 **Quirren Snap & Solve (AI Vision)**\n\nTake a photo or upload an image of any math problem, physics numerical, circuit diagram, or programming question to get an instant step-by-step solution with full explanations!`
        : `Hello! I am Quirren, your AI Tutor for **${name}**. I've read your entire syllabus and course materials. What would you like to learn today?`;

      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: isDoubtSolver ? `Doubt ${currentSessions.length + 1}` : `Chat ${currentSessions.length + 1}`,
        messages: [{
          id: 'welcome',
          role: 'model',
          text: welcomeText
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

    const savedActive = await AsyncStorage.getItem('active_byok_provider');

    if (loadedModels.length > 0) {
       setHasSavedKey(true);
       setIsEditingKey(false);
       if (savedActive === 'pool') {
          setActiveProvider('pool');
          setApiKey('');
       } else {
          const activeM = loadedModels.find(m => m.id === savedActive) || loadedModels[0];
          setActiveProvider(activeM.id);
          setApiKey(activeM.key);
       }
    } else {
       setHasSavedKey(false);
       setIsEditingKey(false);
       setActiveProvider('pool');
       setApiKey('');
       // Zero friction: Cloud Pool is ready out of the box!
       setShowSettings(false);
    }
    setIsInitializingSettings(false);
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
    await AsyncStorage.setItem('active_byok_provider', 'pool');
    await loadApiKey();
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSettings) {
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

  function getFriendlyErrorMessage(error: any): { message: string; showSettings?: boolean; showContextModal?: boolean } {
    const raw = String(error?.message || error || '');
    const isTimeout = error?.name === 'TimeoutError' || raw.includes('timeout') || raw.includes('aborted');
    const isNetFail = raw.includes('Network request failed') || raw.includes('Failed to fetch') || raw.includes('Network Error');

    if (isTimeout) {
      return {
        message: "⚠️ **Connection Timeout**\n\nThe AI server took too long to respond due to network latency. Please tap retry below."
      };
    }
    if (isNetFail) {
      return {
        message: "⚠️ **Network Connection Failed**\n\nUnable to reach PathWise AI servers. Please check your internet connection and tap retry."
      };
    }
    if (raw.includes('DAILY_LIMIT_REACHED')) {
      return {
        message: "⚠️ **Daily Limit Reached (50 msgs/day)**\n\nYou've used your 50 free PathWise AI queries for today. Limit resets tomorrow at midnight, or connect your free personal Gemini or Groq key in Settings for unlimited queries!",
        showSettings: true
      };
    }
    if (raw.includes('ALL_POOL_KEYS_EXHAUSTED') || raw.includes('NO_POOL_KEYS')) {
      return {
        message: "⚠️ **AI Pool High Traffic**\n\nAll shared AI servers are currently processing heavy student requests. Tap retry in a few moments, or connect your free Gemini/Groq key in Settings.",
        showSettings: true
      };
    }
    if (raw.includes('OVERLOADED') || raw.includes('503')) {
      return {
        message: "⚠️ **AI Service Overloaded**\n\nThe AI model is temporarily experiencing peak global demand. Please tap retry in 10-15 seconds."
      };
    }
    if (raw.includes('Rate Limit Exceeded') || raw.includes('429') || raw.includes('Quota exceeded') || raw.includes('RESOURCE_EXHAUSTED')) {
      return {
        message: "⚠️ **Rate Limit Reached**\n\nRate limit reached on this provider. Please wait a few moments and tap retry, or switch providers in Settings.",
        showSettings: true
      };
    }
    if (raw.includes('Payload Too Large') || raw.includes('413')) {
      return {
        message: "⚠️ **Input Too Large**\n\nThe question or attached photo is too large for memory. We've shortened recent history—please tap retry or ask a shorter question.",
        showContextModal: true
      };
    }
    if (raw.includes('must be a string') || raw.includes('does not support image')) {
      return {
        message: "⚠️ **Image Not Supported**\n\nThe selected provider model does not support image analysis. Please switch to PathWise AI (Cloud Pool) or Gemini in Settings to analyze photos.",
        showSettings: true
      };
    }
    if (raw.includes('<') || raw.includes('SyntaxError') || raw.includes('JSON Parse') || raw.includes('502') || raw.includes('504') || raw.includes('PROXY_ERROR')) {
      return {
        message: "⚠️ **Server Gateway Blip**\n\nThe connection was momentarily interrupted by the cloud gateway. Please tap retry to regenerate."
      };
    }
    if (raw.includes('AI Provider Error')) {
      return {
        message: "⚠️ **Provider Error**\n\nYour personal API key or model returned an error. Please verify your key in Settings or switch to the free Cloud Pool.",
        showSettings: true
      };
    }
    return {
      message: "⚠️ **Service Busy**\n\nPathWise AI could not generate a response right now. Please tap retry to try again."
    };
  }

  const executeAiRequest = async (currentText: string, imagePayload?: { base64: string; mimeType: string }) => {
    // Instant offline check: Don't hang or wait 35s when disconnected
    const currentNet = getNetworkState();
    if (!currentNet.isOnline) {
      const offlineMsg: Message = {
        id: Date.now().toString() + 'err',
        role: 'model',
        text: "⚠️ **No Internet Connection**\n\nYou are currently offline. Please reconnect to Wi-Fi or mobile data to chat with Quirren.",
      };
      setSessions(prevSessions => {
        const updated = prevSessions.map(s => {
          if (s.id === currentSessionId) {
            return { ...s, messages: [...s.messages, offlineMsg], updatedAt: Date.now() };
          }
          return s;
        });
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
      setIsTyping(false);
      return;
    }

    const reqStartTime = Date.now();
    try {
      const latestSession = sessions.find(s => s.id === currentSessionId) ||
                            JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) || '[]').find((s: ChatSession) => s.id === currentSessionId);
      
      // Filter out any error bubbles (ends with 'err' or starts with ⚠️)
      const validMessages = (latestSession?.messages.slice(1) || []).filter(
        (msg: Message) => !msg.id.endsWith('err') && msg.text && !msg.text.startsWith('⚠️')
      );
      // Sliding context window: last 10 messages max
      const slidingHistory = validMessages.slice(-10);
      const history = slidingHistory.map((msg: Message) => ({
         role: msg.role === 'user' ? 'user' : 'model',
         parts: [{ text: msg.text }]
      }));

      // Ensure the latest message is in the history if not already there
      const lastHistoryMsg = history[history.length - 1];
      if (!lastHistoryMsg || lastHistoryMsg.role !== 'user' || lastHistoryMsg.parts[0]?.text !== currentText) {
         history.push({ role: 'user', parts: [{ text: currentText }] });
      }

      const learningProfile = await AsyncStorage.getItem('ai_learning_profile') || undefined;

      const aiText = await generateAiResponse(
         history, 
         isDoubtSolver ? '' : syllabusText, 
         isDoubtSolver ? 'Snap & Solve (AI Vision)' : (name as string), 
         isDoubtSolver ? 'DOUBT_SOLVER' : (id as string), 
         learningProfile, 
         activeProvider,
         imagePayload
      );

      reportNetworkSuccess(Date.now() - reqStartTime);
      getDailyAiUsage().then(setDailyUsage).catch(() => {});

      // Trigger self-learning in the background (non-blocking)
      if (apiKey) {
         const fullHistory = [...history, { role: 'model' as const, parts: [{ text: aiText }] }];
         reflectAndLearn(fullHistory, learningProfile || "").then(newProfile => {
             if (newProfile && newProfile.length > 5) {
                 AsyncStorage.setItem('ai_learning_profile', newProfile);
             }
         }).catch(() => {/* silent */});
      }

      // Save AI msg to state & local storage
      let newAiMsgIndex = -1;
      setSessions(prevSessions => {
        const updated = prevSessions.map(s => {
           if (s.id === currentSessionId) {
              newAiMsgIndex = s.messages.length;
              return { ...s, messages: [...s.messages, { id: Date.now().toString() + 'ai', role: 'model' as const, text: aiText }], updatedAt: Date.now() };
           }
           return s;
        });
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      // Smoothly scroll to the START of the new AI reply so user reads from the beginning!
      shouldScrollToEndRef.current = false;
      if (newAiMsgIndex >= 0) {
        setTimeout(() => {
          try {
            scrollViewRef.current?.scrollToIndex({
              index: newAiMsgIndex,
              viewPosition: 0,
              animated: true,
            });
          } catch {}
        }, 120);
      }

    } catch (error: any) {
      console.error("AI Generation Error:", error);
      const friendly = getFriendlyErrorMessage(error);

      if (error.name === 'TimeoutError' || error.message?.includes('timeout') || error.message?.includes('aborted') || error.message?.includes('Network')) {
         reportNetworkError();
      }

      if (friendly.showSettings) {
         setShowSettings(true);
      }
      if (friendly.showContextModal) {
         setShowContextLimitModal(true);
      }
      
      setSessions(prevSessions => {
        const updated = prevSessions.map(s => {
           if (s.id === currentSessionId) {
              return { ...s, messages: [...s.messages, { id: Date.now().toString() + 'err', role: 'model' as const, text: friendly.message }], updatedAt: Date.now() };
           }
           return s;
        });
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const retryLastMessage = async () => {
    if (isTyping || !currentSessionId) return;

    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (!currentSession) return;

    // Find the last user message in the session
    const lastUserMsg = [...currentSession.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    // Clean any trailing error bubbles
    setSessions(prevSessions => {
      const updated = prevSessions.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: s.messages.filter(m => !m.id.endsWith('err')) };
        }
        return s;
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    setIsTyping(true);
    shouldScrollToEndRef.current = true;
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    // Call execution directly
    executeAiRequest(lastUserMsg.text, undefined);
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && !attachedPhoto) || !currentSessionId) return;

    let currentText = inputText.trim();
    if (!currentText && attachedPhoto) {
       currentText = "Please analyze this image, extract the question/problem, and provide a clear step-by-step solution with explanations, formulas, and final answer.";
    }

    if (selectedFiles.length > 0) {
       currentText += `\n\n[TOPIC FOCUS: ${selectedFiles.join('|||')}]. Please explain this subject comprehensively using the course syllabus and educational concepts. Even if specific extracts are not attached, provide a complete, exam-focused professor explanation of this topic.`;
    }

    const currentPhoto = attachedPhoto;
    const newUserMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      text: currentText,
      imageUri: currentPhoto?.uri,
    };
    setInputText('');
    setInputHeight(44);
    setAttachedPhoto(null);
    setIsTyping(true);
    setSelectedFiles([]);
    
    shouldScrollToEndRef.current = true;
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    // Save user msg to state & local storage
    setSessions(prevSessions => {
      const updated = prevSessions.map(s => {
         if (s.id === currentSessionId) {
            let newTitle = s.title;
            // Auto rename title if it's the first message
            if (s.messages.length === 1 && currentText.length > 3) {
               newTitle = currentPhoto ? "📸 Photo Doubt" : (currentText.substring(0, 20) + (currentText.length > 20 ? '...' : ''));
            }
            return { ...s, messages: [...s.messages, newUserMsg], updatedAt: Date.now(), title: newTitle };
         }
         return s;
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    const imagePayload = currentPhoto?.base64 ? {
       base64: currentPhoto.base64,
       mimeType: currentPhoto.mimeType || 'image/jpeg',
    } : undefined;

    executeAiRequest(currentText, imagePayload);
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
    setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 },
    setupCard: { backgroundColor: colors.surface, padding: 24, borderRadius: 16, width: '100%', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
    title: { fontSize: 22, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 24, lineHeight: 20 },
    input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.text, fontFamily: 'Inter_400Regular', marginBottom: 16 },
    button: { backgroundColor: colors.primary, padding: 14, borderRadius: 8, alignItems: 'center' },
    buttonText: { color: 'white', fontFamily: 'Inter_600SemiBold', fontSize: 16 },
    
    chatContainer: { flex: 1 },
    messagesList: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 32 },
    messageBubble: { marginBottom: 16 },
    userBubble: { 
      backgroundColor: colors.primary, 
      alignSelf: 'flex-end', 
      maxWidth: '85%', 
      paddingHorizontal: 16, 
      paddingVertical: 12, 
      borderRadius: 18, 
      borderBottomRightRadius: 4 
    },
    aiBubble: { 
      width: '100%', 
      maxWidth: '100%', 
      alignSelf: 'stretch', 
      backgroundColor: isDark ? '#111116' : colors.surface, 
      borderWidth: 1, 
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border, 
      borderRadius: 16, 
      paddingHorizontal: 16, 
      paddingVertical: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    userText: { color: 'white', fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
    
    inputArea: { 
      flexDirection: 'row', 
      paddingHorizontal: 12, 
      paddingTop: 8, 
      paddingBottom: Platform.OS === 'ios' ? 12 : 10, 
      borderTopWidth: 1, 
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border, 
      backgroundColor: isDark ? '#0d0d14' : '#ffffff', 
      alignItems: 'flex-end',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 6,
      elevation: 4,
    },
    chatInput: { 
      flex: 1, 
      backgroundColor: isDark ? '#14141e' : '#f8fafc', 
      borderWidth: 1.5, 
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border, 
      borderRadius: 22, 
      paddingHorizontal: 16, 
      paddingTop: Platform.OS === 'android' ? 10 : 11, 
      paddingBottom: Platform.OS === 'android' ? 10 : 11, 
      color: colors.text, 
      fontFamily: 'Inter_400Regular', 
      fontSize: 15, 
      lineHeight: 20 
    },
    historyButton: { 
      width: 44, 
      height: 44, 
      borderRadius: 22, 
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surface, 
      borderWidth: 1, 
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border, 
      justifyContent: 'center', 
      alignItems: 'center', 
      marginRight: 8, 
      alignSelf: 'flex-end' 
    },
    sendButton: { 
      width: 44, 
      height: 44, 
      borderRadius: 22, 
      overflow: 'hidden',
      justifyContent: 'center', 
      alignItems: 'center', 
      marginLeft: 8, 
      alignSelf: 'flex-end' 
    },
    sendButtonDisabled: { 
      opacity: 0.5 
    },
    
    // Modal Mechanics styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: (insets.bottom || 20) + 70, maxHeight: '75%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4 },
    modalOption: { paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalOptionText: { color: '#d1d5db', fontSize: 15, fontFamily: 'Inter_500Medium' },
    modalOptionTextSelected: { color: colors.primary, fontFamily: 'Inter_700Bold' },
  }), [colors, isDark, insets]);

  const markdownStyles = useMemo(() => ({
    body: { color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23 },
    heading1: { fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 6, fontSize: 21, lineHeight: 28, color: colors.text, marginTop: 14, marginBottom: 8 },
    heading2: { fontFamily: 'SpaceGrotesk_600SemiBold', paddingRight: 6, fontSize: 18, lineHeight: 24, color: colors.text, marginTop: 12, marginBottom: 6 },
    heading3: { fontFamily: 'SpaceGrotesk_600SemiBold', paddingRight: 4, fontSize: 16, lineHeight: 22, color: colors.text, marginTop: 10, marginBottom: 4 },
    heading4: { fontFamily: 'SpaceGrotesk_600SemiBold', paddingRight: 4, fontSize: 15, lineHeight: 20, color: colors.text, marginTop: 8, marginBottom: 4 },
    heading5: { fontFamily: 'SpaceGrotesk_600SemiBold', paddingRight: 4, fontSize: 14, lineHeight: 18, color: colors.text, marginTop: 6, marginBottom: 2 },
    heading6: { fontFamily: 'SpaceGrotesk_600SemiBold', paddingRight: 4, fontSize: 13, lineHeight: 18, color: colors.text, marginTop: 4, marginBottom: 2 },
    paragraph: { marginTop: 0, marginBottom: 10, color: colors.text, flexWrap: 'wrap' as const },
    strong: { fontFamily: 'Inter_700Bold', color: colors.text },
    em: { fontFamily: 'Inter_400Regular', fontStyle: 'italic' as const, color: colors.text },
    s: { textDecorationLine: 'line-through' as const, color: colors.textDim },
    link: { color: colors.primary, textDecorationLine: 'underline' as const },
    blockquote: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
      borderColor: colors.primary,
      borderLeftWidth: 3.5,
      borderRadius: 6,
      marginLeft: 0,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    code_inline: { 
      backgroundColor: isDark ? '#1a1a24' : '#e2e8f0', 
      fontFamily: 'JetBrainsMono_400Regular', 
      color: isDark ? '#60a5fa' : colors.primary, 
      paddingHorizontal: 6, 
      paddingVertical: 2, 
      borderRadius: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
      fontSize: 13,
    },
    code_block: { 
      backgroundColor: isDark ? '#14141b' : '#f1f5f9', 
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1',
      borderWidth: 1,
      fontFamily: 'JetBrainsMono_400Regular', 
      color: isDark ? '#f1f5f9' : '#0f172a', 
      padding: 12, 
      borderRadius: 10, 
      marginVertical: 8,
      fontSize: 13,
      lineHeight: 20,
    },
    fence: { 
      backgroundColor: isDark ? '#14141b' : '#f1f5f9', 
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1',
      borderWidth: 1,
      fontFamily: 'JetBrainsMono_400Regular', 
      color: isDark ? '#f1f5f9' : '#0f172a', 
      padding: 12, 
      borderRadius: 10, 
      marginVertical: 8,
      fontSize: 13,
      lineHeight: 20,
    },
    pre: {
      backgroundColor: 'transparent',
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginVertical: 3,
    },
    bullet_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: colors.primary,
    },
    ordered_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
    },
    bullet_list_content: {
      flex: 1,
      color: colors.text,
    },
    ordered_list_content: {
      flex: 1,
      color: colors.text,
    },
    table: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.12)',
      borderRadius: 8,
      marginVertical: 8,
      backgroundColor: isDark ? '#14141a' : '#f8fafc',
      overflow: 'hidden' as const,
    },
    thead: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
    },
    tbody: {},
    th: {
      flex: 1,
      padding: 8,
      color: colors.text,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    tr: {
      borderBottomWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      flexDirection: 'row' as const,
    },
    td: {
      flex: 1,
      padding: 8,
      color: colors.text,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
    },
    hr: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
      height: 1,
      marginVertical: 12,
    },
    text: {
      color: colors.text,
    },
  }), [colors, isDark]);

  const markdownRules = useMemo(() => ({
    fence: (node: any) => {
      let content = node.content;
      if (typeof content === 'string' && content.charAt(content.length - 1) === '\n') {
        content = content.substring(0, content.length - 1);
      }
      return (
        <ScrollView
          key={node.key}
          horizontal
          nestedScrollEnabled={true}
          showsHorizontalScrollIndicator={false}
          style={{
            backgroundColor: isDark ? '#14141b' : '#f1f5f9',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1',
            borderRadius: 10,
            marginVertical: 8,
            padding: 12,
          }}
        >
          <Text
            style={{
              fontFamily: 'JetBrainsMono_400Regular',
              color: isDark ? '#f1f5f9' : '#0f172a',
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            {content}
          </Text>
        </ScrollView>
      );
    },
    code_block: (node: any) => {
      let content = node.content;
      if (typeof content === 'string' && content.charAt(content.length - 1) === '\n') {
        content = content.substring(0, content.length - 1);
      }
      return (
        <ScrollView
          key={node.key}
          horizontal
          nestedScrollEnabled={true}
          showsHorizontalScrollIndicator={false}
          style={{
            backgroundColor: isDark ? '#14141b' : '#f1f5f9',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1',
            borderRadius: 10,
            marginVertical: 8,
            padding: 12,
          }}
        >
          <Text
            style={{
              fontFamily: 'JetBrainsMono_400Regular',
              color: isDark ? '#f1f5f9' : '#0f172a',
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            {content}
          </Text>
        </ScrollView>
      );
    },
  }), [isDark]);

  if (!isAccessGranted || isInitializingSettings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (showSettings) {
    return (
      <View style={styles.setupContainer}>
        <Stack.Screen options={{ title: "Quirren Settings", headerShadowVisible: false, headerStyle: { backgroundColor: colors.background } }} />
        <View style={styles.setupCard}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="key" size={24} color={colors.primary} />
          </View>
          <Text style={styles.title}>{hasSavedKey && !isEditingKey ? "Quirren Settings" : "AI Engine Settings"}</Text>
          <Text style={styles.subtitle}>
            {activeProvider === 'pool' 
              ? "⚡ PathWise Cloud AI Pool is active. You can chat and solve doubts freely without entering any key! To connect personal keys for dedicated limits, paste below." 
              : "You are using a personal BYOK key. To switch to the free shared pool, tap Remove API Key."}
          </Text>
          
          {(!hasSavedKey || isEditingKey) && (
              <View style={{ width: '100%', marginBottom: 16 }}>
                <View style={{ backgroundColor: colors.primary + '12', padding: 12, borderRadius: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.primary + '30' }}>
                   <Ionicons name="cloud-done" size={20} color={colors.primary} />
                   <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'SpaceGrotesk_700Bold' }}>PathWise Cloud AI Active</Text>
                      <Text style={{ color: colors.textDim, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Free pool ready. Connecting a personal key is optional.</Text>
                   </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: colors.primary + '20', borderWidth: 1, borderColor: colors.primary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}
                  >
                    <Text style={{ color: colors.primary, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, fontSize: 13 }}>⚡ Free Gemini Key</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: '#f59e0b20', borderWidth: 1, borderColor: '#f59e0b', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => Linking.openURL('https://console.groq.com/keys')}
                  >
                    <Text style={{ color: '#f59e0b', fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, fontSize: 13 }}>🔥 Free Groq Key</Text>
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
                   <Text style={[styles.buttonText, { color: colors.error }]}>Remove Key (Revert to Cloud)</Text>
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
                  placeholder="Paste personal key (optional)..."
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
                   setIsEditingKey(false);
                   setShowSettings(false);
                }}>
                   <Text style={[styles.buttonText, { color: colors.text }]}>Back to Chat</Text>
                </TouchableOpacity>
             </View>
          )}
        </View>

        {/* Confirmation Modal */}
        <CenterPopModal isVisible={showClearConfirm} onClose={() => setShowClearConfirm(false)}>
           <View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 16, alignItems: 'center' }}>
              <Ionicons name="warning" size={48} color={colors.error} style={{ marginBottom: 16 }} />
              <Text style={{ fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, color: colors.text, marginBottom: 8, textAlign: 'center' }}>
                {isDoubtSolver ? "Delete Doubt History?" : "Delete Chat History?"}
              </Text>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 24, textAlign: 'center' }}>
                {isDoubtSolver 
                  ? "Are you sure you want to permanently delete all doubt solver chats? This cannot be undone."
                  : "Are you sure you want to permanently delete all chat history for this subject? This cannot be undone."}
              </Text>
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
              <Text style={{ fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, color: colors.text, textAlign: 'center' }}>Chats Deleted</Text>
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
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
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
          {/* Left: Back to LMS & Subject/Doubt Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
            <TouchableOpacity
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface + '80', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => router.navigate('/(app)/studyos' as any)}
            >
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }} numberOfLines={1}>
                {isDoubtSolver ? 'Snap & Solve' : (name ? `${name} • Quirren` : 'Quirren')}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim }} numberOfLines={1}>
                {isDoubtSolver ? 'Universal AI Vision Solver' : (id || 'Course Tutor')}
              </Text>
            </View>
          </View>

          {/* Right: Active Model Selector, Quick Chat & Settings */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity 
              style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colors.primary + '40', flexDirection: 'row', alignItems: 'center', gap: 6 }}
              onPress={() => setShowModelSwitcherModal(true)}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4 }}>
                {activeProvider === 'pool' 
                  ? `⚡ PathWise AI (${dailyUsage.remaining}/50)` 
                  : `${connectedModels.find(m => m.id === activeProvider)?.icon || '🤖'} ${connectedModels.find(m => m.id === activeProvider)?.name || 'BYOK Model'}`}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.primary} />
            </TouchableOpacity>

            {/* Quick Chat Switcher Button (Gesture Enabled) */}
            <View
                 onStartShouldSetResponder={() => true}
                 onResponderGrant={(e) => {
                    longPressTimer.current = setTimeout(() => {
                       isQuickMenuVisible.current = true;
                       DeviceEventEmitter.emit('quickMenuVisible', true);
                       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    }, 350);
                 }}
                 onResponderMove={(e) => {
                    if (isQuickMenuVisible.current) {
                       const y = e.nativeEvent.pageY;
                       const baseOffset = Platform.OS === 'android' ? insets.top : 0;
                       const menuStartY = baseOffset + 130; // 70 (menu top) + 60 (header height)
                       const itemHeight = 65;
                       if (y > menuStartY) {
                           const index = Math.floor((y - menuStartY) / itemHeight);
                           if (index >= 0 && index < sessions.length) {
                               updateHoveredIndex(index);
                           } else {
                               updateHoveredIndex(-1);
                           }
                       } else {
                           updateHoveredIndex(-1);
                       }
                    }
                 }}
                 onResponderRelease={(e) => {
                    clearTimeout(longPressTimer.current);
                    if (isQuickMenuVisible.current) {
                        const finalIndex = hoveredIndexRef.current;
                        
                        isQuickMenuVisible.current = false;
                        DeviceEventEmitter.emit('quickMenuVisible', false);
                        updateHoveredIndex(-1);

                        if (finalIndex >= 0 && finalIndex < sessions.length) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            
                            // Defer the heavy chat state update so the overlay disappears instantly first!
                            setTimeout(() => {
                                setCurrentSessionId(sessions[finalIndex].id);
                            }, 100);
                        }
                    } else {
                        // Short tap: just open normal history modal
                        setShowHistoryModal(true);
                    }
                 }}
                 onResponderTerminate={(e) => {
                    clearTimeout(longPressTimer.current);
                    isQuickMenuVisible.current = false;
                    DeviceEventEmitter.emit('quickMenuVisible', false);
                    updateHoveredIndex(-1);
                 }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface + '80', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
                </View>
              </View>

            <TouchableOpacity
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface + '80', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

          <FlatList
            style={styles.chatContainer} 
            contentContainerStyle={styles.messagesList}
            ref={scrollViewRef as any}
            data={activeMessages}
            keyExtractor={msg => msg.id}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                try {
                  scrollViewRef.current?.scrollToIndex({
                    index: info.index,
                    viewPosition: 0,
                    animated: true,
                  });
                } catch {}
              }, 100);
            }}
            onContentSizeChange={() => {
              if (shouldScrollToEndRef.current) {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }
            }}
            onLayout={() => {
              if (shouldScrollToEndRef.current) {
                scrollViewRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListFooterComponent={() => {
              if (isTyping) {
                return (
                  <View style={[styles.messageBubble, styles.aiBubble, { width: 72, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                );
              }
              if (activeMessages.length <= 1) {
                const quickPrompts = isDoubtSolver ? [
                  { icon: 'camera', text: 'Snap handwritten math problem' },
                  { icon: 'bulb-outline', text: 'Explain a physics numerical step-by-step' },
                  { icon: 'code-slash-outline', text: 'Debug a code error or algorithm' },
                  { icon: 'document-text-outline', text: 'Formula sheet & key constants' }
                ] : [
                  { icon: 'book-outline', text: 'Explain core concepts of Unit 1' },
                  { icon: 'help-circle-outline', text: 'Top 5 important exam questions' },
                  { icon: 'git-compare-outline', text: 'Compare key algorithms step-by-step' },
                  { icon: 'flash-outline', text: 'Quick syllabus summary & memory tips' }
                ];
                return (
                  <View style={{ marginTop: 14, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Inter_600SemiBold', color: colors.textMuted, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      💡 Suggested Topics
                    </Text>
                    <View style={{ gap: 8 }}>
                      {quickPrompts.map((p, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => {
                            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                            if (p.icon === 'camera') {
                              setShowPhotoPickerModal(true);
                            } else {
                              setInputText(p.text);
                            }
                          }}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 11,
                            paddingHorizontal: 14,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
                            gap: 10,
                          }}
                        >
                          <Ionicons name={p.icon as any} size={16} color={colors.primary} />
                          <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.text }}>
                            {p.text}
                          </Text>
                          <Ionicons name="arrow-up-circle-outline" size={17} color={colors.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              }
              return null;
            }}
            renderItem={({ item: msg }) => {
                const { displayText, hiddenFiles } = msg.role === 'user' ? renderUserMessage(msg.text) : { displayText: msg.text, hiddenFiles: [] };
                return (
                <View style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                   {msg.role === 'user' ? (
                      <View>
                         {msg.imageUri && (
                            <TouchableOpacity 
                               onPress={() => setFullscreenImageUri(msg.imageUri || null)}
                               activeOpacity={0.88}
                               style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}
                            >
                               <Image 
                                  source={{ uri: msg.imageUri }} 
                                  style={{ width: 220, height: 160, borderRadius: 12 }} 
                                  resizeMode="cover" 
                               />
                               <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Ionicons name="expand-outline" size={11} color="white" />
                                  <Text style={{ color: 'white', fontSize: 10, fontFamily: 'Inter_500Medium' }}>Tap to view</Text>
                               </View>
                            </TouchableOpacity>
                         )}
                         {displayText ? <Text style={styles.userText}>{displayText}</Text> : <Text style={[styles.userText, { fontStyle: 'italic', opacity: 0.8 }]}>Can you explain this document?</Text>}
                         {hiddenFiles.length > 0 && (
                            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                               {hiddenFiles.map((f, i) => {
                                  // Extract just the filename without path
                                  const rawName = f.trim().split('/').pop()?.split('\\').pop() || f;
                                  // Remove extension
                                  const nameNoExt = rawName.replace(/\.(pptx|pdf|docx|txt|ppt|xlsx|csv)$/i, '');
                                  // Remove "Topic X.X - " prefix if present
                                  const cleanName = nameNoExt.replace(/^Topic\s*\d+[\.\d]*\s*[-\:]\s*/i, '').trim();
                                  // Truncate if too long
                                  const shortName = cleanName.length > 22 ? cleanName.substring(0, 20) + '...' : cleanName;
                                  // Pick icon by extension
                                  const ext = rawName.split('.').pop()?.toLowerCase() || '';
                                  const icon = ext === 'pdf' ? 'document-text' : ext === 'pptx' || ext === 'ppt' ? 'easel' : 'document-attach';
                                  return (
                                     <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 5 }}>
                                        <Ionicons name={icon as any} size={13} color="rgba(255,255,255,0.95)" />
                                        <Text style={{ color: 'rgba(255,255,255,0.97)', fontSize: 12, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{shortName}</Text>
                                     </View>
                                  );
                               })}
                            </View>
                         )}
                      </View>
                   ) : (
                      <View style={{ width: '100%' }}>
                         <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                               <LinearGradient
                                  colors={msg.id.endsWith('err') ? ['#ef4444', '#dc2626'] : [colors.primary, colors.accent || '#8b5cf6']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={{ width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}
                               >
                                  <Ionicons name={msg.id.endsWith('err') ? "warning" : "sparkles"} size={13} color="#ffffff" />
                               </LinearGradient>
                               <Text style={{ fontSize: 13.5, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, letterSpacing: 0.2 }}>Quirren</Text>
                               <View style={{ 
                                  backgroundColor: msg.id.endsWith('err') ? (colors.error || '#ef4444') + '18' : colors.primary + '16', 
                                  paddingHorizontal: 7, 
                                  paddingVertical: 2, 
                                  borderRadius: 8, 
                                  borderWidth: 1, 
                                  borderColor: msg.id.endsWith('err') ? (colors.error || '#ef4444') + '35' : colors.primary + '30' 
                               }}>
                                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: msg.id.endsWith('err') ? colors.error || '#ef4444' : colors.primary }}>
                                     {msg.id.endsWith('err') ? 'Notice' : 'Exam Verified'}
                                  </Text>
                               </View>
                            </View>
                         </View>
                         <Markdown style={markdownStyles} rules={markdownRules}>
                            {msg.text}
                         </Markdown>

                         {msg.id.endsWith('err') && (
                            <View style={{ marginTop: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                               <TouchableOpacity
                                  onPress={() => retryLastMessage()}
                                  activeOpacity={0.7}
                                  style={{
                                     flexDirection: 'row',
                                     alignItems: 'center',
                                     gap: 6,
                                     backgroundColor: colors.primary,
                                     paddingHorizontal: 13,
                                     paddingVertical: 8,
                                     borderRadius: 8,
                                  }}
                               >
                                  <Ionicons name="refresh" size={14} color="#ffffff" />
                                  <Text style={{ color: '#ffffff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Tap to Retry</Text>
                               </TouchableOpacity>

                               <TouchableOpacity
                                  onPress={() => setShowSettings(true)}
                                  activeOpacity={0.7}
                                  style={{
                                     flexDirection: 'row',
                                     alignItems: 'center',
                                     gap: 6,
                                     backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                     paddingHorizontal: 12,
                                     paddingVertical: 8,
                                     borderRadius: 8,
                                     borderWidth: 1,
                                     borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                  }}
                               >
                                  <Ionicons name="key-outline" size={14} color={colors.text} />
                                  <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Settings / Key</Text>
                               </TouchableOpacity>
                            </View>
                         )}
                      </View>
                   )}
                </View>
             )}}
          />

        {attachedPhoto && (
           <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              backgroundColor: isDark ? '#14141c' : '#f1f5f9', 
              paddingHorizontal: 14, 
              paddingVertical: 10, 
              borderTopWidth: 1, 
              borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
              gap: 12
           }}>
              <Image 
                 source={{ uri: attachedPhoto.uri }} 
                 style={{ width: 44, height: 44, borderRadius: 8, borderWidth: 1.5, borderColor: colors.primary }} 
                 resizeMode="cover" 
              />
              <View style={{ flex: 1 }}>
                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="camera" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>Doubt Photo Ready</Text>
                 </View>
                 <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim }} numberOfLines={1}>
                    AI will transcribe and solve the question in this photo
                 </Text>
              </View>
              <TouchableOpacity 
                 onPress={() => setAttachedPhoto(null)} 
                 style={{ padding: 4 }}
                 hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                 <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
           </View>
        )}

        <View style={styles.inputArea}>
           {!isDoubtSolver && (
             <TouchableOpacity 
               style={[styles.historyButton, { marginRight: 6 }]} 
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
                         <Text style={{ color: 'white', fontSize: 10, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4 }}>{selectedFiles.length}</Text>
                      </View>
                   )}
                </View>
             </TouchableOpacity>
           )}

           <TouchableOpacity 
             style={[
               styles.historyButton, 
               { 
                 marginRight: 8, 
                 backgroundColor: isDoubtSolver ? (attachedPhoto ? colors.primary + '30' : colors.primary) : (attachedPhoto ? colors.primary + '25' : colors.surface),
                 paddingHorizontal: isDoubtSolver ? 12 : undefined,
                 width: isDoubtSolver ? 'auto' : 42,
                 flexDirection: 'row',
                 alignItems: 'center',
                 gap: 5
               }
             ]} 
             onPress={() => setShowPhotoPickerModal(true)}
           >
              <Ionicons 
                name={attachedPhoto ? "camera" : "camera-outline"} 
                size={20} 
                color={isDoubtSolver && !attachedPhoto ? '#ffffff' : colors.primary} 
              />
              {isDoubtSolver && (
                <Text style={{ 
                  color: !attachedPhoto ? '#ffffff' : colors.primary, 
                  fontSize: 12, 
                  fontFamily: 'SpaceGrotesk_700Bold' 
                }}>
                  {attachedPhoto ? "Change" : "Snap"}
                </Text>
              )}
           </TouchableOpacity>

            <TextInput 
                style={[
                  styles.chatInput, 
                  { 
                    height: inputHeight,
                    borderRadius: inputHeight > 54 ? 18 : 22,
                  }
                ]}
                placeholder={attachedPhoto ? "Ask about this photo (optional)..." : (isDoubtSolver ? "Snap photo or ask Quirren..." : "Ask Quirren a question...")}
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={(text) => {
                  setInputText(text);
                  if (!text || text.trim().length === 0) {
                    setInputHeight(44);
                  }
                }}
                multiline={true}
                scrollEnabled={inputHeight >= 110}
                textAlignVertical={inputHeight > 48 ? "top" : "center"}
                maxLength={2000}
                onContentSizeChange={(e) => {
                  const rawH = e.nativeEvent.contentSize.height;
                  if (!rawH || rawH <= 0) return;
                  if (!inputText || !inputText.trim()) {
                    setInputHeight(44);
                    return;
                  }

                  const effectiveH = Platform.OS === 'android' ? rawH : rawH + 20;

                  // 1 line threshold: <= 46px and no newline
                  if (effectiveH <= 46 && !inputText.includes('\n')) {
                    setInputHeight(44);
                  } else {
                    const clamped = Math.min(Math.max(effectiveH, 44), 112);
                    setInputHeight(clamped);
                  }
                }}
             />
           <TouchableOpacity 
              style={[
                styles.sendButton, 
                ((!inputText.trim() && !attachedPhoto) || isTyping) && styles.sendButtonDisabled
              ]} 
              onPress={sendMessage}
              disabled={(!inputText.trim() && !attachedPhoto) || isTyping}
            >
               <LinearGradient
                 colors={((!inputText.trim() && !attachedPhoto) || isTyping) 
                   ? [colors.border, colors.border] 
                   : [colors.primary, colors.accent || '#8b5cf6']}
                 start={{ x: 0, y: 0 }}
                 end={{ x: 1, y: 1 }}
                 style={{ width: '100%', height: '100%', borderRadius: 22, justifyContent: 'center', alignItems: 'center' }}
               >
                 <Ionicons name="send" size={17} color="white" style={{ marginLeft: 3 }} />
               </LinearGradient>
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
                          <Text style={{ fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, color: colors.text }}>{unit}</Text>
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
              <Text style={styles.modalTitle}>{isDoubtSolver ? "Doubt History" : "Chat History"}</Text>
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
                   <Text style={{ color: colors.primary, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4 }}>
                     {isDoubtSolver ? "+ New Doubt Query" : "+ Create New Chat"}
                   </Text>
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
              <Text style={styles.modalTitle}>⚡ Active AI Engine</Text>
              <TouchableOpacity onPress={() => setShowModelSwitcherModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 16, fontFamily: 'Inter_400Regular' }}>
               Select between PathWise Cloud AI (built-in free shared pool) or your personal BYOK models:
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
               {/* 1. Default Built-in Cloud Pool */}
               <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                     setActiveProvider('pool');
                     setApiKey('');
                     AsyncStorage.setItem('active_byok_provider', 'pool');
                     setShowModelSwitcherModal(false);
                  }}
               >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                     <Text style={{ fontSize: 20 }}>⚡</Text>
                     <View>
                        <Text style={{ color: activeProvider === 'pool' ? colors.primary : colors.text, fontSize: 16, fontFamily: activeProvider === 'pool' ? 'SpaceGrotesk_700Bold' : 'Inter_500Medium' }}>
                           PathWise Cloud AI
                        </Text>
                        <Text style={{ color: colors.success, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>
                           Free Pool • {dailyUsage.remaining} of 50 queries left today
                        </Text>
                     </View>
                  </View>
                  <Ionicons name={activeProvider === 'pool' ? "radio-button-on" : "radio-button-off"} size={22} color={activeProvider === 'pool' ? colors.primary : colors.textDim} />
               </TouchableOpacity>

               {/* 2. Personal BYOK Connected Models */}
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
                 <Text style={{ color: colors.primary, fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4 }}>+ Connect Another AI Model</Text>
               </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Context Limit Modal */}
      <Modal visible={showContextLimitModal} animationType="fade" transparent={true} onRequestClose={() => setShowContextLimitModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚠️ Chat Limit Reached</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 15, marginBottom: 20, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
              Your conversation history and attached PPTs are too large for this free API Key's memory context window. 
              {"\n\n"}To continue chatting about this subject, please start a fresh new chat session.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: colors.surfaceHigh || '#f1f5f9', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => setShowContextLimitModal(false)}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => {
                  setShowContextLimitModal(false);
                  createNewSession(false); // Just start a new chat tab, keeping previous ones
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Start New Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Doubt Picker Modal */}
      <Modal visible={showPhotoPickerModal} animationType="fade" transparent={true} onRequestClose={() => setShowPhotoPickerModal(false)}>
        <TouchableOpacity 
           style={styles.modalOverlay} 
           activeOpacity={1} 
           onPress={() => setShowPhotoPickerModal(false)}
        >
          <View style={[styles.modalContent, { paddingBottom: (insets.bottom || 20) + 20 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="camera" size={18} color={colors.primary} />
                </View>
                <Text style={styles.modalTitle}>Snap & Solve Doubt</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPhotoPickerModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 18, lineHeight: 19 }}>
              Take a photo of any question, math formula, circuit diagram, or textbook page to get an instant step-by-step solution from Quirren.
            </Text>

            <TouchableOpacity 
               style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.primary + '18', borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.primary + '40', gap: 14 }}
               onPress={handleTakePhoto}
            >
               <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="camera" size={20} color="white" />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>Take Photo with Camera</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 }}>Snap physical question paper or notebook</Text>
               </View>
               <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity 
               style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 14 }}
               onPress={handleChooseFromGallery}
            >
               <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="images-outline" size={20} color={colors.text} />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>Choose from Gallery</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 }}>Upload screenshot or saved problem</Text>
               </View>
               <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Fullscreen Image Viewer Modal */}
      <Modal visible={!!fullscreenImageUri} animationType="fade" transparent={true} onRequestClose={() => setFullscreenImageUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <SafeAreaView style={{ position: 'absolute', top: 12, right: 16, zIndex: 10 }}>
            <TouchableOpacity 
              onPress={() => setFullscreenImageUri(null)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' }}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </SafeAreaView>
          {fullscreenImageUri && (
            <Image 
              source={{ uri: fullscreenImageUri }} 
              style={{ width: '92%', height: '80%' }} 
              resizeMode="contain" 
            />
          )}
        </View>
      </Modal>

      </BlurTargetView>

      {/* Quick Chat Switcher Overlay (Gesture based - isolated to prevent re-renders) */}
      <QuickChatOverlay colors={colors} sessions={sessions} currentSessionId={currentSessionId} blurTargetRef={blurTargetRef} isDoubtSolver={isDoubtSolver} />

    </View>
  );
}
