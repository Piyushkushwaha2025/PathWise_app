import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { useThemeStore } from '../../store/useThemeStore';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton = ({ width, height, borderRadius = 8, style }: SkeletonProps) => {
  const colors = useThemeStore(s => s.colors);

  return (
    <MotiView
      transition={{
        type: 'timing',
        duration: 1000,
        loop: true,
      }}
      from={{ opacity: 0.5 }}
      animate={{ opacity: 1 }}
      style={[
        styles.skeleton,
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: colors.border,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
});
