import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
  KeyboardAvoidingView, Modal, Animated
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as DocumentPicker from 'expo-document-picker';
import { Calendar } from 'react-native-calendars';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { uploadPdf, createAssignment } from '../../../../lib/db';
import { useHardwareBack } from '../../../../hooks/useHardwareBack';

export default function CreateAssignmentScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  useHardwareBack('/studyos/assignments');
  const { userId } = useAuth();

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pdfFile, setPdfFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [fileError, setFileError] = useState<string>('');
  const [titleError, setTitleError] = useState<string>('');
  const [subjectError, setSubjectError] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Custom animation values for Calendar
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.95));

  const openCalendar = () => {
    setShowDatePicker(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150, // fast fade
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150, // fast scale
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeCalendar = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowDatePicker(false);
    });
  };

  const pickPdf = async () => {
    try {
      setFileError('');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      
      // Validate file size (5MB)
      if (asset.size && asset.size > 5 * 1024 * 1024) {
        setFileError('File is too large. Please select a file smaller than 5MB.');
        return;
      }

      // Validate file type
      const mimeType = asset.mimeType?.toLowerCase() || '';
      const name = asset.name?.toLowerCase() || '';
      const isPdf = mimeType === 'application/pdf' || name.endsWith('.pdf');
      const isWord = mimeType.includes('msword') || mimeType.includes('wordprocessingml') || name.endsWith('.doc') || name.endsWith('.docx');
      const isPpt = mimeType.includes('ms-powerpoint') || mimeType.includes('presentationml') || name.endsWith('.ppt') || name.endsWith('.pptx');
      const isText = mimeType.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.csv');
      const isImage = mimeType.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');

      if (!isPdf && !isWord && !isPpt && !isText && !isImage) {
        setFileError('Unsupported format. Please upload PDF, Word, PPT, Text, or Image files only.');
        setPdfFile(null);
        return;
      }

      setPdfFile({ uri: asset.uri, name: asset.name, type: mimeType || 'application/octet-stream' });
    } catch (e) {
      setFileError('Could not pick file. Please try again.');
    }
  };

  const handleSubmit = async () => {
    setTitleError('');
    setSubjectError('');
    let hasError = false;

    if (!title.trim()) {
      setTitleError('Assignment title is required');
      hasError = true;
    }
    if (!subject.trim()) {
      setSubjectError('Subject is required');
      hasError = true;
    }

    if (hasError) return;
    if (!userId) return;

    try {
      setSaving(true);
      let pdf_key: string | undefined;
      let pdf_filename: string | undefined;

      if (pdfFile) {
        setUploading(true);
        const uploaded = await uploadPdf(userId, pdfFile);
        pdf_key = uploaded.pdf_key;
        pdf_filename = uploaded.pdf_filename;
        setUploading(false);
      }

      await createAssignment(userId, {
        title: title.trim(),
        subject: subject.trim(),
        description: description.trim(),
        dueDate: dueDate.toISOString(),
        pdf_key,
        pdf_filename,
      });

      setShowSuccessModal(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to post assignment');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Post Assignment',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.push('/studyos/assignments' as any)} style={{ marginLeft: 14 }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        {/* Title */}
        <Text style={styles.label}>Assignment Title *</Text>
        <TextInput
          style={[styles.input, titleError ? { borderColor: '#ef4444' } : null]}
          placeholder="e.g. Unit 2 Notes Submission"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={(text) => { setTitle(text); setTitleError(''); }}
        />
        {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}

        {/* Subject */}
        <Text style={styles.label}>Subject *</Text>
        <TextInput
          style={[styles.input, subjectError ? { borderColor: '#ef4444' } : null]}
          placeholder="e.g. DBMS, Data Structures"
          placeholderTextColor={colors.textMuted}
          value={subject}
          onChangeText={(text) => { setSubject(text); setSubjectError(''); }}
        />
        {subjectError ? <Text style={styles.errorText}>{subjectError}</Text> : null}

        {/* Description */}
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add any extra instructions..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Due Date */}
        <Text style={styles.label}>Due Date *</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={openCalendar}>
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={styles.dateBtnText}>{dueDate.toDateString()}</Text>
        </TouchableOpacity>
        
        <Modal visible={showDatePicker} transparent animationType="none">
          <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
            <Animated.View style={[styles.calendarContainer, { transform: [{ scale: scaleAnim }] }]}>
              <View style={styles.calendarHeader}>
                <Text style={styles.calendarTitle}>Select Due Date</Text>
                <TouchableOpacity onPress={closeCalendar}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Calendar
                minDate={new Date().toISOString().split('T')[0]}
                onDayPress={(day: any) => {
                  setDueDate(new Date(day.timestamp));
                  closeCalendar();
                }}
                theme={{
                  backgroundColor: colors.surface,
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.textMuted,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.border,
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  textDayFontFamily: Typography.body.fontFamily,
                  textMonthFontFamily: Typography.h3.fontFamily,
                  textDayHeaderFontFamily: Typography.label.fontFamily,
                }}
                current={dueDate.toISOString().split('T')[0]}
                markedDates={{
                  [dueDate.toISOString().split('T')[0]]: { selected: true, selectedColor: colors.primary }
                }}
              />
            </Animated.View>
          </Animated.View>
        </Modal>

        {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarContainer, { alignItems: 'center', paddingVertical: Spacing.xl }]}>
            <View style={styles.successIconBg}>
              <Ionicons name="checkmark-circle" size={60} color="#10b981" />
            </View>
            <Text style={[styles.calendarTitle, { marginTop: Spacing.md, textAlign: 'center' }]}>Assignment Posted!</Text>
            <Text style={[styles.dateBtnText, { textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xl }]}>
              Students in your section will be notified.
            </Text>
            <TouchableOpacity 
              style={[styles.submitBtn, { width: '100%', marginTop: 0 }]}
              onPress={() => {
                setShowSuccessModal(false);
                router.push('/studyos/assignments' as any);
              }}
            >
              <Text style={styles.submitBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

        {/* PDF Attachment */}
        <Text style={styles.label}>Attachment (optional, max 5MB)</Text>
        <TouchableOpacity 
          style={[styles.pdfPickerBtn, fileError ? { borderColor: '#ef4444' } : null]} 
          onPress={pickPdf}
        >
          <Ionicons name="document-attach-outline" size={22} color={fileError ? '#ef4444' : colors.primary} />
          <Text style={[styles.pdfPickerText, fileError ? { color: '#ef4444' } : null]} numberOfLines={1}>
            {pdfFile ? pdfFile.name : 'Tap to attach PDF, Word, PPT, Text or Image'}
          </Text>
          {pdfFile && (
            <TouchableOpacity onPress={() => { setPdfFile(null); setFileError(''); }}>
              <Ionicons name="close-circle" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        
        {/* File Error Message */}
        {fileError ? (
          <Text style={styles.errorText}>{fileError}</Text>
        ) : null}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (saving || uploading) && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={saving || uploading}
        >
          {(saving || uploading) ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send-outline" size={20} color="#fff" />
              <Text style={styles.submitBtnText}>
                {uploading ? 'Uploading PDF...' : 'Post Assignment'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: Spacing.lg, paddingBottom: 60 },
    label: {
      fontFamily: Typography.label.fontFamily,
      color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: Spacing.md,
    },
    input: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: Radius.md, padding: 14, color: colors.text,
      fontFamily: Typography.body.fontFamily, fontSize: 15,
    },
    textArea: { minHeight: 100 },
    dateBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface,      borderWidth: 1, borderColor: colors.primary + '30',
      borderRadius: Radius.md, padding: 14,
    },
    dateBtnText: {
      fontFamily: Typography.body.fontFamily, fontSize: 15, color: colors.text,
    },
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center', padding: Spacing.md,
    },
    calendarContainer: {
      backgroundColor: colors.surface, borderRadius: Radius.lg,
      width: '100%', padding: Spacing.md, overflow: 'hidden',
    },
    calendarHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    calendarTitle: {
      fontFamily: Typography.h3.fontFamily, fontSize: 18, color: colors.text,
    },
    successIconBg: {
      backgroundColor: '#10b98115', borderRadius: 50, padding: 10,
    },
    pdfPickerBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: Radius.md, padding: 14, borderStyle: 'dashed',
    },
    pdfPickerText: {
      flex: 1, fontFamily: Typography.body.fontFamily, fontSize: 14, color: colors.text,
    },
    errorText: {
      fontFamily: Typography.label.fontFamily, fontSize: 12, color: '#ef4444',
      marginTop: 4, marginLeft: 2,
    },
    submitBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: colors.primary, paddingVertical: 16, borderRadius: Radius.full,
      marginTop: 24,
    },
    submitBtnText: {
      fontFamily: Typography.h3.fontFamily, fontSize: 16, color: '#fff',
    },
  });
}
