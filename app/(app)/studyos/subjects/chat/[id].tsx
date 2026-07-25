import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../../../store/useThemeStore';
import Markdown from 'react-native-markdown-display';
import { generateAiResponse } from '../../../../../lib/aiManager';
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

export default function AITutorChatScreen() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);
  const { userId } = useAuth();

  const isAccessGranted = true;

  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [syllabusScraped, setSyllabusScraped] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [scrapingError, setScrapingError] = useState('');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Create a strictly unique storage key using both ID and Subject Name 
  // to ensure chats never mix even if course ID fails to parse.
  const STORAGE_KEY = `ai_chat_sessions_${id}_${name}`;
  
  // Scraper Inject Script
  const INJECT_SCRIPT = `
    try {
       // Moodle courses usually have sections
       var sections = document.querySelectorAll('li.section, .course-section, .tab-pane, .tab_content');
       var syllabusText = 'Course Overview & Syllabus:\\n\\n';
       
       if (sections.length > 0) {
           for(var i=0; i<sections.length; i++) {
              var sec = sections[i];
              var title = sec.querySelector('.sectionname, h3');
              var summary = sec.querySelector('.summary, .contentwithoutlink');
              
              if(title) syllabusText += '## ' + title.textContent.trim() + '\\n';
              if(summary) syllabusText += summary.textContent.trim() + '\\n';
              
              var activities = sec.querySelectorAll('.activity, .modtype_resource, .modtype_folder');
              for(var j=0; j<activities.length; j++) {
                 var act = activities[j];
                 var actTitle = act.querySelector('.instancename');
                 if(actTitle) {
                     syllabusText += '- ' + actTitle.textContent.replace('File', '').replace('Folder', '').replace('Page', '').trim() + '\\n';
                 }
              }
              syllabusText += '\\n';
           }
       } else {
           // Fallback: grab all text if structure is completely different
           syllabusText += document.body.innerText.substring(0, 5000); // limit to 5000 chars to avoid memory issues
       }
       
       window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SYLLABUS_SCRAPED', data: syllabusText }));
    } catch(e) {
       window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', error: e.message }));
    }
    true;
  `;

  useEffect(() => {
    setSessions([]);
    setCurrentSessionId(null);
    loadApiKey();
    loadSessions();
  }, [id, name]);

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
    const key = await AsyncStorage.getItem('gemini_api_key');
    if (key) {
      setApiKey(key);
    }
  };

  const saveApiKey = async () => {
    if (apiKey.trim().length > 10) {
      await AsyncStorage.setItem('gemini_api_key', apiKey.trim());
      setShowSettings(false);
    } else {
      await AsyncStorage.removeItem('gemini_api_key');
      setApiKey('');
      setShowSettings(false);
    }
  };

  const clearAllChats = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const chatKeys = keys.filter(k => k.startsWith('ai_chat_sessions_'));
      await AsyncStorage.multiRemove(chatKeys);
      setSessions([]);
      createNewSession(true);
      alert("All previous chat history has been permanently deleted.");
      setShowSettings(false);
    } catch (e) {
      console.error(e);
      alert("Failed to delete chats.");
    }
  };

  const handleMessage = (event: any) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      if (parsed.type === 'SYLLABUS_SCRAPED') {
        let text = parsed.data || '';
        if (text.length < 50) {
           text = "Syllabus could not be fully extracted. Please ask general questions about the subject.";
        }
        setSyllabusText(text);
        setSyllabusScraped(true);
      } else if (parsed.type === 'ERROR') {
        setScrapingError(parsed.error);
        setSyllabusText("Syllabus extraction failed. The AI will answer based on its general knowledge of " + name + ".");
        setSyllabusScraped(true);
      }
    } catch(e) {}
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !currentSessionId) return;

    const currentText = inputText.trim();
    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', text: currentText };
    setInputText('');
    setIsTyping(true);
    
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

      const aiText = await generateAiResponse(history, syllabusText, name as string);

      // Save AI msg to state & local storage
      setSessions(prevSessions => {
        const updated = prevSessions.map(s => {
           if (s.id === currentSessionId) {
              return { ...s, messages: [...s.messages, { id: Date.now().toString() + 'ai', role: 'model', text: aiText }], updatedAt: Date.now() };
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
              return { ...s, messages: [...s.messages, { id: Date.now().toString() + 'err', role: 'model', text: errMsg }], updatedAt: Date.now() };
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
          <Text style={styles.title}>Personal API Key (Optional)</Text>
          <Text style={styles.subtitle}>Enter your own free Gemini API Key for unlimited, fast responses. Leave blank to use the shared free pool (20 msgs/day).</Text>
          
          <TextInput 
            style={styles.input}
            placeholder="Paste your Gemini API Key here"
            placeholderTextColor={colors.textMuted}
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            secureTextEntry
          />
          
          <TouchableOpacity style={styles.button} onPress={saveApiKey}>
             <Text style={styles.buttonText}>Save & Return</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error, marginTop: 16 }]} 
            onPress={clearAllChats}
          >
             <Text style={[styles.buttonText, { color: colors.error }]}>Delete All Chat History</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!syllabusScraped) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: name as string || "AI Tutor", headerShadowVisible: false, headerStyle: { backgroundColor: colors.background } }} />
        
        <View style={{ width: 0, height: 0, opacity: 0 }}>
          <WebView 
            source={{ uri: `https://lms.culko.in/course/view.php?id=${id}` }}
            injectedJavaScript={INJECT_SCRIPT}
            onMessage={handleMessage}
            javaScriptEnabled={true}
          />
        </View>

        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
           <Ionicons name="sparkles" size={40} color={colors.primary} />
        </View>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ ...styles.title, marginTop: 24, textAlign: 'center' }}>Initializing AI Tutor</Text>
        <Text style={{ ...styles.subtitle, textAlign: 'center' }}>Reading your syllabus and topics from LMS...</Text>
      </View>
    );
  }

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
           {activeMessages.map(msg => (
              <View key={msg.id} style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                 {msg.role === 'user' ? (
                    <Text style={styles.userText}>{msg.text}</Text>
                 ) : (
                    <Markdown style={markdownStyles}>
                       {msg.text}
                    </Markdown>
                 )}
              </View>
           ))}
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
             style={styles.historyButton} 
             onPress={() => setShowHistoryModal(true)}
           >
              <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
           </TouchableOpacity>

           <TextInput 
              style={styles.chatInput}
              placeholder="Ask about a topic..."
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
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
                 <TouchableOpacity 
                    key={s.id} 
                    style={styles.modalOption}
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
              ))}
              
              {sessions.length < 5 && (
                <TouchableOpacity 
                  style={[styles.modalOption, { borderBottomWidth: 0, marginTop: 8 }]} 
                  onPress={createNewSession}
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
