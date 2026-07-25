import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';

const ASSIGNMENTS_JSON_URL = "https://raw.githubusercontent.com/Piyushkushwaha2025/PathWise_app/master/assignments.json";
const COMPLETED_STORAGE_KEY = "pathwise_completed_assignments";

export default function AssignmentsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  
  const [assignments, setAssignments] = useState<any[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted'>('pending');

  const fetchAssignments = async () => {
    try {
      // 1. Fetch completed IDs from local storage
      const stored = await AsyncStorage.getItem(COMPLETED_STORAGE_KEY);
      if (stored) setCompletedIds(JSON.parse(stored));

      // 2. Fetch assignments from GitHub
      const res = await fetch(`${ASSIGNMENTS_JSON_URL}?t=${Date.now()}`); // Cache bust
      if (!res.ok) {
         throw new Error(`Failed to load JSON from GitHub. Status: ${res.status}`);
      }
      
      const data = await res.json();
      setAssignments(data);
      
      // Schedule Due Date Notifications
      for (const asg of data) {
         if (!completedIds.includes(asg.id)) {
            const dueDate = new Date(asg.dueDate);
            const triggerTime = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000); // 24h before
            
            if (triggerTime > new Date()) {
               await Notifications.scheduleNotificationAsync({
                  identifier: `asg_due_${asg.id}`,
                  content: {
                     title: 'Assignment Due Tomorrow!',
                     body: `"${asg.title}" for ${asg.subject} is due tomorrow. Don't forget!`,
                     sound: true,
                  },
                  trigger: { date: triggerTime, type: 'calendar' } as any,
               });
            }
         } else {
            // Cancel if already completed
            await Notifications.cancelScheduledNotificationAsync(`asg_due_${asg.id}`);
         }
      }
      
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error fetching assignments", error?.message || String(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const toggleSubmission = async (id: string, currentStatus: string) => {
    try {
      let newCompletedIds = [...completedIds];
      
      if (currentStatus === 'pending') {
         newCompletedIds.push(id);
      } else {
         newCompletedIds = newCompletedIds.filter(cid => cid !== id);
      }
      
      setCompletedIds(newCompletedIds);
      await AsyncStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(newCompletedIds));
    } catch (error) {
      console.error("Error saving status", error);
    }
  };

  // Merge the JSON data with the local completion status
  const assignmentsWithStatus = assignments.map(a => ({
     ...a,
     status: completedIds.includes(a.id) ? 'submitted' : 'pending'
  }));

  const filteredAssignments = assignmentsWithStatus.filter(a => a.status === activeTab);

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{
          headerShown: true,
          title: "Assignments",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'submitted' && styles.activeTab]}
          onPress={() => setActiveTab('submitted')}
        >
          <Text style={[styles.tabText, activeTab === 'submitted' && styles.activeTabText]}>Submitted</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAssignments(); }} />}
        >
          {filteredAssignments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>No {activeTab} assignments!</Text>
            </View>
          ) : (
            filteredAssignments.map((item) => {
              const dueDate = new Date(item.dueDate);
              const isOverdue = activeTab === 'pending' && dueDate < new Date();
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.subjectBadge}>{item.subject}</Text>
                    <Text style={[styles.dateText, isOverdue && { color: '#ef4444' }]}>
                      {isOverdue ? 'Overdue: ' : 'Due: '} {dueDate.toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                  
                  <TouchableOpacity 
                    style={[styles.submitBtn, activeTab === 'submitted' && styles.submitBtnDone]}
                    onPress={() => toggleSubmission(item.id, item.status)}
                  >
                    <Ionicons 
                      name={activeTab === 'submitted' ? "checkmark-circle" : "ellipse-outline"} 
                      size={20} 
                      color={activeTab === 'submitted' ? "#fff" : colors.primary} 
                    />
                    <Text style={[styles.submitBtnText, activeTab === 'submitted' && { color: '#fff' }]}>
                      {activeTab === 'submitted' ? "Mark as Pending" : "Mark as Done"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: Spacing.sm,
      alignItems: 'center',
      borderRadius: Radius.sm,
    },
    activeTab: {
      backgroundColor: colors.surface,
    },
    tabText: {
      fontFamily: Typography.label.fontFamily,
      color: colors.textMuted,
    },
    activeTabText: {
      color: colors.primary,
      fontFamily: Typography.h3.fontFamily,
    },
    scrollContent: {
      padding: Spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      padding: Spacing.md,
      borderRadius: Radius.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.xs,
    },
    subjectBadge: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 12,
      color: colors.primary,
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
    },
    dateText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    title: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 16,
      color: colors.text,
      marginBottom: 4,
    },
    description: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: Spacing.md,
    },
    submitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: Radius.sm,
      backgroundColor: colors.primary + '15',
      gap: 8,
    },
    submitBtnDone: {
      backgroundColor: '#10b981',
    },
    submitBtnText: {
      fontFamily: Typography.label.fontFamily,
      color: colors.primary,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 80,
    },
    emptyText: {
      fontFamily: Typography.label.fontFamily,
      color: colors.textMuted,
      fontSize: 16,
      marginTop: 16,
    }
  });
}
