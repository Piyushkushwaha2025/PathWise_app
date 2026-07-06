import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSubjects } from '../../../../hooks/useSubjects';
import { useMarks } from '../../../../hooks/useMarks';
import { Colors, Typography, Spacing } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { MoodleCourse } from '../../../../lib/moodleApi';

function SubjectMarksCard({ course }: { course: MoodleCourse }) {
  const { data: marks, isLoading } = useMarks(course.id);
  const [expanded, setExpanded] = React.useState(false);

  // Calculate overall score % based on available marks
  let totalObtained = 0;
  let totalMax = 0;
  
  if (marks) {
    marks.forEach(m => {
      if (m.grade !== '-' && !isNaN(parseFloat(m.grade))) {
        totalObtained += parseFloat(m.grade);
        totalMax += m.grademax;
      }
    });
  }
  
  const overallPercentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : 'N/A';

  return (
    <GlassCard style={styles.card} onPress={() => setExpanded(!expanded)}>
      <View style={styles.cardHeader}>
        <Text style={styles.subjectName}>{course.fullname}</Text>
        <Text style={styles.overallScore}>{overallPercentage}%</Text>
      </View>

      {expanded && (
        <View style={styles.expandedContent}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : marks && marks.length > 0 ? (
            marks.map((mark, index) => {
              const isAbsent = mark.grade === '-';
              const obtained = isAbsent ? 0 : parseFloat(mark.grade);
              const percentage = isAbsent ? 0 : (obtained / mark.grademax) * 100;
              
              let dotColor = Colors.error;
              if (percentage >= 70) dotColor = Colors.success;
              else if (percentage >= 50) dotColor = '#f59e0b'; // orange

              return (
                <View key={index} style={styles.markRow}>
                  <View style={styles.markLeft}>
                    <View style={[styles.dot, { backgroundColor: dotColor }]} />
                    <Text style={styles.markItemName}>{mark.itemname}</Text>
                  </View>
                  {isAbsent ? (
                    <View style={styles.absentBadge}>
                      <Text style={styles.absentText}>Absent</Text>
                    </View>
                  ) : (
                    <Text style={styles.markScore}>{mark.grade} / {mark.grademax}</Text>
                  )}
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No marks available yet.</Text>
          )}
        </View>
      )}
    </GlassCard>
  );
}

export default function MarksScreen() {
  const { data: subjects, isLoading, error } = useSubjects();
  const router = useRouter();

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading subjects...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Marks & Grades</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/studyos/marks/cgpa')}>
          <Text style={styles.cgpaText}>CGPA Target</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={subjects}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <SubjectMarksCard course={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...Typography.body, color: Colors.textDim, marginTop: Spacing.md },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, paddingTop: 40, backgroundColor: Colors.surface,
  },
  headerTitle: { ...Typography.h3, color: Colors.text },
  backBtn: { padding: Spacing.sm },
  backText: { color: Colors.primary, fontSize: 16 },
  cgpaText: { color: Colors.primary, fontSize: 14, fontWeight: 'bold' },
  listContent: { padding: Spacing.md },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subjectName: { ...Typography.h3, color: Colors.text, flex: 1 },
  overallScore: { ...Typography.h2, color: Colors.primary, fontWeight: 'bold', marginLeft: Spacing.md },
  expandedContent: { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  markRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  markLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.sm },
  markItemName: { ...Typography.body, color: Colors.text, fontSize: 14 },
  markScore: { ...Typography.body, color: Colors.textDim, fontWeight: 'bold' },
  absentBadge: { backgroundColor: '#ef444420', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  absentText: { color: Colors.error, fontSize: 12, fontWeight: 'bold' },
  emptyText: { ...Typography.body, color: Colors.textDim, fontStyle: 'italic', textAlign: 'center' },
});
