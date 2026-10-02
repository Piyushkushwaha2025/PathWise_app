import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
  KeyboardAvoidingView, Modal, Animated
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { uploadPdf, createAssignment, useDBProfile } from '../../../../lib/db';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useUploadStore } from '../../../../store/useUploadStore';
import { useHardwareBack } from '../../../../hooks/useHardwareBack';

const stripAllWord = (text?: string) => {
  if (!text) return '';
  return text
    .replace(/\bALL\b/gi, '')
    .replace(/[-_([/ ]*ALL[-_)/\] ]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[_-]+$/, '')
    .replace(/^[_-]+/, '')
    .trim();
};

export default function CreateAssignmentScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark);
  const router = useRouter();
  useHardwareBack('/studyos/assignments');
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const profile = useStudyOSStore((s) => s.profile);
  const activeSection = dbUser?.section_code || profile?.section || undefined;

  const userSubjects = useStudyOSStore((s) => s.subjects) || [];

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pdfFile, setPdfFile] = useState<{ uri: string; name: string; type: string; size?: number } | null>(null);
  const [fileError, setFileError] = useState<string>('');
  const [titleError, setTitleError] = useState<string>('');
  const [subjectError, setSubjectError] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Clear all form inputs helper
  const resetForm = useCallback(() => {
    setTitle('');
    setSubject('');
    setDescription('');
    setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setPdfFile(null);
    setFileError('');
    setTitleError('');
    setSubjectError('');
    setShowDatePicker(false);
    setUploading(false);
    setSaving(false);
  }, []);

  // Ensure fields are fresh and cleared every time Post Assignment screen is opened
  useFocusEffect(
    useCallback(() => {
      resetForm();
    }, [resetForm])
  );

  // Quick subject suggestions derived from user's subjects
  const quickSubjects = useMemo(() => {
    const list: string[] = [];
    userSubjects.forEach((s) => {
      const clean = stripAllWord(s.name || s.code);
      if (clean && clean.length > 2 && !list.includes(clean)) {
        list.push(clean);
      }
    });
    return list.slice(0, 6);
  }, [userSubjects]);

  // Calendar animation values
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.95));

  const openCalendar = () => {
    try { Haptics.selectionAsync(); } catch {}
    setShowDatePicker(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
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
      try { Haptics.selectionAsync(); } catch {}
      setFileError('');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      
      // Validate file size (15MB)
      if (asset.size && asset.size > 15 * 1024 * 1024) {
        setFileError('File size exceeds 15MB limit. Please choose a smaller file.');
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
        setFileError('Unsupported format. Please select a PDF, Word, PPT, Text or Image file.');
        setPdfFile(null);
        return;
      }

      setPdfFile({ 
        uri: asset.uri, 
        name: asset.name, 
        type: mimeType || 'application/octet-stream',
        size: asset.size
      });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (e) {
      setFileError('Could not select file. Please try again.');
    }
  };

  const handleSubmit = () => {
    setTitleError('');
    setSubjectError('');
    let hasError = false;

    if (!title.trim()) {
      setTitleError('Please enter an assignment title');
      hasError = true;
    }
    if (!subject.trim()) {
      setSubjectError('Please enter or select a subject');
      hasError = true;
    }

    if (hasError) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (!userId) return;

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    // Dispatch background upload without blocking the screen
    useUploadStore.getState().publishAssignmentInBackground({
      userId,
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      dueDate,
      pdfFile,
      sectionCode: activeSection,
    });

    // Immediately reset form inputs and return back to the assignments list
    resetForm();
    router.push('/studyos/assignments' as any);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Sleek Custom In-App Header — Eliminates Massive Blank Top Space */}
      <View style={styles.headerBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity 
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              router.push('/studyos/assignments' as any);
            }} 
            style={styles.headerBackBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerBarTitle}>Post Assignment</Text>
        </View>

        {activeSection ? (
          <View style={styles.headerSectionBadge}>
            <Ionicons name="school" size={13} color={colors.primary} style={{ marginRight: 5 }} />
            <Text style={styles.headerSectionText}>
              Sec {activeSection}
            </Text>
          </View>
        ) : null}
      </View>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView 
          contentContainerStyle={styles.content} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Description Note */}
          <View style={styles.infoBanner}>
            <View style={styles.infoIconBox}>
              <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoTextBox}>
              <Text style={styles.infoTitle}>Class Representative Hub</Text>
              <Text style={styles.infoSubtitle}>
                Assignments posted here appear instantly on your section's task board.
              </Text>
            </View>
          </View>

          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Assignment Title *</Text>
            <View style={[styles.inputWrapper, titleError ? styles.inputWrapperError : null]}>
              <Ionicons name="reader-outline" size={18} color={titleError ? '#ef4444' : colors.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Unit 3 Lab Report / DBMS Case Study"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={(text) => { setTitle(text); setTitleError(''); }}
              />
            </View>
            {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}
          </View>

          {/* Subject with Quick Suggestions */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Subject *</Text>
            <View style={[styles.inputWrapper, subjectError ? styles.inputWrapperError : null]}>
              <Ionicons name="book-outline" size={18} color={subjectError ? '#ef4444' : colors.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. DBMS, Operating Systems"
                placeholderTextColor={colors.textMuted}
                value={subject}
                onChangeText={(text) => { setSubject(text); setSubjectError(''); }}
              />
            </View>
            {subjectError ? <Text style={styles.errorText}>{subjectError}</Text> : null}

            {quickSubjects.length > 0 && (
              <View style={styles.chipsContainer}>
                <Text style={styles.chipsHintText}>Quick pick:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                  {quickSubjects.map((sub, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.quickChip,
                        subject.toLowerCase() === sub.toLowerCase() && styles.quickChipActive
                      ]}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        setSubject(sub);
                        setSubjectError('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text 
                        style={[
                          styles.quickChipText,
                          subject.toLowerCase() === sub.toLowerCase() && styles.quickChipTextActive
                        ]}
                      >
                        {sub}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description & Guidelines (optional)</Text>
            <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Provide instructions, format requirements, or submission guidelines..."
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Due Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Submission Deadline *</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={openCalendar} activeOpacity={0.8}>
              <View style={styles.dateLeftBox}>
                <View style={styles.calendarIconCircle}>
                  <Ionicons name="calendar" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.dateValueText}>
                    {dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <Text style={styles.dateSubtext}>Tap to choose a different date</Text>
                </View>
              </View>
              <View style={styles.changeBadge}>
                <Text style={styles.changeBadgeText}>Change</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* File Attachment Dropzone */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Reference Material / Question Paper</Text>
            <TouchableOpacity 
              style={[
                styles.attachmentDropzone, 
                pdfFile && styles.attachmentDropzoneSelected,
                fileError ? styles.attachmentDropzoneError : null
              ]} 
              onPress={pickPdf}
              activeOpacity={0.75}
            >
              {pdfFile ? (
                <View style={styles.attachedFileRow}>
                  <View style={styles.attachedFileIconBox}>
                    <Ionicons name="document-text" size={24} color="#3b82f6" />
                  </View>
                  <View style={styles.attachedFileInfo}>
                    <Text style={styles.attachedFileName} numberOfLines={1}>{pdfFile.name}</Text>
                    <Text style={styles.attachedFileSize}>
                      {formatFileSize(pdfFile.size) ? `${formatFileSize(pdfFile.size)} • Ready to upload` : 'Ready to upload'}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    onPress={(e) => {
                      e.stopPropagation();
                      try { Haptics.selectionAsync(); } catch {}
                      setPdfFile(null);
                      setFileError('');
                    }}
                    style={styles.removeFileBtn}
                  >
                    <Ionicons name="close-circle" size={22} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.dropzonePlaceholder}>
                  <View style={styles.cloudIconBox}>
                    <Ionicons name="cloud-upload-outline" size={26} color={colors.primary} />
                  </View>
                  <Text style={styles.dropzoneTitle}>Attach File (PDF, Docs, PPT, Images)</Text>
                  <Text style={styles.dropzoneSubtext}>Maximum file size 15MB</Text>
                </View>
              )}
            </TouchableOpacity>
            {fileError ? <Text style={styles.errorText}>{fileError}</Text> : null}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, (saving || uploading) && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={saving || uploading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.primary, colors.accent || colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitBtnGradient}
            >
              {(saving || uploading) ? (
                <View style={styles.submittingRow}>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.submitBtnText}>
                    {uploading ? 'Uploading Attachment...' : 'Publishing Task...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.submittingRow}>
                  <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Publish Assignment</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Calendar Modal */}
      <Modal visible={showDatePicker} transparent animationType="none">
        <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
          <Animated.View style={[styles.calendarContainer, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.calendarHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.calendarTitle}>Select Due Date</Text>
              </View>
              <TouchableOpacity onPress={closeCalendar} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Calendar
              minDate={new Date().toISOString().split('T')[0]}
              onDayPress={(day: any) => {
                try { Haptics.selectionAsync(); } catch {}
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
                textDisabledColor: isDark ? '#444' : '#ccc',
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
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-done" size={44} color="#10b981" />
            </View>
            <Text style={styles.successTitle}>Assignment Published!</Text>
            <Text style={styles.successSubtitle}>
              Students in Section {userSubjects[0]?.code ? '' : ''} can now view the deadline and attachment.
            </Text>
            <TouchableOpacity 
              style={styles.successCtaBtn}
              activeOpacity={0.85}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setShowSuccessModal(false);
                router.push('/studyos/assignments' as any);
              }}
            >
              <Text style={styles.successCtaBtnText}>View in Task Board</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function useStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerBarTitle: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 18,
      color: colors.text,
      fontWeight: '700',
    },
    headerBackBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    headerSectionBadge: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.primary + '18',
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: Radius.full,
      borderWidth: 1, borderColor: colors.primary + '35',
    },
    headerSectionText: {
      color: colors.primary,
      fontFamily: Typography.h3.fontFamily,
      fontSize: 12,
    },
    content: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: 60,
    },
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '12',
      borderWidth: 1,
      borderColor: colors.primary + '30',
      borderRadius: Radius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
    },
    infoIconBox: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: colors.primary + '20',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 12,
    },
    infoTextBox: { flex: 1 },
    infoTitle: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
      color: colors.primary,
      marginBottom: 2,
    },
    infoSubtitle: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    inputGroup: {
      marginBottom: Spacing.md + 2,
    },
    label: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 13,
      color: colors.text,
      marginBottom: 8,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      paddingHorizontal: 14,
    },
    inputWrapperError: {
      borderColor: '#ef4444',
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontFamily: Typography.body.fontFamily,
      fontSize: 15,
      paddingVertical: 14,
    },
    textAreaWrapper: {
      alignItems: 'flex-start',
      paddingVertical: 4,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    chipsContainer: {
      marginTop: 10,
    },
    chipsHintText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 11,
      color: colors.textMuted,
      marginBottom: 6,
    },
    chipsScroll: {
      flexDirection: 'row',
      gap: 8,
    },
    quickChip: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
    },
    quickChipActive: {
      backgroundColor: colors.primary + '20',
      borderColor: colors.primary,
    },
    quickChipText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    quickChipTextActive: {
      fontFamily: Typography.h3.fontFamily,
      color: colors.primary,
    },
    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      padding: Spacing.md,
    },
    dateLeftBox: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    calendarIconCircle: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.primary + '15',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 12,
    },
    dateValueText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 15,
      color: colors.text,
      marginBottom: 2,
    },
    dateSubtext: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    changeBadge: {
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
    },
    changeBadgeText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 11,
      color: colors.primary,
    },
    attachmentDropzone: {
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: Radius.lg,
      padding: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachmentDropzoneSelected: {
      borderStyle: 'solid',
      borderColor: '#3b82f650',
      backgroundColor: '#3b82f608',
    },
    attachmentDropzoneError: {
      borderColor: '#ef4444',
    },
    dropzonePlaceholder: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    cloudIconBox: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: colors.primary + '15',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 8,
    },
    dropzoneTitle: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
      color: colors.text,
      marginBottom: 3,
    },
    dropzoneSubtext: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    attachedFileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
    },
    attachedFileIconBox: {
      width: 40, height: 40, borderRadius: Radius.md,
      backgroundColor: '#3b82f615',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 12,
    },
    attachedFileInfo: { flex: 1, marginRight: 8 },
    attachedFileName: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
      color: colors.text,
      marginBottom: 2,
    },
    attachedFileSize: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    removeFileBtn: {
      padding: 6,
    },
    errorText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 12,
      color: '#ef4444',
      marginTop: 6,
      marginLeft: 4,
    },
    submitBtn: {
      borderRadius: Radius.full,
      overflow: 'hidden',
      marginTop: Spacing.lg,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    submitBtnGradient: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submittingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 16,
      color: '#fff',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.lg,
    },
    calendarContainer: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      width: '100%',
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    },
    calendarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    calendarTitle: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 16,
      color: colors.text,
    },
    modalCloseBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.surfaceHigh,
      alignItems: 'center', justifyContent: 'center',
    },
    successCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      width: '100%',
      padding: Spacing.xl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
      elevation: 8,
    },
    successIconCircle: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: '#10b98118',
      borderWidth: 1, borderColor: '#10b98140',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    successTitle: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 20,
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    successSubtitle: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: Spacing.xl,
    },
    successCtaBtn: {
      width: '100%',
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successCtaBtnText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 15,
      color: '#fff',
    },
  });
}
