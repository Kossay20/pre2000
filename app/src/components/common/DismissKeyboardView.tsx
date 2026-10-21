import React from 'react';
import { Keyboard, Platform, Pressable, StyleProp, ViewStyle } from 'react-native';

/**
 * DismissKeyboardView — tap-outside-to-dismiss wrapper that is a NO-OP on web.
 *
 * WHY: LoginScreen and RegisterScreen wrapped their whole ScrollView in
 * `<Pressable onPress={Keyboard.dismiss}>`. On react-native-web, Pressable's
 * press responder calls `preventDefault()` on the pointer-down event, and that
 * cancels the browser's default focus behaviour for the `<input>` underneath.
 * Every tap on the email or password field left `document.activeElement` on
 * `<body>`, so **nothing could be typed into the login or signup form at all**
 * — the "je n'arrive pas à remplir le formulaire" report. Programmatic focus
 * still worked, which is why unit tests and native builds never caught it.
 *
 * There is no software keyboard to dismiss on web, so the wrapper has no
 * purpose there: render the children directly. On native it keeps the original
 * behaviour, now with `flex: 1` — without it the Pressable collapsed to
 * `height: auto` and the ScrollView inside a `flex: 1` KeyboardAvoidingView
 * could not size itself.
 */
export const DismissKeyboardView: React.FC<{
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}> = ({ children, style }) => {
    if (Platform.OS === 'web') return <>{children}</>;
    return (
        <Pressable onPress={Keyboard.dismiss} style={[{ flex: 1 }, style]} accessible={false}>
            {children}
        </Pressable>
    );
};
