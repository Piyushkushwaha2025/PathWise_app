import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { CenterPopModal } from '../ui/CenterPopModal';
import { useThemeStore } from '../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../constants/theme';

const ASSIGNMENTS_JSON_URL = "https://raw.githubusercontent.com/Piyushkushwaha2025/PathWise_app/master/assignments.json";

export default function NewAssignmentNotification() {
  const [isVisible, setIsVisible] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const colors = useThemeStore((s) => s.colors);
  const router = useRouter();

  useEffect(() => {
    const checkForAssignments = async () => {
      try {
        const res = await fetch(`${ASSIGNMENTS_JSON_URL}?t=${Date.now()}`);
        if (res.ok) {
          const assignments = await res.json();
          const storedCountStr = await AsyncStorage.getItem("pathwise_assignments_count");
          const storedCount = storedCountStr ? parseInt(storedCountStr, 10) : 0;

          if (assignments.length > storedCount) {
            setNewCount(assignments.length - storedCount);
            setIsVisible(true);
            await AsyncStorage.setItem("pathwise_assignments_count", assignments.length.toString());
          }
        }
      } catch (e) {
        console.warn("Failed to check new assignments", e);
      }
    };

    checkForAssignments();
  }, []);

  if (!isVisible) return null;

  return (
    <CenterPopModal isVisible={isVisible} onClose={() => setIsVisible(false)}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary + '30' }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
          <Ionicons name="clipboard" size={40} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text, fontFamily: Typography.h2.fontFamily }]}>
          New Assignment{newCount > 1 ? 's' : ''}!
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: Typography.body.fontFamily }]}>
          You have {newCount} new assignment{newCount > 1 ? 's' : ''} waiting for you in StudyOS.
        </Text>
        
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => {
            setIsVisible(false);
            router.push('/studyos/assignments' as any);
          }}
        >
          <Text style={[styles.buttonText, { fontFamily: Typography.h3.fontFamily }]}>View Assignment</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => setIsVisible(false)}
        >
          <Text style={[styles.dismissText, { color: colors.textMuted, fontFamily: Typography.label.fontFamily }]}>
            Dismiss
          </Text>
        </TouchableOpacity>
      </View>
    </CenterPopModal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 22,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: Radius.md,
    width: '100%',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  dismissButton: {
    paddingVertical: 8,
  },
  dismissText: {
    fontSize: 14,
  },
});
