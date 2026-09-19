import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, withDelay, Easing } from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

interface SyllabusGaugeProps {
  percentage: number;
}

const SyllabusGauge: React.FC<SyllabusGaugeProps> = ({ percentage }) => {
  const safePercentage = Math.max(0, Math.min(100, percentage));
  
  // Dimensions and properties
  const radius = 80;
  const strokeWidth = 14;
  const arcLength = Math.PI * radius; // Half circle perimeter
  
  // Dynamic colors based on thresholds
  let gradientStart = '#22C55E';
  let gradientEnd = '#4ADE80';
  let baseColor = '#22C55E';
  
  if (safePercentage < 40) {
    gradientStart = '#EF4444'; // Red
    gradientEnd = '#F59E0B'; // Amber
    baseColor = '#EF4444';
  } else if (safePercentage >= 40 && safePercentage < 70) {
    gradientStart = '#F59E0B'; // Amber
    gradientEnd = '#FBBF24'; // Yellow
    baseColor = '#F59E0B';
  }

  // Animation Values
  const animatedProgress = useSharedValue(0);
  const needleRot = useSharedValue(-90); // Start pointing left (0%)

  useEffect(() => {
    // Mount animation
    animatedProgress.value = withDelay(
      300, 
      withTiming(safePercentage, { duration: 1500, easing: Easing.out(Easing.cubic) })
    );
    
    needleRot.value = withDelay(
      300, 
      withTiming(-90 + (safePercentage / 100) * 180, { duration: 1500, easing: Easing.out(Easing.cubic) })
    );
  }, [safePercentage]);

  // Animated properties for the arc stroke
  const animatedArcProps = useAnimatedProps(() => {
    const currentDashOffset = arcLength - (arcLength * animatedProgress.value) / 100;
    return {
      strokeDashoffset: currentDashOffset,
    } as any;
  });

  // Animated properties for the needle rotation
  const animatedNeedleProps = useAnimatedProps(() => ({
    rotation: needleRot.value,
  } as any));

  return (
    <View style={styles.cardContainer}>
      <View style={styles.gaugeWrapper}>
        <Svg width="100%" height="100%" viewBox="0 0 200 120">
          <Defs>
            <LinearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={gradientStart} stopOpacity="1" />
              <Stop offset="1" stopColor={gradientEnd} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          
          {/* Background Track Arc */}
          <Path 
            d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`} 
            stroke="#2A2F2C" 
            strokeWidth={strokeWidth} 
            strokeLinecap="round" 
            fill="none" 
          />
          
          {/* Animated Progress Arc */}
          <AnimatedPath 
            d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`} 
            stroke="url(#gaugeGradient)" 
            strokeWidth={strokeWidth} 
            strokeLinecap="round" 
            fill="none"
            strokeDasharray={arcLength}
            animatedProps={animatedArcProps}
          />
          
          {/* Optional: Glow effect behind arc */}
          <AnimatedPath 
            d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`} 
            stroke="url(#gaugeGradient)" 
            strokeWidth={24} 
            strokeLinecap="round" 
            fill="none"
            opacity={0.15}
            strokeDasharray={arcLength}
            animatedProps={animatedArcProps}
          />

          {/* Animated Needle perfectly centered in SVG coordinates */}
          <AnimatedG origin="100, 100" animatedProps={animatedNeedleProps}>
            {/* The needle shape */}
            <Path d="M 97,100 L 103,100 L 101,35 L 99,35 Z" fill="#E5E7EB" />
            
            {/* Pivot base outer circle with subtle drop shadow feel */}
            <Circle cx="100" cy="100" r="10" fill="#1F2937" stroke="#374151" strokeWidth="2" />
            
            {/* Pivot base inner glowing accent */}
            <Circle cx="100" cy="100" r="4" fill={baseColor} />
          </AnimatedG>
        </Svg>
      </View>
      
      {/* Text Container Below Gauge */}
      <View style={styles.textContainer}>
        <Text style={[styles.percentageText, { color: baseColor, textShadowColor: baseColor }]}>{safePercentage}%</Text>
        <Text style={styles.labelText}>SYLLABUS COVERED</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#1E1E1E', // Subtle dark card background
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginVertical: 16,
    width: '100%',
  },
  gaugeWrapper: {
    width: 200,
    height: 110, // Just tall enough to show the arc and pivot
    alignItems: 'center',
    overflow: 'visible',
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  percentageText: {
    fontSize: 32,
    fontFamily: 'SpaceGrotesk_700Bold', // Uses custom font if available
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  labelText: {
    fontSize: 12,
    color: '#9CA3AF',
    letterSpacing: 1.5,
    marginTop: 2,
    fontFamily: 'Inter_600SemiBold', // Fallback to standard
  },
});

export default SyllabusGauge;
