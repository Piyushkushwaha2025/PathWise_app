import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, Platform
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { fetchAssignments, toggleAssignment, deleteAssignment, useDBProfile, AssignmentData } from '../../../../lib/db';
import { useStudyOSStore } from '../../../../store/studyosStore';
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

const formatDueDate = (dateStr: string) => {
  const due = new Date(dateStr);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    return { text: `${daysAgo}d overdue`, isOverdue: true, isUrgent: false };
  } else if (diffDays === 0) {
    return { text: 'Due today', isOverdue: false, isUrgent: true };
  } else if (diffDays === 1) {
    return { text: 'Due tomorrow', isOverdue: false, isUrgent: true };
  } else if (diffDays <= 2) {
    return { text: `Due in ${diffDays}d`, isOverdue: false, isUrgent: true };
  } else {
    return {
      text: `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      isOverdue: false,
      isUrgent: false,
    };
  }
};

export default function AssignmentsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark);
  const router = useRouter();
  useHardwareBack('/studyos');

  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const profile = useStudyOSStore((s) => s.profile);

  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted'>('pending');

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<AssignmentData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isCR = dbUser?.role === 'cr' || dbUser?.role === 'admin';
  const isCSE = profile?.course?.toLowerCase().includes('cse') || profile?.course?.toLowerCase().includes('computer science');
  
  // Use CR's assigned section, or student's scraped section
  const activeSection = dbUser?.section_code || profile?.section || null;

  const loadAssignments = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchAssignments(userId, activeSection || undefined);
      setAssignments(data);
    } catch (e) {
      console.error('Failed to load assignments', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, activeSection]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const handleToggle = async (assignment: AssignmentData) => {
    if (!userId) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    const newStatus = await toggleAssignment(userId, assignment._id);
    setAssignments(prev =>
      prev.map(a => a._id === assignment._id ? { ...a, status: newStatus } : a)
    );
  };

  const handleDelete = (assignment: AssignmentData) => {
    try { Haptics.selectionAsync(); } catch {}
    setAssignmentToDelete(assignment);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!userId || !assignmentToDelete) return;
    try {
      setDeleting(true);
      await deleteAssignment(userId, assignmentToDelete._id);
      setAssignments(prev => prev.filter(a => a._id !== assignmentToDelete._id));
      setDeleteModalVisible(false);
      setAssignmentToDelete(null);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (e) {
      Alert.alert('Error', 'Failed to delete assignment');
    } finally {
      setDeleting(false);
    }
  };

  const pendingCount = useMemo(() => assignments.filter(a => a.status === 'pending').length, [assignments]);
  const submittedCount = useMemo(() => assignments.filter(a => a.status === 'submitted').length, [assignments]);
  const totalCount = assignments.length;
  const progressPercent = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;

  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => a.status === activeTab);
  }, [assignments, activeTab]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Dedicated In-App Header */}
      <View style={styles.headerBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity 
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              router.navigate('/studyos' as any);
            }} 
            style={styles.headerBackBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerBarTitle}>Assignments</Text>
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

      {/* Show error if not CSE and not CR */}
      {!loading && !isCSE && !isCR && !activeSection && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="people-outline" size={38} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Section Not Configured</Text>
          <Text style={styles.emptySubtitle}>
            Assignments are currently synchronized for CSE department students.
          </Text>
        </View>
      )}

      {/* No section scraped prompt for CSE students */}
      {!loading && isCSE && !isCR && !activeSection && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="sync-outline" size={38} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Section Not Found</Text>
          <Text style={styles.emptySubtitle}>
            We couldn't detect your section. Please re-login in StudyOS to fetch your class section.
          </Text>
        </View>
      )}

      {activeSection && (isCSE || isCR) && (
        <>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={() => { setRefreshing(true); loadAssignments(); }} 
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            {/* Overview Hero Console Banner */}
            <View style={styles.heroCardContainer}>
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(59, 130, 246, 0.16)', 'rgba(139, 92, 246, 0.06)']
                    : ['rgba(37, 99, 235, 0.10)', 'rgba(124, 58, 237, 0.03)']
                }
                style={styles.heroGradient}
              >
                <View style={styles.heroTopRow}>
                  <View style={styles.heroTitleBox}>
                    <View style={styles.heroBadgeRow}>
                      <View style={styles.liveIndicatorDot} />
                      <Text style={styles.heroBadgeText}>LIVE SECTION SYNC</Text>
                    </View>
                    <Text style={styles.heroTitle}>Tasks & Submissions</Text>
                    <Text style={styles.heroSubtitle}>
                      {pendingCount === 0 && totalCount > 0
                        ? '🎉 All caught up! No pending deadlines'
                        : `${pendingCount} pending task${pendingCount === 1 ? '' : 's'} remaining`}
                    </Text>
                  </View>

                  <View style={styles.progressCircleBox}>
                    <Text style={styles.progressPercentText}>{progressPercent}%</Text>
                    <Text style={styles.progressPercentLabel}>DONE</Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${Math.max(progressPercent, 4)}%` }]} />
                </View>

                {/* Metric Strip */}
                <View style={styles.metricStrip}>
                  <View style={styles.metricItem}>
                    <View style={[styles.metricDot, { backgroundColor: colors.warning || '#f59e0b' }]} />
                    <Text style={styles.metricLabel}>Pending: </Text>
                    <Text style={[styles.metricValue, { color: colors.warning || '#f59e0b' }]}>{pendingCount}</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <View style={[styles.metricDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.metricLabel}>Submitted: </Text>
                    <Text style={[styles.metricValue, { color: '#10b981' }]}>{submittedCount}</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Ionicons name="documents-outline" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
                    <Text style={styles.metricLabel}>Total: </Text>
                    <Text style={styles.metricValue}>{totalCount}</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* Segmented Tab Bar */}
            <View style={styles.segmentedContainer}>
              <TouchableOpacity
                style={[styles.segmentBtn, activeTab === 'pending' && styles.segmentBtnActive]}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setActiveTab('pending');
                }}
                activeOpacity={0.8}
              >
                <Ionicons 
                  name="time-outline" 
                  size={16} 
                  color={activeTab === 'pending' ? (isDark ? '#fff' : colors.primary) : colors.textMuted} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={[styles.segmentText, activeTab === 'pending' && styles.segmentTextActive]}>
                  Pending ({pendingCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentBtn, activeTab === 'submitted' && styles.segmentBtnActive]}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setActiveTab('submitted');
                }}
                activeOpacity={0.8}
              >
                <Ionicons 
                  name="checkmark-circle-outline" 
                  size={16} 
                  color={activeTab === 'submitted' ? (isDark ? '#fff' : '#10b981') : colors.textMuted} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={[styles.segmentText, activeTab === 'submitted' && styles.segmentTextActive]}>
                  Submitted ({submittedCount})
                </Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loaderText}>Syncing section tasks...</Text>
              </View>
            ) : filteredAssignments.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIconCircle, activeTab === 'submitted' ? { backgroundColor: '#10b98115' } : null]}>
                  <Ionicons 
                    name={activeTab === 'submitted' ? "folder-open-outline" : "sparkles"} 
                    size={36} 
                    color={activeTab === 'submitted' ? '#10b981' : colors.primary} 
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'pending' ? 'All Tasks Completed!' : 'No Submitted Assignments'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeTab === 'pending'
                    ? 'You have finished all assignments posted for your section. Great job!'
                    : 'Assignments you mark as done will show up here for your records.'}
                </Text>
                {isCR && activeTab === 'pending' && (
                  <TouchableOpacity
                    style={styles.emptyCtaBtn}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      router.push('/studyos/assignments/create' as any);
                    }}
                  >
                    <Ionicons name="add-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.emptyCtaText}>Post First Assignment</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.cardsList}>
                {filteredAssignments.map((item) => {
                  const dueInfo = formatDueDate(item.dueDate);
                  const isSubmitted = activeTab === 'submitted';

                  return (
                    <View 
                      key={item._id} 
                      style={[
                        styles.card,
                        dueInfo.isOverdue && !isSubmitted && styles.cardOverdue,
                        dueInfo.isUrgent && !isSubmitted && styles.cardUrgent,
                        isSubmitted && styles.cardSubmitted,
                      ]}
                    >
                      {/* Card Header: Subject Tag & Urgency Badge */}
                      <View style={styles.cardHeader}>
                        <View style={styles.subjectPill}>
                          <Ionicons name="book-outline" size={13} color={colors.primary} style={{ marginRight: 5 }} />
                          <Text style={styles.subjectPillText} numberOfLines={1}>
                            {stripAllWord(item.subject)}
                          </Text>
                        </View>

                        {isSubmitted ? (
                          <View style={styles.doneStatusPill}>
                            <Ionicons name="checkmark-circle" size={13} color="#10b981" style={{ marginRight: 4 }} />
                            <Text style={styles.doneStatusText}>Completed</Text>
                          </View>
                        ) : dueInfo.isOverdue ? (
                          <View style={styles.overdueStatusPill}>
                            <Ionicons name="alert-circle" size={13} color="#ef4444" style={{ marginRight: 4 }} />
                            <Text style={styles.overdueStatusText}>{dueInfo.text}</Text>
                          </View>
                        ) : dueInfo.isUrgent ? (
                          <View style={styles.urgentStatusPill}>
                            <Ionicons name="flame" size={13} color="#f59e0b" style={{ marginRight: 4 }} />
                            <Text style={styles.urgentStatusText}>{dueInfo.text}</Text>
                          </View>
                        ) : (
                          <View style={styles.normalDatePill}>
                            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
                            <Text style={styles.normalDateText}>{dueInfo.text}</Text>
                          </View>
                        )}
                      </View>

                      {/* Title & Description */}
                      <Text style={[styles.title, isSubmitted && styles.titleDone]}>
                        {item.title}
                      </Text>
                      {!!item.description && (
                        <Text style={styles.description} numberOfLines={3}>
                          {item.description}
                        </Text>
                      )}

                      {/* PDF Attachment Capsule */}
                      {item.pdf_download_url && (
                        <TouchableOpacity
                          style={styles.pdfAttachmentCapsule}
                          onPress={() => {
                            try { Haptics.selectionAsync(); } catch {}
                            Linking.openURL(item.pdf_download_url!);
                          }}
                          activeOpacity={0.75}
                        >
                          <View style={styles.pdfIconCircle}>
                            <Ionicons name="document-text" size={16} color="#3b82f6" />
                          </View>
                          <View style={styles.pdfInfoColumn}>
                            <Text style={styles.pdfNameText} numberOfLines={1}>
                              {item.pdf_filename || 'Assignment Document.pdf'}
                            </Text>
                            <Text style={styles.pdfSubtext}>Tap to open / download</Text>
                          </View>
                          <View style={styles.pdfDownloadIconBox}>
                            <Ionicons name="download-outline" size={16} color="#3b82f6" />
                          </View>
                        </TouchableOpacity>
                      )}

                      {/* Actions Footer */}
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={[
                            styles.toggleActionBtn,
                            isSubmitted ? styles.toggleBtnPending : styles.toggleBtnDone
                          ]}
                          onPress={() => handleToggle(item)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={isSubmitted ? 'refresh-outline' : 'checkmark-circle'}
                            size={18}
                            color={isSubmitted ? colors.textMuted : '#fff'}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={[styles.toggleBtnText, isSubmitted && { color: colors.textMuted }]}>
                            {isSubmitted ? 'Mark as Incomplete' : 'Mark as Done'}
                          </Text>
                        </TouchableOpacity>

                        {/* CR Delete Action */}
                        {isCR && item.created_by === userId && (
                          <TouchableOpacity 
                            style={styles.deleteIconButton} 
                            onPress={() => handleDelete(item)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Bottom Spacer */}
            <View style={{ height: 80 }} />
          </ScrollView>

          {/* CR Floating Post Button */}
          {isCR && (
            <View style={styles.fabContainer}>
              <TouchableOpacity
                style={styles.fabButton}
                activeOpacity={0.85}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  router.push('/studyos/assignments/create' as any);
                }}
              >
                <LinearGradient
                  colors={[colors.primary, colors.accent || colors.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.fabGradient}
                >
                  <Ionicons name="add-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.fabText}>Post Assignment</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalWarningIconBox}>
              <Ionicons name="trash" size={32} color="#ef4444" />
            </View>
            <Text style={styles.modalTitle}>Delete Assignment?</Text>
            <Text style={styles.modalSubText}>
              Are you sure you want to remove "{assignmentToDelete?.title}"? This assignment will be removed for all students in Section {activeSection}.
            </Text>
            
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setAssignmentToDelete(null);
                }}
                disabled={deleting}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalDeleteBtn, deleting && { opacity: 0.6 }]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalDeleteBtnText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
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
    scrollContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
    },
    heroCardContainer: {
      borderRadius: Radius.xl,
      overflow: 'hidden',
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceHigh,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    heroGradient: {
      padding: Spacing.md + 2,
    },
    heroTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    heroTitleBox: { flex: 1, marginRight: 12 },
    heroBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    liveIndicatorDot: {
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: '#10b981',
      marginRight: 6,
    },
    heroBadgeText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 10,
      letterSpacing: 1,
      color: colors.primary,
    },
    heroTitle: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 20,
      color: colors.text,
      marginBottom: 3,
    },
    heroSubtitle: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
    },
    progressCircleBox: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.primary + '40',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 64,
    },
    progressPercentText: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 18,
      color: colors.primary,
    },
    progressPercentLabel: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 9,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    progressBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
      marginBottom: Spacing.md,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: '#10b981',
    },
    metricStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.6)',
      paddingHorizontal: Spacing.sm + 4,
      paddingVertical: Spacing.xs + 4,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metricItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metricDot: {
      width: 7, height: 7, borderRadius: 4, marginRight: 5,
    },
    metricLabel: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    metricValue: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 13,
      color: colors.text,
    },
    metricDivider: {
      width: 1, height: 14,
      backgroundColor: colors.border,
    },
    segmentedContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.full,
      padding: 4,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: Radius.full,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? colors.surface : '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    segmentText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
    },
    segmentTextActive: {
      fontFamily: Typography.h3.fontFamily,
      color: colors.text,
    },
    cardsList: {
      gap: Spacing.md,
    },
    card: {
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    cardOverdue: {
      borderColor: '#ef444460',
      borderLeftWidth: 4,
      borderLeftColor: '#ef4444',
    },
    cardUrgent: {
      borderColor: '#f59e0b60',
      borderLeftWidth: 4,
      borderLeftColor: '#f59e0b',
    },
    cardSubmitted: {
      borderColor: '#10b98140',
      opacity: 0.92,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    subjectPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.full,
      maxWidth: '60%',
    },
    subjectPillText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 11,
      color: colors.primary,
      textTransform: 'uppercase',
    },
    doneStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#10b98118',
      borderWidth: 1,
      borderColor: '#10b98140',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    doneStatusText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 11,
      color: '#10b981',
    },
    overdueStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#ef444418',
      borderWidth: 1,
      borderColor: '#ef444440',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    overdueStatusText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 11,
      color: '#ef4444',
    },
    urgentStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f59e0b18',
      borderWidth: 1,
      borderColor: '#f59e0b40',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    urgentStatusText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 11,
      color: '#f59e0b',
    },
    normalDatePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    normalDateText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 11,
      color: colors.textMuted,
    },
    title: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 16,
      color: colors.text,
      marginBottom: 6,
      lineHeight: 22,
    },
    titleDone: {
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    description: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 12,
    },
    pdfAttachmentCapsule: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#3b82f612',
      borderWidth: 1,
      borderColor: '#3b82f635',
      borderRadius: Radius.md,
      padding: 10,
      marginBottom: 12,
    },
    pdfIconCircle: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: '#3b82f620',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 10,
    },
    pdfInfoColumn: { flex: 1, marginRight: 8 },
    pdfNameText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 13,
      color: '#3b82f6',
      marginBottom: 2,
    },
    pdfSubtext: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 11,
      color: colors.textMuted,
    },
    pdfDownloadIconBox: {
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#3b82f615',
    },
    cardActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 2,
    },
    toggleActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: Radius.md,
    },
    toggleBtnDone: {
      backgroundColor: '#10b981',
      shadowColor: '#10b981',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 2,
    },
    toggleBtnPending: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleBtnText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 13,
      color: '#fff',
    },
    deleteIconButton: {
      width: 40, height: 40, borderRadius: Radius.md,
      backgroundColor: '#ef444415',
      borderWidth: 1, borderColor: '#ef444430',
      alignItems: 'center', justifyContent: 'center',
    },
    fabContainer: {
      position: 'absolute',
      bottom: 24,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabButton: {
      borderRadius: Radius.full,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    fabGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 22,
      paddingVertical: 13,
      borderRadius: Radius.full,
    },
    fabText: {
      color: '#fff',
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
    },
    loaderBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    loaderText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 12,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: colors.primary + '15',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 16,
      borderWidth: 1, borderColor: colors.primary + '30',
    },
    emptyTitle: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 18,
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    emptyCtaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: Radius.full,
      marginTop: 20,
    },
    emptyCtaText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
      color: '#fff',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    modalCard: {
      backgroundColor: colors.surface,
      width: '100%',
      borderRadius: Radius.xl,
      padding: Spacing.lg,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    },
    modalWarningIconBox: {
      width: 60, height: 60, borderRadius: 30,
      backgroundColor: '#ef444415',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: Spacing.md,
      borderWidth: 1, borderColor: '#ef444430',
    },
    modalTitle: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 19,
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    modalSubText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: Spacing.lg,
    },
    modalButtonsRow: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalCancelBtnText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
      color: colors.text,
    },
    modalDeleteBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ef4444',
      shadowColor: '#ef4444',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    modalDeleteBtnText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
      color: '#fff',
    },
  });
}
