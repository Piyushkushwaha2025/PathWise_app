import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { Colors } from '../../../constants/theme';
import TimetableScreen from '../studyos/timetable';
import PathWiseRoadmapsScreen from './_pathwise_roadmaps';

export default function RoadmapsScreenSwitcher() {
  const { isStudyOSMode } = useStudySessionStore();

  return (
    <View style={styles.container}>
      {isStudyOSMode ? <TimetableScreen /> : <PathWiseRoadmapsScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
