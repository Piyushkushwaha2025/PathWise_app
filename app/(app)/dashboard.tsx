import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useStudySessionStore } from '../../store/studySessionStore';
import { Colors } from '../../constants/theme';
import StudyOSDashboard from './studyos/dashboard';
import PathWiseDashboard from './_pathwise_dashboard';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

export default function DashboardSwitcher() {
  const { isStudyOSMode } = useStudySessionStore();

  useEffect(() => {
    setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 100);
  }, [isStudyOSMode]);

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
