/**
 * Wave C (fr + en, safety): on a red-flag reply the "URGENCE" title showed but the call
 * button sat under the suggestion chips and the input. The list scrolled on content size
 * change, before the reply had finished laying out. ChatbotScreen now scrolls again once
 * the last message and the list itself have laid out, and pins the call action above the
 * input while the conversation is on an emergency. ChatbotScreen is .tsx and the repo
 * ships no React renderer, so the pin rule is tested here and the wiring at source level.
 */
import * as fs from 'fs';
import * as path from 'path';
import { shouldPinEmergencyCall, ChatMessageLike } from '../chatEmergency';

const welcome: ChatMessageLike = { sender: 'bot' };
const user: ChatMessageLike = { sender: 'user' };
const emergency: ChatMessageLike = { sender: 'bot', data: { type: 'red_flag', redFlag: { severity: 'emergency' } } };
const urgentConsult: ChatMessageLike = { sender: 'bot', data: { type: 'red_flag', redFlag: { severity: 'urgent_consult' } } };
const answer: ChatMessageLike = { sender: 'bot', data: { type: 'answer' } };
const networkError: ChatMessageLike = { sender: 'bot', data: { type: 'error' } };
const rateLimit: ChatMessageLike = { sender: 'bot' };

describe('shouldPinEmergencyCall', () => {
    it('pins once the latest answer is an emergency', () => {
        expect(shouldPinEmergencyCall([welcome, user, emergency])).toBe(true);
    });

    it('stays pinned while she writes again and waits for the next answer', () => {
        expect(shouldPinEmergencyCall([welcome, user, emergency, user])).toBe(true);
    });

    it('a network error or the rate-limit notice is not an answer and does not unpin it', () => {
        expect(shouldPinEmergencyCall([welcome, user, emergency, user, networkError])).toBe(true);
        expect(shouldPinEmergencyCall([welcome, user, emergency, user, rateLimit])).toBe(true);
    });

    it('unpins on the next real answer that is not an emergency', () => {
        expect(shouldPinEmergencyCall([welcome, user, emergency, user, answer])).toBe(false);
    });

    it('does not pin for an urgent consultation, a normal answer or the welcome alone', () => {
        expect(shouldPinEmergencyCall([welcome, user, urgentConsult])).toBe(false);
        expect(shouldPinEmergencyCall([welcome, user, answer])).toBe(false);
        expect(shouldPinEmergencyCall([welcome])).toBe(false);
        expect(shouldPinEmergencyCall([])).toBe(false);
    });
});

describe('ChatbotScreen wiring', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../screens/ChatbotScreen.tsx'), 'utf8');

    it('links a foods-to-avoid answer to the Foods to avoid screen', () => {
        expect(src).toMatch(/item\.data\?\.screenLink === 'ForbiddenFoods'/);
        expect(src).toMatch(/navigation\.navigate\('Home', \{ screen: 'ForbiddenFoods' \}\)/);
        expect(src).toMatch(/t\('common\.chatSeeForbiddenFoods'\)/);
    });

    it('scrolls to the end after layout: content size, list resize and the last message', () => {
        expect(src).toMatch(/requestAnimationFrame\(\(\) => flatListRef\.current\?\.scrollToEnd\(\{ animated: true \}\)\)/);
        expect(src).toMatch(/onContentSizeChange=\{scrollToEnd\}\s*onLayout=\{scrollToEnd\}/);
        expect(src).toMatch(/const isLast = index === messages\.length - 1;/);
        expect(src).toMatch(/onLayout=\{isLast \? scrollToEnd : undefined\}/);
    });

    it('pins the call action above the chips and the input while on an emergency', () => {
        expect(src).toMatch(/const pinCall = !!emergencyNumber && shouldPinEmergencyCall\(messages\);/);
        const pinned = src.indexOf('chat_pinned_emergency_call');
        expect(pinned).toBeGreaterThan(-1);
        // Rendered before (above) the suggestion chips and the input row.
        expect(pinned).toBeLessThan(src.indexOf('<View style={styles.suggestionsContainer}>'));
        expect(pinned).toBeLessThan(src.indexOf('<KeyboardAvoidingView'));
        const bar = src.slice(pinned, src.indexOf('<View style={styles.suggestionsContainer}>'));
        expect(bar).toMatch(/onPress=\{callEmergency\}/);
        expect(bar).toMatch(/accessibilityRole="button"/);
        expect(bar).toMatch(/accessibilityLabel=\{t\('a11y\.emergencyCall'\)\}/);
        expect(bar).toMatch(/emergencyNumberLabel\(t, emergencyContact\)/);
    });

    it('both call buttons dial the same resolved number', () => {
        expect(src).toMatch(/Linking\.openURL\(`tel:\$\{emergencyNumber\}`\)/);
        expect(src.match(/onPress=\{callEmergency\}/g)).toHaveLength(2);
    });

    it('never shows both at once: the bubble drops its call button while the bar is pinned', () => {
        // Wave C: after a red flag the in-message button and the pinned bar were both on screen
        // with the same label, so a screen reader announced the same button twice.
        const bubble = src.slice(src.indexOf('styles.alertContainerCritical'), src.indexOf('chat_pinned_emergency_call'));
        const gate = bubble.indexOf('{emergencyNumber && !pinCall ? (');
        expect(gate).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(bubble.indexOf('onPress={callEmergency}'));
        expect(src).toMatch(/\{pinCall && \(\s*<View style=\{styles\.pinnedCallBar\}/);
    });
});
