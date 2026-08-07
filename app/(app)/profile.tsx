import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useStudySessionStore } from '../../store/studySessionStore';
import { Colors } from '../../constants/theme';
import CollegeProfileScreen from './studyos/profile';
import PathWiseProfileScreen from './_pathwise_profile';

export default function ProfileScreenSwitcher() {
  const { isStudyOSMode } = useStudySessionStore();

  return (
    <View style={styles.container}>
      {isStudyOSMode ? <CollegeProfileScreen /> : <PathWiseProfileScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
