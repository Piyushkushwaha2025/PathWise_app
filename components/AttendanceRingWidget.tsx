import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';

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
  currentPct,
  predictPct,
  currentAttended,
  currentTotal,
  predictAttended,
  predictTotal,
  colors,
  predictType = 'attend',
  size = 144,
}: Props) {
  const width = size;
  const svgHeight = 98;

  const cx = width / 2;
  const cy = 52;
  const r = 43;
  const strokeWidth = 9;

  // 260 degree arc: opens at bottom (from 140 deg to 400 deg)
  const startAngle = 140;
  const endAngle = 400;
  const sweepAngle = endAngle - startAngle;
  const arcLength = (sweepAngle / 360) * 2 * Math.PI * r;

  const getCoordinatesForAngle = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const startPt = getCoordinatesForAngle(startAngle);
  const endPt = getCoordinatesForAngle(endAngle);
  const trackPath = `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 1 1 ${endPt.x} ${endPt.y}`;

  const isMiss = predictType === 'miss' || predictPct < currentPct;

  // Dynamic gradient colors for Current Percentage
  const { currentGradStart, currentGradEnd, currentColor } = useMemo(() => {
    if (currentPct >= 75) {
      return { currentGradStart: '#22c55e', currentGradEnd: '#10b981', currentColor: '#22c55e' };
    }
    if (currentPct >= 65) {
      return { currentGradStart: '#f59e0b', currentGradEnd: '#fbbf24', currentColor: '#f59e0b' };
    }
    return { currentGradStart: '#ef4444', currentGradEnd: '#f43f5e', currentColor: '#ef4444' };
  }, [currentPct]);

  // Projected delta color
  const deltaColor = isMiss ? '#ef4444' : '#22c55e';
  const isDark = colors.background === '#050505' || (colors.surface && colors.surface.startsWith('#0'));
  const trackColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

  // Animations
  const animCurrent = useSharedValue(0);
  const animPredict = useSharedValue(0);

  useEffect(() => {
    animCurrent.value = withTiming(Math.min(100, Math.max(0, currentPct)), {
      duration: 850,
      easing: Easing.out(Easing.cubic),
    });
    animPredict.value = withTiming(Math.min(100, Math.max(0, predictPct)), {
      duration: 850,
      easing: Easing.out(Easing.cubic),
    });
  }, [currentPct, predictPct]);

  const animatedCurrentProps = useAnimatedProps(() => {
    const p = Math.max(0, Math.min(100, animCurrent.value));
    return {
      strokeDashoffset: arcLength - (arcLength * p) / 100,
    } as any;
  });

  const animatedPredictProps = useAnimatedProps(() => {
    const p = Math.max(0, Math.min(100, animPredict.value));
    return {
      strokeDashoffset: arcLength - (arcLength * p) / 100,
    } as any;
  });

  return (
    <View style={[styles.container, { width }]}>
      {/* Top Arc Gauge */}
      <View style={{ width, height: svgHeight, position: 'relative' }}>
        <Svg width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`}>
          <Defs>
            <SvgLinearGradient id="gaugeCurrentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={currentGradStart} />
              <Stop offset="100%" stopColor={currentGradEnd} />
            </SvgLinearGradient>
            <SvgLinearGradient id="gaugePredictGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={isMiss ? '#ef4444' : '#22c55e'} />
              <Stop offset="100%" stopColor={isMiss ? '#991b1b' : '#10b981'} />
            </SvgLinearGradient>
          </Defs>

          {/* Outer Background Track */}
          <Path
            d={trackPath}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
          />

          {/* Projected Ghost Arc (forward progress gain) */}
          {!isMiss && predictPct > currentPct && (
            <AnimatedPath
              d={trackPath}
              stroke="url(#gaugePredictGrad)"
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              opacity={0.4}
              animatedProps={animatedPredictProps}
            />
          )}

          {/* Current Active Progress Arc */}
          <AnimatedPath
            d={trackPath}
            stroke="url(#gaugeCurrentGrad)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={arcLength}
            animatedProps={animatedCurrentProps}
          />

          {/* Miss Drop Arc */}
          {isMiss && predictPct < currentPct && (
            <AnimatedPath
              d={trackPath}
              stroke="url(#gaugePredictGrad)"
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              animatedProps={animatedPredictProps}
            />
          )}
        </Svg>

        {/* Center Text: Absolutely positioned strictly within the upper inner circle */}
        <View style={styles.centerTextOverlay} pointerEvents="none">
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={[styles.mainPctText, { color: currentColor }]} allowFontScaling={false}>
              {currentPct}
            </Text>
            <Text style={[styles.mainPctSymbol, { color: currentColor }]} allowFontScaling={false}>%</Text>
          </View>

          <Text style={[styles.statusSubLabel, { color: colors.textMuted }]} allowFontScaling={false}>
            CURRENT
          </Text>
        </View>
      </View>

      {/* Outcome Chip: Rendered below the arc so it NEVER overlaps the stroke */}
      <View style={styles.outcomeRow}>
        {predictPct !== currentPct ? (
          <View
            style={[
              styles.deltaBadge,
              {
                backgroundColor: isMiss ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                borderColor: isMiss ? 'rgba(239, 68, 68, 0.28)' : 'rgba(34, 197, 94, 0.28)',
              },
            ]}
          >
            <Text style={[styles.deltaText, { color: deltaColor }]}>
              {isMiss ? '▼' : '▲'} {predictPct}%
            </Text>
            <Text style={[styles.deltaSubText, { color: deltaColor }]}>
              {isMiss ? 'if miss' : 'predicted'}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.neutralBadge,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
            ]}
          >
            <Text style={[styles.neutralText, { color: colors.textDim }]}>
              {currentAttended}/{currentTotal} held
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTextOverlay: {
    position: 'absolute',
    top: 22,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainPctText: {
    fontSize: 27,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 31,
    includeFontPadding: false,
    paddingRight: 2,
  },
  mainPctSymbol: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginLeft: 1,
    includeFontPadding: false,
    paddingRight: 2,
  },
  statusSubLabel: {
    fontSize: 8.5,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 0,
    includeFontPadding: false,
  },
  outcomeRow: {
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  deltaText: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  deltaSubText: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
  },
  neutralBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  neutralText: {
    fontSize: 9.5,
    fontFamily: 'Inter_600SemiBold',
  },
});
