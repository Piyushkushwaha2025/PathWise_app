import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useStudySessionStore } from '../../store/studySessionStore';
import { Colors } from '../../constants/theme';
import MarksScreen from './studyos/marks';
import PathWiseSubscriptionScreen from './_pathwise_subscription';

export default function SubscriptionScreenSwitcher() {
  const { isStudyOSMode } = useStudySessionStore();

  return (
    <View style={styles.container}>
      {isStudyOSMode ? <MarksScreen /> : <PathWiseSubscriptionScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
