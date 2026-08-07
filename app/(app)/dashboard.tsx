import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useStudySessionStore } from '../../store/studySessionStore';
import { Colors } from '../../constants/theme';
import StudyOSDashboard from './studyos/dashboard';
import PathWiseDashboard from './_pathwise_dashboard';

export default function DashboardSwitcher() {
  const { isStudyOSMode } = useStudySessionStore();

  return (
    <View style={styles.container}>
      {isStudyOSMode ? <StudyOSDashboard /> : <PathWiseDashboard />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
