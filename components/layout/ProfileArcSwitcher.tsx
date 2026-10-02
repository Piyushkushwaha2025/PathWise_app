import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, DeviceEventEmitter, Animated, Dimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const defaultOrigin = {
    x: width - (width / 10) - 15,
    y: height - 25,
};

export const ProfileArcSwitcher = ({ colors, blurTargetRef }: any) => {
    const [visible, setVisible] = useState(false);
    const [hovered, setHovered] = useState<'studyos' | 'pathwise' | null>(null);
    const [origin, setOrigin] = useState(defaultOrigin);

    // Animations
    const anim = React.useRef(new Animated.Value(0)).current;
    const studyOsScale = React.useRef(new Animated.Value(1)).current;
    const pathWiseScale = React.useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const sub1 = DeviceEventEmitter.addListener('profileSwitchVisible', (data) => {
            if (data?.visible) {
                anim.stopAnimation();
                setOrigin({ x: data.x, y: data.y });
                setVisible(true);
                anim.setValue(0);
                studyOsScale.setValue(1);
                pathWiseScale.setValue(1);
                Animated.spring(anim, { 
                    toValue: 1, 
                    useNativeDriver: true, 
                    friction: 8, 
                    tension: 260 
                }).start();
            } else {
                anim.stopAnimation();
                if (data?.immediate) {
                    anim.setValue(0);
                    setVisible(false);
                    setHovered(null);
                    studyOsScale.setValue(1);
                    pathWiseScale.setValue(1);
                } else {
                    Animated.timing(anim, { 
                        toValue: 0, 
                        duration: 90, 
                        useNativeDriver: true 
                    }).start(() => {
                        anim.stopAnimation();
                        anim.setValue(0);
                        setVisible(false);
                        setHovered(null);
                        studyOsScale.setValue(1);
                        pathWiseScale.setValue(1);
                    });
                }
            }
        });

        const sub2 = DeviceEventEmitter.addListener('profileSwitchHover', (h) => {
            setHovered(h);
            Animated.spring(studyOsScale, {
                toValue: h === 'studyos' ? 1.2 : h === 'pathwise' ? 0.92 : 1,
                useNativeDriver: true,
                tension: 320,
                friction: 12,
            }).start();
            Animated.spring(pathWiseScale, {
                toValue: h === 'pathwise' ? 1.2 : h === 'studyos' ? 0.92 : 1,
                useNativeDriver: true,
                tension: 320,
                friction: 12,
            }).start();
        });

        return () => {
            sub1.remove();
            sub2.remove();
            anim.stopAnimation();
            studyOsScale.stopAnimation();
            pathWiseScale.stopAnimation();
        };
    }, []);

    // Do NOT render anything when not visible so no backdrop/dimming remains on screen
    if (!visible) {
        return null;
    }

    const isDark = colors.text === '#f0f0f0' || colors.text === '#FFFFFF';
    
    // Spread distance for the options (radius of the Arc)
    const arcRadius = 78;

    // Slide up animation for StudyOS
    const studyOsY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -arcRadius] });
    const studyOsOpacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.7, 1] });
    
    // Slide left animation for PathWise
    const pathWiseX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -arcRadius] });
    const pathWiseOpacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.7, 1] });

    return (
        <View 
            pointerEvents="none"
            style={[
                StyleSheet.absoluteFill, 
                { 
                    zIndex: 9999, 
                }
            ]}
        >
            {/* Full Screen High-Performance Frosted Blur Backdrop */}
            <View style={StyleSheet.absoluteFill}>
                <BlurView 
                    blurTarget={blurTargetRef}
                    blurMethod="dimezisBlurView"
                    intensity={35} 
                    style={StyleSheet.absoluteFill} 
                    tint={isDark ? 'dark' : 'light'} 
                />
                <Animated.View 
                    style={[
                        StyleSheet.absoluteFill, 
                        { 
                            backgroundColor: isDark 
                                ? 'rgba(0, 0, 0, 0.38)' 
                                : 'rgba(255, 255, 255, 0.35)',
                            opacity: anim
                        }
                    ]} 
                />
            </View>
            
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
                        backgroundColor: hovered === 'studyos' ? '#8b5cf6' : (isDark ? 'rgba(30,30,40,0.85)' : 'rgba(255,255,255,0.95)'),
                        borderColor: hovered === 'studyos' ? '#a78bfa' : 'rgba(255,255,255,0.25)',
                        opacity: studyOsOpacity,
                        transform: [{ translateY: studyOsY }, { scale: studyOsScale }]
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
                        backgroundColor: hovered === 'pathwise' ? colors.primary : (isDark ? 'rgba(30,30,40,0.85)' : 'rgba(255,255,255,0.95)'),
                        borderColor: hovered === 'pathwise' ? colors.primary : 'rgba(255,255,255,0.25)',
                        opacity: pathWiseOpacity,
                        transform: [{ translateX: pathWiseX }, { scale: pathWiseScale }]
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
