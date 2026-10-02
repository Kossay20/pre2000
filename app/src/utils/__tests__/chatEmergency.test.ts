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
import { shouldPinEmergencyCall, chatScrollTarget, ChatMessageLike } from '../chatEmergency';

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

describe('chatScrollTarget', () => {
    const long = { lastHeight: 500, listHeight: 600 };
    const short = { lastHeight: 120, listHeight: 600 };

    it('anchors on her question when the reply is taller than most of the list', () => {
        expect(chatScrollTarget([welcome, user, answer], long.lastHeight, long.listHeight)).toEqual({ index: 1 });
    });

    it('rests on the end when the reply fits next to the question', () => {
        expect(chatScrollTarget([welcome, user, answer], short.lastHeight, short.listHeight)).toBe('end');
    });

    it('anchors a long red-flag reply on her question too: the call bar is pinned (C-064)', () => {
        expect(chatScrollTarget([welcome, user, emergency], long.lastHeight, long.listHeight)).toEqual({ index: 1 });
        expect(chatScrollTarget([welcome, user, urgentConsult], long.lastHeight, long.listHeight)).toEqual({ index: 1 });
    });

    it('keeps the end for a short red-flag reply and for an error, however long', () => {
        expect(chatScrollTarget([welcome, user, emergency], short.lastHeight, short.listHeight)).toBe('end');
        expect(chatScrollTarget([welcome, user, networkError], long.lastHeight, long.listHeight)).toBe('end');
    });

    it('keeps the end for her own message, the welcome message and unmeasured rows', () => {
        expect(chatScrollTarget([welcome, user], long.lastHeight, long.listHeight)).toBe('end');
        expect(chatScrollTarget([welcome], long.lastHeight, long.listHeight)).toBe('end');
        expect(chatScrollTarget([welcome, user, answer], 0, long.listHeight)).toBe('end');
        expect(chatScrollTarget([welcome, user, answer], long.lastHeight, 0)).toBe('end');
    });
});

describe('ChatbotScreen wiring', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../screens/ChatbotScreen.tsx'), 'utf8');

    it('links a foods-to-avoid answer to the Foods to avoid screen', () => {
        expect(src).toMatch(/item\.data\?\.screenLink === 'ForbiddenFoods'/);
        expect(src).toMatch(/navigation\.navigate\('Home', \{ screen: 'ForbiddenFoods' \}\)/);
        expect(src).toMatch(/t\('common\.chatSeeForbiddenFoods'\)/);
    });

    it('re-settles the scroll after layout: content size, list resize and the last message', () => {
        expect(src).toMatch(/flatListRef\.current\?\.scrollToEnd\(\{ animated: true \}\)/);
        expect(src).toMatch(/onContentSizeChange=\{scrollToEnd\}/);
        expect(src).toMatch(/listHeightRef\.current = e\.nativeEvent\.layout\.height;\s*scrollToEnd\(\);/);
        expect(src).toMatch(/const isLast = index === messages\.length - 1;/);
        expect(src).toMatch(/onLayout=\{isLast \? \(e\) => \{[\s\S]*?scrollToEnd\(\);/);
    });

    it('anchors a long bot answer on her question instead of the end of the reply', () => {
        expect(src).toMatch(/chatScrollTarget\(all, lastHeight, listHeightRef\.current\)/);
        // viewOffset 8: flush against the disclaimer the question's rounded top corners were cut (E-061)
        expect(src).toMatch(/scrollToIndex\(\{ index: target\.index, viewPosition: 0, viewOffset: 8, animated: true \}\)/);
        expect(src).toMatch(/scrollToIndex\(\{ index: info\.index, viewPosition: 0, viewOffset: 8, animated: true \}\)/);
        expect(src).toMatch(/onScrollToIndexFailed=\{onScrollToIndexFailed\}/);
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
        const gate = bubble.indexOf('{emergencyNumber && !pinCall && item.id === latestAlertId ? (');
        expect(gate).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(bubble.indexOf('onPress={callEmergency}'));
        expect(src).toMatch(/\{pinCall && \(\s*<View style=\{styles\.pinnedCallBar\}/);
    });
});
