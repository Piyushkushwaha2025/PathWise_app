import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText, Circle, Line } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, withDelay, Easing } from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  currentPct: number;
  predictPct: number;
  currentAttended: number;
  currentTotal: number;
  predictAttended: number;
  predictTotal: number;
  colors: any;
  predictType?: 'attend' | 'miss';
  size?: number;
}

export function AttendanceRingWidget({
  currentPct, predictPct, currentAttended, currentTotal, predictAttended, predictTotal, colors, predictType = 'attend', size = 160
}: Props) {
  const width = size;
  const height = size * 0.95; 
  
  const cx = width / 2;
  const cy = height * 0.5;
  const r = size * 0.4;
  const strokeWidth = size * 0.08;
  
  const startAngle = 140;
  const endAngle = 400;
  const sweepAngle = endAngle - startAngle;
  
  const arcLength = (sweepAngle / 360) * 2 * Math.PI * r;

  const getCoordinatesForAngle = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  const startPt = getCoordinatesForAngle(startAngle);
  const endPt = getCoordinatesForAngle(endAngle);

  const trackPath = `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 1 1 ${endPt.x} ${endPt.y}`;

  const isMiss = predictType === 'miss' || predictPct < currentPct;
  const deltaColor = isMiss ? '#ef4444' : '#22c55e';
  const currentColor = '#9F602B';
  const trackColor = colors.border;
  const textColor = colors.text;
  const mutedColor = colors.textMuted;
  
  const bottomRingPct = isMiss ? currentPct : Math.max(currentPct, predictPct);
  const bottomRingColor = isMiss ? '#ef4444' : '#22c55e';
  
  const topRingPct = isMiss ? predictPct : currentPct;
  const topRingColor = currentColor;

  const animBottom = useSharedValue(0);
  const animTop = useSharedValue(0);

  useEffect(() => {
    animBottom.value = withTiming(bottomRingPct, { duration: 800, easing: Easing.out(Easing.cubic) });
    animTop.value = withTiming(topRingPct, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [currentPct, predictPct]);

  const animatedBottomProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLength - (arcLength * Math.max(0, Math.min(100, animBottom.value))) / 100,
  } as any));

  const animatedTopProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLength - (arcLength * Math.max(0, Math.min(100, animTop.value))) / 100,
  } as any));

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Path d={trackPath} stroke={trackColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />

        <AnimatedPath
          d={trackPath}
          stroke={bottomRingColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          animatedProps={animatedBottomProps}
        />

        <AnimatedPath
          d={trackPath}
          stroke={topRingColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          animatedProps={animatedTopProps}
        />

        <SvgText x={cx} y={cy - size * 0.12} textAnchor="middle" fontSize={size * 0.18} fontWeight="900" fill={textColor}>
          {currentPct}%
        </SvgText>
        <SvgText x={cx} y={cy - size * 0.02} textAnchor="middle" fontSize={size * 0.065} fill={mutedColor}>
          Current
        </SvgText>

        <Line x1={cx - size * 0.15} y1={cy + size * 0.05} x2={cx + size * 0.15} y2={cy + size * 0.05} stroke={colors.border} strokeWidth="1" />

        <SvgText x={cx} y={cy + size * 0.18} textAnchor="middle" fontSize={size * 0.13} fontWeight="800" fill={deltaColor}>
          {predictPct}%
        </SvgText>
        <SvgText x={cx} y={cy + size * 0.28} textAnchor="middle" fontSize={size * 0.06} fill={mutedColor}>
          {isMiss ? 'If missed' : 'If attended'}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  }
});
