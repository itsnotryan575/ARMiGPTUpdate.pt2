import { Platform, ActionSheetIOS, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  SafeAreaView,
  Modal,
  Image,
  KeyboardAvoidingView
} from 'react-native';
import { Plus, Mic, Send, MessageSquarePlus } from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { AIService } from '@/services/AIService';
import { DatabaseService } from '@/services/DatabaseService';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { scheduleReminder, scheduleScheduledText, buildWhenFromComponents } from '@/services/Scheduler';

export default function AddInteractionScreen() {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [conversationState, setConversationState] = useState('ready'); // 'ready', 'awaiting_confirmation'
  const [pendingActions, setPendingActions] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const inputRef = useRef(null);
  const { isDark } = useTheme();

  const theme = {
    text: '#f0f0f0',
    background: isDark ? '#0B0909' : '#003C24',
    primary: isDark ? '#8C8C8C' : '#f0f0f0',
    secondary: isDark ? '#4A5568' : '#012d1c',
    accent: isDark ? '#44444C' : '#002818',
    inputBackground: isDark ? '#1A1A1A' : '#002818',
    border: isDark ? '#333333' : '#012d1c',
  };

  const handleSubmit = async () => {
    if (!inputText.trim()) {
      Alert.alert('Input Required', 'Please tell me what you need help with.');
      return;
    }

    setIsProcessing(true);
    try {
      if (conversationState === 'ready') {
        // Process the natural language input with advanced AI
        const aiResponse = await AIService.processInteraction(inputText);
        
        // Add user message to chat
        setChatMessages(prev => [...prev, { 
          type: 'user', 
          text: inputText 
        }]);
        
        // Handle different intents
        if (aiResponse.intent === 'clarify') {
          // AI needs clarification
          setChatMessages(prev => [...prev, { 
            type: 'ai', 
            text: `${aiResponse.response}\n\n${aiResponse.clarification}`
          }]);
          
          setInputText('');
          inputRef.current?.focus();
        } else if (aiResponse.confidence < 0.7) {
          // Low confidence, ask for confirmation
          setPendingActions(aiResponse);
          setConversationState('awaiting_confirmation');
          
          const summary = generateActionSummary(aiResponse.actions);
          setChatMessages(prev => [...prev, { 
            type: 'ai', 
            text: `I think I understand, but let me confirm:\n\n${summary}\n\nIs this correct? Say 'yes' to proceed or 'no' to try again.`
          }]);
          
          setInputText('');
        } else {
          // High confidence, execute actions
          await executeActions(aiResponse.actions);
          
          setChatMessages(prev => [...prev, { 
            type: 'ai', 
            text: aiResponse.response
          }]);
          
          // Reset after successful execution
          setTimeout(() => {
            setInputText('');
            setChatMessages([]);
            setSelectedImage(null);
            inputRef.current?.focus();
          }, 2000);
        }
      } else if (conversationState === 'awaiting_confirmation') {
        // Handle confirmation response
        const lowerInput = inputText.toLowerCase().trim();
        
        if (lowerInput.includes('yes') || lowerInput.includes('correct') || lowerInput.includes('right')) {
          // Execute pending actions
          await executeActions(pendingActions.actions);
          
          setChatMessages(prev => [...prev, { 
            type: 'user', 
            text: inputText 
          }, { 
            type: 'ai', 
            text: 'Perfect! I\'ve completed those actions for you.'
          }]);
          
          // Reset conversation
          setTimeout(() => {
            setConversationState('ready');
            setPendingActions(null);
            setInputText('');
            setChatMessages([]);
            setSelectedImage(null);
            inputRef.current?.focus();
          }, 2000);
        } else if (lowerInput.includes('no') || lowerInput.includes('wrong') || lowerInput.includes('incorrect')) {
          // Cancel and ask for clarification
          setChatMessages(prev => [...prev, { 
            type: 'user', 
            text: inputText 
          }, { 
            type: 'ai', 
            text: 'No problem! Please tell me again what you\'d like me to do, and I\'ll try to understand better.'
          }]);
          
          setConversationState('ready');
          setPendingActions(null);
          setInputText('');
        } else {
          // Unclear response, ask again
          setChatMessages(prev => [...prev, { 
            type: 'user', 
            text: inputText 
          }, { 
            type: 'ai', 
            text: 'I\'m not sure if that\'s a yes or no. Please say "yes" to proceed or "no" to start over.'
          }]);
          
          setInputText('');
        }
      }
    } catch (error) {
      console.error('Error processing interaction:', error);
      
      // Add user message first
      setChatMessages(prev => [...prev, { 
        type: 'user', 
        text: inputText 
      }]);
      
      // Determine error message based on error type
      let errorMessage = 'Sorry, I encountered an error processing your request.';
      
      if (error.message.includes('No response from OpenAI')) {
        errorMessage = 'I didn\'t receive a response from the AI service. Please check your internet connection and try again.';
      } else if (error.message.includes('JSON Parse error') || error.message.includes('Failed to parse AI response')) {
        errorMessage = 'I had trouble understanding the AI response. Please try rephrasing your request or be more specific.';
      } else if (error.message.includes('API key')) {
        errorMessage = 'There\'s an issue with the AI service configuration. Please check that your OpenAI API key is properly set up.';
      } else if (error.message.includes('AI processing failed')) {
        errorMessage = 'The AI service encountered an error. Please try again with a simpler request.';
      }
      
      setChatMessages(prev => [...prev, { 
        type: 'ai', 
        text: errorMessage + ' You can also use the manual tabs to add profiles, reminders, or schedule texts directly.'
      }]);
      
      setInputText('');
    } finally {
      setIsProcessing(false);
    }
  };

  const generateActionSummary = (actions: any[]) => {
    return actions.map(action => {
      switch (action.type) {
        case 'create_profile':
          return `• Add ${action.data.name} to your ${action.data.relationship} contacts${action.data.job ? ` (${action.data.job})` : ''}`;
        case 'update_profile':
          return `• Update ${action.data.name}'s profile information`;
        case 'create_reminder':
          return `• Create reminder: "${action.data.title}" for ${new Date(action.data.scheduledFor).toLocaleDateString()}`;
        case 'schedule_text':
          return `• Schedule text to ${action.data.phoneNumber}: "${action.data.message}" for ${new Date(action.data.scheduledFor).toLocaleDateString()}`;
        default:
          return `• ${action.type}`;
      }
    }).join('\n');
  };

  const executeActions = async (actions: any[]) => {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create_profile':
            await executeCreateProfile(action.data);
            break;
          case 'update_profile':
            await executeUpdateProfile(action.data);
            break;
          case 'create_reminder':
            await executeCreateReminder(action.data);
            break;
          case 'schedule_text':
            await executeScheduleText(action.data);
            break;
          default:
            console.warn('Unknown action type:', action.type);
        }
      } catch (error) {
        console.error(`Error executing ${action.type}:`, error);
        throw error;
      }
    }
  };

  const executeCreateProfile = async (profileData: any) => {
    // Add selected image to profile data if available
    if (selectedImage) {
      profileData.photoUri = selectedImage.uri;
    }
    
    // Convert arrays to proper format for database
    const dbProfileData = {
      ...profileData,
      tags: profileData.tags || [],
      parents: profileData.parents || [],
      kids: profileData.kids || [],
      siblings: profileData.siblings || [],
      foodLikes: profileData.likes || [],
      foodDislikes: profileData.dislikes || [],
      interests: profileData.interests || [],
      lastContactDate: new Date().toISOString(),
    };
    
    const profileId = await DatabaseService.createOrUpdateProfile(dbProfileData);
    
    // Save interaction record
    await DatabaseService.addInteraction({
      profileId,
      description: inputText,
      extractedData: JSON.stringify(profileData),
      createdAt: new Date().toISOString()
    });
    
    return profileId;
  };

  const executeUpdateProfile = async (profileData: any) => {
    // Similar to create but for updates
    // This would require finding the existing profile first
    const dbProfileData = {
      ...profileData,
      tags: profileData.tags || [],
      parents: profileData.parents || [],
      kids: profileData.kids || [],
      siblings: profileData.siblings || [],
      foodLikes: profileData.likes || [],
      foodDislikes: profileData.dislikes || [],
      interests: profileData.interests || [],
      updatedAt: new Date().toISOString(),
    };
    
    await DatabaseService.createOrUpdateProfile(dbProfileData);
  };

  const executeCreateReminder = async (reminderData: any) => {
    const scheduledDate = new Date(reminderData.scheduledFor);
    
    const reminderId = await DatabaseService.createReminder({
      profileId: reminderData.profileId,
      title: reminderData.title,
      description: reminderData.description,
      type: reminderData.reminderType || 'general',
      scheduledFor: scheduledDate,
    });
    
    // Schedule notification
    try {
      const result = await scheduleReminder({
        title: reminderData.title,
        body: reminderData.description || 'You have a reminder',
        datePick: scheduledDate,
        timePick: scheduledDate,
        reminderId: reminderId.toString(),
      });
      
      if (result.id) {
        await DatabaseService.updateReminderNotificationId(reminderId, result.id);
      }
    } catch (notificationError) {
      console.error('Failed to schedule reminder notification:', notificationError);
    }
  };

  const executeScheduleText = async (textData: any) => {
    const scheduledDate = new Date(textData.scheduledFor);
    
    const textId = await DatabaseService.createScheduledText({
      profileId: textData.profileId,
      phoneNumber: textData.phoneNumber,
      message: textData.message,
      scheduledFor: scheduledDate,
    });
    
    // Schedule notification
    try {
      const result = await scheduleScheduledText({
        messageId: textId.toString(),
        phoneNumber: textData.phoneNumber,
        message: textData.message,
        datePick: scheduledDate,
        timePick: scheduledDate,
      });
      
      if (result.id) {
        await DatabaseService.updateScheduledTextNotificationId(textId, result.id);
      }
    } catch (notificationError) {
      console.error('Failed to schedule text notification:', notificationError);
    }
  };

  const handleAddPhoto = async () => {
    if (Platform.OS === 'ios') {
      console.log('📸 iOS: Starting ActionSheetIOS for photo selection');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Choose from Library', 'Take Photo', 'Cancel'],
          cancelButtonIndex: 2,
        },
        async (buttonIndex) => {
          console.log('📸 iOS: ActionSheet button pressed:', buttonIndex);
          try {
            if (buttonIndex === 0) {
              console.log('📸 iOS: User selected "Choose from Library"');
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              console.log('📸 iOS: Media library permission status:', perm.status);
              if (perm.status !== 'granted') {
                Alert.alert('Permission needed', 'Enable Photos in Settings to add a picture.');
                return;
              }
              console.log('📸 iOS: Calling ImagePicker.launchImageLibraryAsync...');
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });
              console.log('📸 iOS: ImagePicker library result:', result);
              if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                console.log('📸 iOS: Selected asset from library:', asset.uri);
                setSelectedImage(asset);
              } else {
                console.log('📸 iOS: Library picker was canceled or no asset selected');
              }
            } else if (buttonIndex === 1) {
              console.log('📸 iOS: User selected "Take Photo"');
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              console.log('📸 iOS: Camera permission status:', perm.status);
              if (perm.status !== 'granted') {
                Alert.alert('Permission needed', 'Enable Camera in Settings to take a picture.');
                return;
              }
              console.log('📸 iOS: Calling ImagePicker.launchCameraAsync...');
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });
              console.log('📸 iOS: ImagePicker camera result:', result);
              if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                console.log('📸 iOS: Selected asset from camera:', asset.uri);
                setSelectedImage(asset);
              } else {
                console.log('📸 iOS: Camera picker was canceled or no asset selected');
              }
            } else {
              console.log('📸 iOS: User canceled ActionSheet');
            }
          } catch (e: any) {
            console.error('📸 iOS: Picker error:', e);
            Alert.alert('Error', 'Failed to open picker. Try again.');
          }
        }
      );
    } else {
      console.log('📸 Android: Starting Alert for photo selection');
      Alert.alert('Add Photo', 'Choose an option:', [
        {
          text: 'Choose from Library',
          onPress: async () => {
            console.log('📸 Android: User selected "Choose from Library"');
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            console.log('📸 Android: Media library permission status:', perm.status);
            if (perm.status !== 'granted') {
              Alert.alert('Permission needed', 'Enable Photos in Settings to add a picture.');
              return;
            }
            console.log('📸 Android: Calling ImagePicker.launchImageLibraryAsync...');
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            console.log('📸 Android: ImagePicker library result:', result);
            if (!result.canceled && result.assets?.[0]) {
              const asset = result.assets[0];
              console.log('📸 Android: Selected asset from library:', asset.uri);
              setSelectedImage(asset);
            } else {
              console.log('📸 Android: Library picker was canceled or no asset selected');
            }
          },
        },
        {
          text: 'Take Photo',
          onPress: async () => {
            console.log('📸 Android: User selected "Take Photo"');
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            console.log('📸 Android: Camera permission status:', perm.status);
            if (perm.status !== 'granted') {
              Alert.alert('Permission needed', 'Enable Camera in Settings to take a picture.');
              return;
            }
            console.log('📸 Android: Calling ImagePicker.launchCameraAsync...');
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            console.log('📸 Android: ImagePicker camera result:', result);
            if (!result.canceled && result.assets?.[0]) {
              const asset = result.assets[0];
              console.log('📸 Android: Selected asset from camera:', asset.uri);
              setSelectedImage(asset);
            } else {
              console.log('📸 Android: Camera picker was canceled or no asset selected');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleVoiceInput = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Voice Input',
        'Voice input is not available on web. Please type your interaction.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsListening(true);
      // Note: This is a placeholder for voice-to-text functionality
      // In a real implementation, you would use expo-speech or react-native-voice
      Alert.alert(
        'Voice Input',
        'Voice input feature coming soon! For now, please type your interaction.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error with voice input:', error);
      Alert.alert('Error', 'Failed to start voice input. Please try again.');
    } finally {
      setIsListening(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <MessageSquarePlus size={32} color={theme.text} />
        <Text style={[styles.headerTitle, { color: theme.text }]}>ARMi Chat</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.welcomeMessage}>
            <Text style={[styles.welcomeText, { color: theme.text }]}>
              What can I help you with today?
            </Text>
            <Text style={[styles.welcomeSubtext, { color: theme.primary }]}>
              I can add contacts, create reminders, schedule texts, and more - just tell me what you need!
            </Text>
          </View>

          {chatMessages.map((message, index) => (
            <View key={index} style={styles.messageContainer}>
              <View style={[
                message.type === 'user' ? styles.userMessage : styles.botMessage,
                { backgroundColor: message.type === 'user' ? theme.secondary : theme.accent }
              ]}>
                <Text style={[styles.messageText, { 
                  color: message.type === 'user' ? '#FFFFFF' : theme.text 
                }]}>
                  {message.text}
                </Text>
              </View>
            </View>
          ))}

          {isProcessing && (
            <View style={styles.messageContainer}>
              <View style={[styles.botMessage, { backgroundColor: theme.accent }]}>
                <Text style={[styles.messageText, { color: theme.text }]}>
                  {conversationState === 'ready' ? 'Processing your request with AI...' : 'Processing your response...'}
                </Text>
              </View>
            </View>
          )}

          {selectedImage && (
            <View style={styles.messageContainer}>
              <View style={[styles.imagePreview, { backgroundColor: theme.accent }]}>
                <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} />
                <TouchableOpacity 
                  style={[styles.removeImageButton, { backgroundColor: theme.secondary }]}
                  onPress={() => setSelectedImage(null)}
                >
                  <Text style={styles.removeImageText}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputContainer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <View style={[styles.inputRow, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
              onPress={handleAddPhoto}
            >
              <Plus size={20} color={theme.primary} />
            </TouchableOpacity>

            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: theme.text }]}
              multiline
              placeholder={conversationState === 'ready' ? "Add Sarah to my contacts, remind me to call mom tomorrow, schedule a text..." : "Your response..."}
              placeholderTextColor={theme.primary}
              value={inputText}
              onChangeText={setInputText}
              maxLength={1000}
              autoFocus
            />

            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={handleVoiceInput}
            >
              <Mic size={20} color={isListening ? theme.secondary : theme.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
             { backgroundColor: inputText.trim() && !isProcessing ? theme.secondary : theme.secondary },
              (!inputText.trim() || isProcessing) && styles.sendButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={!inputText.trim() || isProcessing}
          >
           <Send size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  welcomeMessage: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtext: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  messageContainer: {
    marginBottom: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomRightRadius: 4,
  },
  botMessage: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  inputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 25,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginRight: 12,
    minHeight: 50,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
    minHeight: 36,
    letterSpacing: 0,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  imagePreview: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    borderRadius: 20,
    borderBottomRightRadius: 4,
    padding: 8,
    position: 'relative',
  },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});