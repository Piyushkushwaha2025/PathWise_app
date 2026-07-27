import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { uploadPdf, createAssignment } from '../../../../lib/db';

export default function CreateAssignmentScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { userId } = useAuth();

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pdfFile, setPdfFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 5 * 1024 * 1024) {
        Alert.alert('File too large', 'Please select a file smaller than 5MB.');
        return;
      }
      setPdfFile({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/pdf' });
    } catch (e) {
      Alert.alert('Error', 'Could not pick file.');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !subject.trim()) {
      Alert.alert('Required', 'Title and Subject are required.');
      return;
    }
    if (!userId) return;

    try {
      setSaving(true);
      let pdf_url: string | undefined;
      let pdf_filename: string | undefined;

      if (pdfFile) {
        setUploading(true);
        const uploaded = await uploadPdf(userId, pdfFile);
        pdf_url = uploaded.pdf_url;
        pdf_filename = uploaded.pdf_filename;
        setUploading(false);
      }

      await createAssignment(userId, {
        title: title.trim(),
        subject: subject.trim(),
        description: description.trim(),
        dueDate: dueDate.toISOString(),
        pdf_url,
        pdf_filename,
      });

      Alert.alert('✅ Assignment Posted!', 'Students in your section will be notified.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
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
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        {/* Title */}
        <Text style={styles.label}>Assignment Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Unit 2 Notes Submission"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        {/* Subject */}
        <Text style={styles.label}>Subject *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. DBMS, Data Structures"
          placeholderTextColor={colors.textMuted}
          value={subject}
          onChangeText={setSubject}
        />

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
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={styles.dateBtnText}>{dueDate.toDateString()}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={dueDate}
            mode="date"
            minimumDate={new Date()}
            onChange={(_, date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (date) setDueDate(date);
            }}
          />
        )}

        {/* PDF Attachment */}
        <Text style={styles.label}>Attachment (optional, max 5MB)</Text>
        <TouchableOpacity style={styles.pdfPickerBtn} onPress={pickPdf}>
          <Ionicons name="document-attach-outline" size={22} color={colors.primary} />
          <Text style={styles.pdfPickerText} numberOfLines={1}>
            {pdfFile ? pdfFile.name : 'Tap to attach PDF or Word file'}
          </Text>
          {pdfFile && (
            <TouchableOpacity onPress={() => setPdfFile(null)}>
              <Ionicons name="close-circle" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

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
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: Radius.md, padding: 14,
    },
    dateBtnText: { fontFamily: Typography.body.fontFamily, color: colors.text, fontSize: 15 },
    pdfPickerBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderWidth: 1,
      borderColor: colors.primary + '50', borderRadius: Radius.md,
      padding: 14, borderStyle: 'dashed',
    },
    pdfPickerText: {
      flex: 1, color: colors.text,
      fontFamily: Typography.body.fontFamily, fontSize: 14,
    },
    submitBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, backgroundColor: colors.primary, borderRadius: Radius.md,
      padding: 16, marginTop: Spacing.xl,
    },
    submitBtnText: {
      color: '#fff', fontFamily: Typography.h3.fontFamily, fontSize: 16,
    },
  });
}
