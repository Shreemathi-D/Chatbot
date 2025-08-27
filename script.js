class VoiceAssistant {
    constructor() {
        this.isRecording = false;
        this.isProcessing = false;
        this.audioEnabled = true;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        // Groq API configuration
        this.groqApiKey = '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';
        this.authToken = localStorage.getItem('authToken');
        this.username = localStorage.getItem('username');
        this.chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
        this.currentChatId = null;

        this.initializeElements();
        this.initializeSpeechRecognition();
        this.bindEvents();
        this.checkAuthentication();
    }

    initializeElements() {
        this.micButton = document.getElementById('micButton');
        this.stopButton = document.getElementById('stopButton');
        this.volumeButton = document.getElementById('volumeButton');
        this.micIcon = document.getElementById('micIcon');
        this.loadingIcon = document.getElementById('loadingIcon');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.transcriptDisplay = document.getElementById('transcriptDisplay');
        this.transcriptText = document.getElementById('transcriptText');
        this.chatContainer = document.getElementById('chatContainer');
        this.waveAnimation = document.getElementById('waveAnimation');
        this.loginModal = document.getElementById('loginModal');
        this.loginForm = document.getElementById('loginForm');
        this.loginError = document.getElementById('loginError');
        this.userInfo = document.getElementById('userInfo');
        this.userAvatar = document.getElementById('userAvatar');
        this.userName = document.getElementById('userName');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.chatHistoryList = document.getElementById('chat-history');
    }

    checkAuthentication() {
        if (!this.authToken) {
            this.showLoginModal();
        } else {
            this.verifyToken();
        }
    }

    showLoginModal() {
        this.loginModal.style.display = 'block';
        this.disableMicrophone();
    }

    hideLoginModal() {
        this.loginModal.style.display = 'none';
    }

    disableMicrophone() {
        this.micButton.disabled = true;
        this.micButton.style.opacity = '0.5';
        this.micButton.style.cursor = 'not-allowed';
    }

    enableMicrophone() {
        this.micButton.disabled = false;
        this.micButton.style.opacity = '1';
        this.micButton.style.cursor = 'pointer';
    }

    bindAuthEvents() {
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        this.logoutBtn.addEventListener('click', () => {
            this.handleLogout();
        });
    }

    handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Local validation of admin credentials
        if (username === 'admin' && password === 'admin') {
            this.authToken = '9027c985dd6009271f2142a71102a3459c5a60a5'; // Mock token
            this.username = username;
            
            // Store token and username
            localStorage.setItem('authToken', this.authToken);
            localStorage.setItem('username', this.username);
            
            this.hideLoginModal();
            this.enableMicrophone();
            this.showUserInfo();
            this.loadChatHistory();
            
            this.addMessage(`Welcome back, ${username}! How can I help you today?`, 'assistant');
        } else {
            this.loginError.textContent = 'Invalid admin credentials';
            this.loginError.style.display = 'block';
        }
    }

    showUserInfo() {
        this.userInfo.style.display = 'flex';
        this.userName.textContent = this.username;
        this.userAvatar.textContent = this.username.charAt(0).toUpperCase();
    }

    async handleLogout() {
        // Clear local storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        localStorage.removeItem('chatHistory');
        
        // Reset state
        this.authToken = null;
        this.username = null;
        this.chatHistory = [];
        
        // Clear UI
        this.userInfo.style.display = 'none';
        this.chatHistoryList.innerHTML = '';
        this.chatContainer.innerHTML = '';
        this.chatContainer.style.display = 'none';
        document.getElementById('welcomeContent').style.display = 'flex';
        
        // Show login modal
        this.showLoginModal();
    }

    async verifyToken() {
        // For demo purposes, we'll just check if we have a token
        if (!this.authToken) {
            this.showLoginModal();
            return;
        }
        
        // If we have a token, enable the microphone and show user info
        this.enableMicrophone();
        this.showUserInfo();
        this.loadChatHistory();
    }

    initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                this.transcriptText.textContent = transcript;
            };

            this.recognition.onend = () => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.handleError('Speech recognition failed. Please try again.');
            };
        }
    }

    bindEvents() {
        this.micButton.addEventListener('click', () => {
            if (!this.authToken) {
                this.showLoginModal();
                return;
            }
            
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });

        this.stopButton.addEventListener('click', () => {
            this.stopRecording();
        });

        this.volumeButton.addEventListener('click', () => {
            this.toggleAudio();
        });

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                if (!this.isRecording && !this.isProcessing && this.authToken) {
                    this.startRecording();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.isRecording) {
                    this.stopRecording();
                }
            }
        });

        // Bind authentication events
        this.bindAuthEvents();
    }

    async startRecording() {
        try {
            this.isRecording = true;
            this.updateUI('recording');
            
            this.transcriptText.textContent = '';
            this.transcriptDisplay.classList.add('active');

            if (this.recognition) {
                this.recognition.start();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                await this.processAudioWithGroq(audioBlob);
            };

            this.mediaRecorder.start();
            console.log('Recording started...');

        } catch (error) {
            console.error('Error starting recording:', error);
            this.handleError('Microphone access denied. Please allow microphone permissions.');
        }
    }

    async stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        this.isProcessing = true;
        this.updateUI('processing');

        if (this.recognition) {
            this.recognition.stop();
        }

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }

        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        const transcript = this.transcriptText.textContent.trim();
        if (transcript) {
            this.addMessage(transcript, 'user');
            await this.sendToBackend(transcript);
        } else {
            this.handleError('No speech detected. Please try again.');
        }
    }

    async processAudioWithGroq(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.wav');
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('response_format', 'verbose_json');

            const response = await fetch('https://api.groq.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`,
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`STT request failed: ${response.statusText}`);
            }

            const data = await response.json();
            const transcript = data.text;
            
            this.transcriptText.textContent = transcript;
            this.addMessage(transcript, 'user');
            await this.sendToBackend(transcript);

        } catch (error) {
            console.error('Error processing audio with Groq:', error);
            this.handleError('Failed to process audio. Please try again.');
        }
    }

    async sendToBackend(text) {
        try {
            const response = await fetch('https://inventory-va.onrender.com/api/v1/chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${this.authToken}`,
                },
                body: JSON.stringify({
                    message: text,
                    timestamp: new Date().toISOString(),
                }),
            });

            if (response.status === 401) {
                // Token is invalid or expired
                this.handleLogout();
                this.addMessage('Your session has expired. Please login again.', 'assistant');
                return;
            }

            if (!response.ok) {
                throw new Error(`Backend request failed: ${response.statusText}`);
            }

            const data = await response.json();
            const assistantResponse = data.response || data.message;

            this.addMessage(assistantResponse, 'assistant');
            this.saveChatToHistory(text, assistantResponse);
            
            if (this.audioEnabled) {
                await this.speakWithGroq(assistantResponse);
            }

        } catch (error) {
            console.error('Error sending to backend:', error);
            const fallbackResponse = "I'm sorry, I couldn't connect to the server right now. Please check your connection and try again.";
            this.addMessage(fallbackResponse, 'assistant');
            this.saveChatToHistory(text, fallbackResponse);
            
            if (this.audioEnabled) {
                this.speakWithWebAPI(fallbackResponse);
            }
        } finally {
            this.isProcessing = false;
            this.updateUI('idle');
        }
    }

    saveChatToHistory(userMessage, assistantResponse) {
        // Create a new chat entry if we don't have one
        if (!this.currentChatId) {
            this.currentChatId = Date.now();
            this.chatHistory.unshift({
                id: this.currentChatId,
                title: userMessage.length > 30 ? userMessage.substring(0, 30) + '...' : userMessage,
                messages: [
                    { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
                    { role: 'assistant', content: assistantResponse, timestamp: new Date().toISOString() }
                ]
            });
        } else {
            // Find the current chat and add the new messages
            const currentChat = this.chatHistory.find(chat => chat.id === this.currentChatId);
            if (currentChat) {
                currentChat.messages.push(
                    { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
                    { role: 'assistant', content: assistantResponse, timestamp: new Date().toISOString() }
                );
            }
        }
        
        // Save to localStorage
        localStorage.setItem('chatHistory', JSON.stringify(this.chatHistory));
        
        // Update the chat history UI
        this.loadChatHistory();
    }

    loadChatHistory() {
        this.chatHistoryList.innerHTML = '';
        
        this.chatHistory.forEach(chat => {
            const li = document.createElement('li');
            li.className = 'chat-item';
            if (chat.id === this.currentChatId) {
                li.classList.add('active');
            }
            
            const a = document.createElement('a');
            a.href = '#';
            a.innerHTML = `<i class="fa-solid fa-message"></i> <span>${chat.title}</span>`;
            
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.loadChat(chat.id);
            });
            
            li.appendChild(a);
            this.chatHistoryList.appendChild(li);
        });
    }

    loadChat(chatId) {
        const chat = this.chatHistory.find(c => c.id === chatId);
        if (!chat) return;
        
        this.currentChatId = chatId;
        
        // Clear current chat
        this.chatContainer.innerHTML = '';
        
        // Add all messages from the chat
        chat.messages.forEach(message => {
            this.addMessage(message.content, message.role);
        });
        
        // Switch to chat view
        document.getElementById('welcomeContent').style.display = 'none';
        this.chatContainer.style.display = 'flex';
        document.getElementById('chatArea').classList.add('chat-mode');
        
        // Update active state in history
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`.chat-item a[href="#"] span:contains("${chat.title}")`).closest('.chat-item').classList.add('active');
    }

    async speakWithGroq(text) {
        try {
            console.log('Sending TTS request with text:', text);
            const response = await fetch('https://api.groq.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'playai-tts-arabic',
                    voice: 'Nasser-PlayAI',
                    input: text,
                    response_format: 'wav',
                }),
            });

            console.log('TTS response status:', response.status);
            if (!response.ok) {
                const errorData = await response.json();
                console.error('TTS error response:', errorData);
                throw new Error(`TTS request failed: ${response.statusText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            audio.onplay = () => this.updateUI('playing');
            audio.onended = () => this.updateUI('idle');
            
            await audio.play();

        } catch (error) {
            console.error('Error with Groq TTS:', error);
            this.speakWithWebAPI(text);
        }
    }

    speakWithWebAPI(text) {
        if (!this.audioEnabled || !this.synthesis) return;

        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => this.updateUI('playing');
        utterance.onend = () => this.updateUI('idle');
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            this.updateUI('idle');
        };

        this.synthesis.speak(utterance);
    }

    addMessage(text, type) {
        const welcomeMessage = this.chatContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        // Switch to chat mode if we're not already in it
        if (document.getElementById('welcomeContent').style.display !== 'none') {
            document.getElementById('welcomeContent').style.display = 'none';
            this.chatContainer.style.display = 'flex';
            document.getElementById('chatArea').classList.add('chat-mode');
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.textContent = text;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        
        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(timeDiv);
        
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    updateUI(state) {
        this.micButton.classList.remove('recording', 'processing');
        this.statusDot.classList.remove('recording', 'processing');
        this.waveAnimation.classList.remove('active');
        this.transcriptDisplay.classList.remove('active');
        
        this.micIcon.classList.remove('hidden');
        this.loadingIcon.classList.add('hidden');
        this.stopButton.classList.add('hidden');

        switch (state) {
            case 'recording':
                this.micButton.classList.add('recording');
                this.statusDot.classList.add('recording');
                this.statusText.textContent = 'Listening...';
                this.waveAnimation.classList.add('active');
                this.transcriptDisplay.classList.add('active');
                this.stopButton.classList.remove('hidden');
                break;
                
            case 'processing':
                this.micButton.classList.add('processing');
                this.statusDot.classList.add('processing');
                this.statusText.textContent = 'Processing...';
                this.micIcon.classList.add('hidden');
                this.loadingIcon.classList.remove('hidden');
                this.transcriptDisplay.classList.remove('active');
                break;
                
            case 'playing':
                this.statusText.textContent = 'Speaking...';
                break;
                
            default: // idle
                this.statusText.textContent = 'Ready';
                this.transcriptDisplay.classList.remove('active');
                break;
        }
    }

    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        const volumeOn = this.volumeButton.querySelector('.volume-on');
        const volumeOff = this.volumeButton.querySelector('.volume-off');
        
        if (this.audioEnabled) {
            volumeOn.classList.remove('hidden');
            volumeOff.classList.add('hidden');
        } else {
            volumeOn.classList.add('hidden');
            volumeOff.classList.remove('hidden');
            if (this.synthesis) {
                this.synthesis.cancel();
            }
        }
    }

    handleError(message) {
        this.isRecording = false;
        this.isProcessing = false;
        this.updateUI('idle');
        this.addMessage(message, 'assistant');
        console.error('Voice Assistant Error:', message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
    console.log('Voice Assistant initialized');
    
    console.log(`
🎤 Voice Assistant Ready!

Using Groq APIs:
✅ Speech-to-Text: whisper-large-v3-turbo
✅ Text-to-Speech: playai-tts-arabic (Nasser-PlayAI voice)
✅ Web Speech API as fallback

Authentication:
✅ Local admin authentication (username: admin, password: admin)
✅ Token-based authentication
✅ Automatic token storage

Chat Features:
✅ Chat history persistence
✅ Multiple chat sessions
✅ Local storage of conversations

To use:
1. Login with admin credentials
2. Click microphone to start recording
3. Speak your query
4. View response in chat interface

Keyboard shortcuts:
- Hold SPACE to record (like push-to-talk)
- ESC to stop recording

Features:
✅ Microphone recording
✅ Groq STT integration
✅ Groq TTS integration (Arabic)
✅ Web Speech API fallback
✅ Audio playback
✅ Responsive design
✅ Beautiful UI animations
    `);
});
