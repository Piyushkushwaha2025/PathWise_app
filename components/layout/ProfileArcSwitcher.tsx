import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, DeviceEventEmitter, Animated, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export const ProfileArcSwitcher = ({ colors, blurTargetRef }: any) => {
    const [visible, setVisible] = useState(false);
    const [hovered, setHovered] = useState<'studyos' | 'pathwise' | null>(null);
    const [origin, setOrigin] = useState({ x: 0, y: 0 });

    // Animations
    const [anim] = useState(new Animated.Value(0));

    useEffect(() => {
        const sub1 = DeviceEventEmitter.addListener('profileSwitchVisible', (data) => {
            if (data.visible) {
                setOrigin({ x: data.x, y: data.y });
                setVisible(true);
                Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }).start();
            } else {
                Animated.timing(anim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => setVisible(false));
                setHovered(null);
            }
        });
        const sub2 = DeviceEventEmitter.addListener('profileSwitchHover', (h) => setHovered(h));

        return () => {
            sub1.remove();
            sub2.remove();
        };
    }, [anim]);

    if (!visible) return null;

    const isDark = colors.text === '#f0f0f0' || colors.text === '#FFFFFF';
    
    // Spread distance for the options (radius of the Arc)
    const arcRadius = 75;

    // Slide up animation for StudyOS
    const studyOsY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -arcRadius] });
    const studyOsOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    
    // Slide left animation for PathWise
    const pathWiseX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -arcRadius] });
    const pathWiseOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, pointerEvents: 'none' }]}>
            {/* Full Screen Blur Backdrop */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
                <BlurView blurTarget={blurTargetRef} blurMethod="dimezisBlurView" intensity={30} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]} />
            </Animated.View>
            
            {/* The Origin Container exactly centered on the User's Thumb! */}
            <View style={{
                position: 'absolute',
                top: origin.y - 33, // 66/2 = 33 (exact center of thumb touch)
                left: origin.x - 33,
                width: 66,
                height: 66
            }}>


                {/* StudyOS Bubble (Directly UP) */}
                <Animated.View style={[
                    styles.bubble,
                    { 
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        backgroundColor: hovered === 'studyos' ? '#8b5cf6' : (isDark ? 'rgba(30,30,40,0.8)' : 'rgba(255,255,255,0.9)'),
                        opacity: studyOsOpacity,
                        transform: [{ translateY: studyOsY }, { scale: hovered === 'studyos' ? 1.15 : 1 }]
                    }
                ]}>
                    <Ionicons name="flash" size={24} color={hovered === 'studyos' ? 'white' : colors.text} />
                    <Text style={[styles.label, { color: hovered === 'studyos' ? 'white' : colors.textDim }]}>StudyOS</Text>
                </Animated.View>

                {/* PathWise Bubble (Directly LEFT) */}
                <Animated.View style={[
                    styles.bubble,
                    { 
                        position: 'absolute',
                        top: 0, 
                        left: 0,
                        backgroundColor: hovered === 'pathwise' ? colors.primary : (isDark ? 'rgba(30,30,40,0.8)' : 'rgba(255,255,255,0.9)'),
                        opacity: pathWiseOpacity,
                        transform: [{ translateX: pathWiseX }, { scale: hovered === 'pathwise' ? 1.15 : 1 }]
                    }
                ]}>
                    <Ionicons name="compass" size={24} color={hovered === 'pathwise' ? 'white' : colors.text} />
                    <Text style={[styles.label, { color: hovered === 'pathwise' ? 'white' : colors.textDim }]}>PathWise</Text>
                </Animated.View>
            </View>
            
            <Animated.View style={{ position: 'absolute', top: height / 2 - 20, width: '100%', alignItems: 'center', opacity: anim }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, color: colors.text }}>Switch Profile</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textDim, marginTop: 8 }}>Slide Up for StudyOS, Left for PathWise</Text>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    bubble: {
        width: 66,
        height: 66,
        borderRadius: 33,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 8
    },
    label: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 10,
        marginTop: 4
    }
});
