// mobile/src/screens/AiChatScreen.tsx
import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, ScrollView, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

const CHIPS = ['Determinant of 3x3', 'Stuck on Eigenvalues', 'Explain Active Recall'];

export default function AiChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Hello! I am your Socratic AI Coach. I will help guide your conceptual understanding in math and engineering. What topic are we investigating today?',
      sender: 'ai',
      timestamp: '12:00 PM'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Streaming simulated response - perfectly matches the SSE streaming of the backend
  const streamAIResponse = (prompt: string) => {
    setIsStreaming(true);
    let socraticGuidance = '';

    // Socratic guiding heuristic responses based on user query
    if (prompt.toLowerCase().includes('determinant')) {
      socraticGuidance = "Ah, determinants! Instead of computing it straight away, let's think visually. When we apply a linear transformation, what does the determinant tell us about the change in area or volume? Can you tell me what a determinant of zero signifies?";
    } else if (prompt.toLowerCase().includes('eigenvalue') || prompt.toLowerCase().includes('stuck')) {
      socraticGuidance = "Eigenvalues can be tricky! Think of it as a vector that doesn't change its direction during a linear transformation, only its scale. If A * v = lambda * v, what does 'v' represent, and what is 'lambda'? Let's write out the characteristic equation together.";
    } else if (prompt.toLowerCase().includes('active recall')) {
      socraticGuidance = "Active recall is the ultimate study booster! Instead of passively reading, you force your brain to retrieve info. How do you normally review concepts? Flashcards or self-quizzing? Let's formulate a flashcard challenge.";
    } else {
      socraticGuidance = `Intriguing topic! To build a solid foundation, let's break it down Socrates-style. What is your current understanding of "${prompt}"? Let's take it step by step.`;
    }

    const newAiMsgId = (Date.now() + 1).toString();
    const newAiMsg: ChatMessage = {
      id: newAiMsgId,
      text: '',
      sender: 'ai',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, newAiMsg]);

    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex += 3; // Stream 3 characters at a time for battery-efficient premium feel
      const chunk = socraticGuidance.slice(0, currentIndex);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newAiMsgId ? { ...msg, text: chunk } : msg
        )
      );

      if (currentIndex % 12 === 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (currentIndex >= socraticGuidance.length) {
        clearInterval(interval);
        setIsStreaming(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 40);
  };

  const handleSend = (text: string) => {
    if (!text.trim() || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    // Trigger SSE streaming simulation after 600ms
    setTimeout(() => {
      streamAIResponse(text);
    }, 600);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🧠 Socratic Coach</Text>
          <View style={styles.streamBadge}>
            <View style={styles.pulseDot} />
            <Text style={styles.streamText}>{isStreaming ? 'Streaming...' : 'SSE Active'}</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageBubble,
                msg.sender === 'user' ? styles.userBubble : styles.aiBubble
              ]}
            >
              <Text style={styles.messageText}>{msg.text}</Text>
              <Text style={styles.messageTime}>{msg.timestamp}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Action Prompt Chips */}
        <View style={styles.chipContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CHIPS.map((chip, idx) => (
              <TouchableOpacity
                key={idx}
                disabled={isStreaming}
                style={[styles.chip, isStreaming && styles.chipDisabled]}
                onPress={() => handleSend(chip)}
              >
                <Text style={styles.chipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input Dock */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={isStreaming ? 'AI is composing responses...' : 'Query the Socratic Tutor...'}
            placeholderTextColor="#8A8A9E"
            value={inputText}
            editable={!isStreaming}
            onChangeText={setInputText}
            onSubmitEditing={() => handleSend(inputText)}
          />
          <TouchableOpacity
            disabled={isStreaming || !inputText.trim()}
            style={[styles.sendButton, (isStreaming || !inputText.trim()) && styles.sendDisabled]}
            onPress={() => handleSend(inputText)}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  streamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6366F1',
  },
  streamText: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '700',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 20,
    gap: 16,
  },
  messageBubble: {
    maxWidth: '82%',
    padding: 16,
    borderRadius: 20,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
  },
  messageTime: {
    color: '#8A8A9E',
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 6,
  },
  chipContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginRight: 8,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    color: '#8A8A9E',
    fontSize: 13,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    color: '#FFFFFF',
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  sendDisabled: {
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
