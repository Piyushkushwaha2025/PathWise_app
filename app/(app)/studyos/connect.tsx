import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { GraduationCap } from 'lucide-react-native';
import { GlassCard } from '../../../components/ui/GlassCard';

export default function ConnectScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>StudyOS</Text>
      </View>
      
      <View style={styles.content}>
        <GraduationCap size={80} color={Colors.primary} style={styles.icon} />
        
        <Text style={styles.title}>Connect Your CU Account</Text>
        <Text style={styles.subtitle}>
          StudyOS needs to securely connect to the CU Portal to fetch your subjects, attendance, timetable, and marks.
        </Text>
        
        <GlassCard style={styles.card}>
          <Text style={styles.cardText}>
            🔒 We never store your password. We only use it once to generate secure session tokens which are stored safely on your device.
          </Text>
        </GlassCard>

        <TouchableOpacity 
          style={styles.button}
          activeOpacity={0.8}
          onPress={() => router.push('/(app)/studyos/webview-login')}
        >
          <Text style={styles.buttonText}>Login with CU Portal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    paddingTop: 20,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.text,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textDim,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  card: {
    marginBottom: Spacing.xxl,
    padding: Spacing.lg,
  },
  cardText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    ...Typography.h3,
    color: '#FFFFFF',
  },
});
