import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useStudySessionStore } from '../../store/studySessionStore';
import { Colors } from '../../constants/theme';
import StudyOSDashboard from './studyos/dashboard';
import PathWiseDashboard from './_pathwise_dashboard';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

export default function DashboardSwitcher() {
  const { isStudyOSMode, checkConnection } = useStudySessionStore();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    checkConnection();
  }, [checkConnection]);

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
