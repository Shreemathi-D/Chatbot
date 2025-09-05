// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license.

// Global objects
var speechRecognizer;
var avatarSynthesizer;
var peerConnection;
var peerConnectionDataChannel;
var messages = [];
var messageInitiated = false;
var sentenceLevelPunctuations = ['.', '?', '!', ':', ';', '。', '？', '！', '：', '；'];
var enableDisplayTextAlignmentWithSpeech = true;
var isSpeaking = false;
var isReconnecting = false;
var speakingText = "";
var spokenTextQueue = [];
var repeatSpeakingSentenceAfterReconnection = true;
var sessionActive = false;
var userClosedSession = false;
var lastInteractionTime = new Date();
var lastSpeakTime;
var pendingQueries = [];
var config;

// Load config async (replace with your config file logic)
async function loadConfig() {
  console.log("Loading configuration...");
  try {
    // Placeholder: Replace with fetch('config.json')
    config = await Promise.resolve({
      cogSvcRegion: "eastus2",
      cogSvcSubKey: "Cz4BbPc7lZ9XlsBO0qUVgqLsvmoSa1Nq4dgoxmAurG7lFgVubdyTJQQJ99BHACHYHv6XJ3w3AAAAACOGowZU",
      talkingAvatarCharacter: "max",
      talkingAvatarStyle: "formal",
      ttsVoice: "en-US-AndrewMultilingualNeural",
      sttLocales: ["en-US"],
      systemPrompt: "You are a helpful assistant."
    });
    console.log("Configuration loaded:", config);
  } catch (error) {
    console.error("Failed to load config:", error);
    alert("Failed to load configuration. Check console.");
  }
}

// Verify Azure Speech SDK
function checkSpeechSDK() {
  console.log("Checking Azure Speech SDK...");
  if (typeof SpeechSDK === 'undefined') {
    console.error("Azure Speech SDK not loaded.");
    alert("Failed to load Azure Speech SDK. Check network or browser.");
    return false;
  }
  console.log("Azure Speech SDK loaded.");
  return true;
}

// Connect to avatar service
async function connectAvatar() {
  console.log("Starting avatar session...");
  document.getElementById('startSession').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg> Starting...';
  document.getElementById('startSession').disabled = true;
  document.getElementById('chatHistory').innerHTML = '<div class="system-message"><span>Session starting...</span></div>';
  document.getElementById('chatHistory').hidden = false;

  if (!config) {
    await loadConfig();
  }

  if (!checkSpeechSDK()) {
    document.getElementById('startSession').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg> Start Session';
    document.getElementById('startSession').disabled = false;
    document.getElementById('chatHistory').innerHTML = '<div class="system-message"><span>Failed to start session. Check console.</span></div>';
    return;
  }

  try {
    const speechSynthesisConfig = SpeechSDK.SpeechConfig.fromSubscription(config.cogSvcSubKey, config.cogSvcRegion);
    const avatarConfig = new SpeechSDK.AvatarConfig(config.talkingAvatarCharacter, config.talkingAvatarStyle);
    avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechSynthesisConfig, avatarConfig);
    avatarSynthesizer.avatarEventReceived = function (s, e) {
      console.log(`Event received: ${e.description}, offset: ${e.offset / 10000}ms`);
    };

    const speechRecognitionConfig = SpeechSDK.SpeechConfig.fromEndpoint(
      new URL(`wss://${config.cogSvcRegion}.stt.speech.microsoft.com/speech/universal/v2`),
      config.cogSvcSubKey
    );
    speechRecognitionConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
    const autoDetectSourceLanguageConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(config.sttLocales);
    speechRecognizer = SpeechSDK.SpeechRecognizer.FromConfig(
      speechRecognitionConfig,
      autoDetectSourceLanguageConfig,
      SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()
    );

    if (!messageInitiated) {
      initMessages();
      messageInitiated = true;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://${config.cogSvcRegion}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1`);
    xhr.setRequestHeader("Ocp-Apim-Subscription-Key", config.cogSvcSubKey);
    xhr.addEventListener("readystatechange", function () {
      if (this.readyState === 4) {
        if (this.status === 200) {
          console.log("WebRTC token fetched.");
          const responseData = JSON.parse(this.responseText);
          setupWebRTC(responseData.Urls[0], responseData.Username, responseData.Password);
        } else {
          console.error(`Failed to fetch WebRTC token: ${this.status}`);
          alert(`Failed to connect to avatar service. Status: ${this.status}. Check credentials.`);
          document.getElementById('startSession').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg> Start Session';
          document.getElementById('startSession').disabled = false;
          document.getElementById('chatHistory').innerHTML = '<div class="system-message"><span>Failed to start session. Check console.</span></div>';
          avatarSynthesizer = null;
        }
      }
    });
    xhr.send();
  } catch (error) {
    console.error("Error initializing avatar:", error);
    alert("Failed to initialize avatar. Check console.");
    document.getElementById('startSession').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg> Start Session';
    document.getElementById('startSession').disabled = false;
    document.getElementById('chatHistory').innerHTML = '<div class="system-message"><span>Failed to start session. Check console.</span></div>';
  }
}

// Disconnect from avatar service
function disconnectAvatar() {
  console.log("Disconnecting avatar session...");
  if (avatarSynthesizer) {
    avatarSynthesizer.close();
    avatarSynthesizer = null;
  }
  if (speechRecognizer) {
    speechRecognizer.stopContinuousRecognitionAsync();
    speechRecognizer.close();
    speechRecognizer = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  sessionActive = false;
  userClosedSession = true;
  pendingQueries = [];
  document.getElementById('microphone').disabled = true;
  document.getElementById('stopSession').disabled = true;
  document.getElementById('userMessageBox').disabled = true;
  document.getElementById('chatHistory').hidden = true;
  document.getElementById('startSession').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg> Start Session';
  document.getElementById('startSession').disabled = false;
  updateUI();
}

// Setup WebRTC
function setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential) {
  console.log("Setting up WebRTC...");
  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: [iceServerUrl], username: iceServerUsername, credential: iceServerCredential }]
  });

  peerConnection.ontrack = function (event) {
    if (event.track.kind === 'audio') {
      let audioElement = document.createElement('audio');
      audioElement.id = 'audioPlayer';
      audioElement.srcObject = event.streams[0];
      audioElement.autoplay = false;
      audioElement.addEventListener('loadeddata', () => audioElement.play());
      audioElement.onplaying = () => console.log(`WebRTC ${event.track.kind} channel connected.`);
      let remoteVideoDiv = document.getElementById('remoteVideo');
      for (let i = 0; i < remoteVideoDiv.childNodes.length; i++) {
        if (remoteVideoDiv.childNodes[i].localName === event.track.kind) {
          remoteVideoDiv.removeChild(remoteVideoDiv.childNodes[i]);
        }
      }
      remoteVideoDiv.appendChild(audioElement);
    }

    if (event.track.kind === 'video') {
      let videoElement = document.createElement('video');
      videoElement.id = 'videoPlayer';
      videoElement.srcObject = event.streams[0];
      videoElement.autoplay = false;
      videoElement.addEventListener('loadeddata', () => videoElement.play());
      videoElement.playsInline = true;
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      videoElement.style.borderRadius = '9999px';
      document.getElementById('remoteVideo').appendChild(videoElement);

      videoElement.onplaying = () => {
        let remoteVideoDiv = document.getElementById('remoteVideo');
        for (let i = 0; i < remoteVideoDiv.childNodes.length; i++) {
          if (remoteVideoDiv.childNodes[i].localName === event.track.kind) {
            remoteVideoDiv.removeChild(remoteVideoDiv.childNodes[i]);
          }
        }
        remoteVideoDiv.appendChild(videoElement);
        console.log(`WebRTC ${event.track.kind} channel connected.`);
        document.getElementById('microphone').disabled = false;
        document.getElementById('stopSession').disabled = false;
        document.getElementById('userMessageBox').disabled = false;
        document.getElementById('chatHistory').innerHTML = ''; // Clear "Session starting..."
        document.getElementById('chatHistory').hidden = false;
        isReconnecting = false;
        setTimeout(() => {
          sessionActive = true;
          console.log("Session active, processing pending queries:", pendingQueries);
          while (pendingQueries.length > 0) {
            handleUserQuery(pendingQueries.shift());
          }
          updateUI();
        }, 300);
      };
    }
  };

  peerConnection.addEventListener("datachannel", event => {
    peerConnectionDataChannel = event.channel;
    peerConnectionDataChannel.onmessage = e => {
      console.log(`[${(new Date()).toISOString()}] WebRTC event: ${e.data}`);
    };
  });

  peerConnection.createDataChannel("eventChannel");
  peerConnection.oniceconnectionstatechange = () => {
    console.log(`WebRTC status: ${peerConnection.iceConnectionState}`);
  };

  peerConnection.addTransceiver('video', { direction: 'sendrecv' });
  peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

  avatarSynthesizer.startAvatarAsync(peerConnection).then((r) => {
    if (r.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
      console.log(`[${(new Date()).toISOString()}] Avatar started. Result ID: ${r.resultId}`);
    } else {
      console.log(`[${(new Date()).toISOString()}] Unable to start avatar. Result ID: ${r.resultId}`);
      document.getElementById('startSession').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg> Start Session';
      document.getElementById('startSession').disabled = false;
      document.getElementById('chatHistory').innerHTML = '<div class="system-message"><span>Failed to start session. Check console.</span></div>';
    }
  }).catch((error) => {
    console.error(`[${(new Date()).toISOString()}] Avatar failed to start: ${error}`);
    alert("Failed to start avatar. Check console.");
    document.getElementById('startSession').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg> Start Session';
    document.getElementById('startSession').disabled = false;
    document.getElementById('chatHistory').innerHTML = '<div class="system-message"><span>Failed to start session. Check console.</span></div>';
  });
}

// Initialize messages
function initMessages() {
  messages = [{
    role: 'system',
    content: config.systemPrompt
  }];
}

// HTML encode text
function htmlEncode(text) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  return String(text).replace(/[&<>"'\/]/g, match => entityMap[match]);
}

// Speak text
function speak(text, endingSilenceMs = 0) {
  if (isSpeaking) {
    spokenTextQueue.push(text);
    return;
  }
  speakNext(text, endingSilenceMs);
}

function speakNext(text, endingSilenceMs = 0, skipUpdatingChatHistory = false) {
  let ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${config.ttsVoice}'><mstts:leadingsilence-exact value='0'/>${htmlEncode(text)}</voice></speak>`;
  if (endingSilenceMs > 0) {
    ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${config.ttsVoice}'><mstts:leadingsilence-exact value='0'/>${htmlEncode(text)}<break time='${endingSilenceMs}ms' /></voice></speak>`;
  }

  if (enableDisplayTextAlignmentWithSpeech && !skipUpdatingChatHistory) {
    let chatHistoryTextArea = document.getElementById('chatHistory');
    chatHistoryTextArea.innerHTML += `<div class="assistant-message"><span>${text.replace(/\n/g, '<br/>')}</span></div>`;
    chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;
  }

  lastSpeakTime = new Date();
  isSpeaking = true;
  speakingText = text;
  document.getElementById('stopSpeaking').disabled = false;
  avatarSynthesizer.speakSsmlAsync(ssml).then(
    (result) => {
      if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
        console.log(`Speech synthesized for text [${text}]. Result ID: ${result.resultId}`);
        lastSpeakTime = new Date();
      } else {
        console.log(`Error speaking SSML. Result ID: ${result.resultId}`);
      }
      speakingText = '';
      if (spokenTextQueue.length > 0) {
        speakNext(spokenTextQueue.shift());
      } else {
        isSpeaking = false;
        document.getElementById('stopSpeaking').disabled = true;
        updateUI();
      }
    }).catch((error) => {
      console.error(`Error speaking SSML: ${error}`);
      speakingText = '';
      if (spokenTextQueue.length > 0) {
        speakNext(spokenTextQueue.shift());
      } else {
        isSpeaking = false;
        document.getElementById('stopSpeaking').disabled = true;
        updateUI();
      }
    });
}

function stopSpeaking() {
  lastInteractionTime = new Date();
  spokenTextQueue = [];
  avatarSynthesizer.stopSpeakingAsync().then(() => {
    isSpeaking = false;
    document.getElementById('stopSpeaking').disabled = true;
    console.log(`[${(new Date()).toISOString()}] Stop speaking request sent.`);
    updateUI();
  }).catch((error) => {
    console.error(`Error stopping speaking: ${error}`);
    updateUI();
  });
}

function handleUserQuery(userQuery) {
  console.log("Handling user query:", userQuery);
  if (!sessionActive) {
    console.log("Session not active, queuing query:", userQuery);
    pendingQueries.push(userQuery);
    let chatHistoryTextArea = document.getElementById('chatHistory');
    chatHistoryTextArea.innerHTML = '<div class="system-message"><span>Session starting, query queued...</span></div>';
    return;
  }

  lastInteractionTime = new Date();
  let chatMessage = {
    role: 'user',
    content: userQuery
  };
  messages.push(chatMessage);

  let chatHistoryTextArea = document.getElementById('chatHistory');
  chatHistoryTextArea.innerHTML += `<div class="user-message"><span>${htmlEncode(userQuery)}</span></div>`;
  chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;

  if (isSpeaking) {
    stopSpeaking();
  }

  console.log("Sending request to /ask_agent...");
  fetch("https://inventory-va.onrender.com/api/v1/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: "213gdyu",
      query: userQuery
    })
  })
  .then(response => {
    console.log("Received /ask_agent response, status:", response.status);
    if (!response.ok) {
      return response.text().then(message => {
        throw new Error(`HTTP ${response.status}: ${message}`);
      });
    }
    return response.json();
  })
  .then(data => {
    console.log("Parsed /ask_agent response:", data);
    const assistantReply = data.message;
    if (!assistantReply) {
      console.error("Empty response from /ask_agent.");
      return;
    }
    const transcriptionDiv = document.getElementById("transcriptionText");
    transcriptionDiv.innerHTML += `<div><b>Agent:</b> ${htmlEncode(assistantReply)}<br></div><br>`;
    transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;

    let assistantMessage = {
      role: 'assistant',
      content: assistantReply 
    };
    messages.push(assistantMessage);

    let spokenSentence = '';
    let displaySentence = '';
    const tokens = assistantReply.split(/([.!?;:。？！：；])/);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      displaySentence += token;
      spokenSentence += token;
      if (sentenceLevelPunctuations.includes(token)) {
        if (spokenSentence.trim()) {
          speak(spokenSentence);
          spokenSentence = '';
        }
        if (!enableDisplayTextAlignmentWithSpeech) {
          chatHistoryTextArea.innerHTML += `<div class="assistant-message"><span>${displaySentence.replace(/\n/g, '<br/>')}</span></div>`;
          chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;
          displaySentence = '';
        }
      }
    }

    if (spokenSentence.trim()) {
      speak(spokenSentence);
    }
    if (!enableDisplayTextAlignmentWithSpeech && displaySentence) {
      chatHistoryTextArea.innerHTML += `<div class="assistant-message"><span>${displaySentence.replace(/\n/g, '<br/>')}</span></div>`;
      chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;
    }
  })
  .catch(err => {
    console.error("Error from /ask_agent:", err);
    alert(`Failed to get response: ${err.message}`);
    chatHistoryTextArea.innerHTML += `<div class="system-message"><span>Error: ${htmlEncode(err.message)}</span></div>`;
    chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;
  });
}

function checkHung() {
  let videoElement = document.getElementById('videoPlayer');
  if (videoElement && sessionActive) {
    let videoTime = videoElement.currentTime;
    setTimeout(() => {
      if (videoElement.currentTime === videoTime && sessionActive) {
        sessionActive = false;
        console.log(`[${(new Date()).toISOString()}] Video stream disconnected, reconnecting...`);
        isReconnecting = true;
        if (peerConnectionDataChannel) {
          peerConnectionDataChannel.onmessage = null;
        }
        if (avatarSynthesizer) {
          avatarSynthesizer.close();
        }
        connectAvatar();
      }
    }, 2000);
  }
}

function toggleChat() {
  const panel = document.getElementById("chatHistoryPanel");
  const toggleBtn = document.getElementById("toggleChat");
  if (panel.style.display === "none" || panel.style.display === "") {
    panel.style.display = "flex";
    toggleBtn.innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97c-.814-.265-1.587-.81-2.145-1.607C2.475 18.564 2 17.433 2 16.5V5.25c0-2.485 2.015-4.5 4.5-4.5h10.5c2.485 0 4.5 2.015 4.5 4.5v11.25zm-4.5-11.25H6.75c-.621 0-1.125.504-1.125 1.125v11.625c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125z" /></svg> Hide Transcriptions';
  } else {
    panel.style.display = "none";
    toggleBtn.innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97c-.814-.265-1.587-.81-2.145-1.607C2.475 18.564 2 17.433 2 16.5V5.25c0-2.485 2.015-4.5 4.5-4.5h10.5c2.485 0 4.5 2.015 4.5 4.5v11.25zm-4.5-11.25H6.75c-.621 0-1.125.504-1.125 1.125v11.625c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125z" /></svg> Show Transcriptions';
  }
  console.log("toggleChat triggered, panel display:", panel.style.display);
}

function showLiveCaption(text) {
  const captionDiv = document.getElementById("liveCaption");
  captionDiv.textContent = text;
  captionDiv.hidden = false;

  clearTimeout(captionDiv._hideTimeout);
  captionDiv._hideTimeout = setTimeout(() => {
    captionDiv.hidden = true;
  }, 4000);
}

// Update UI based on session state
function updateUI() {
  try {
    document.getElementById('remoteVideo').classList.toggle('animate-pulse', sessionActive);
    document.getElementById('remoteVideo').classList.toggle('shadow-blue-300/50', sessionActive);
    document.getElementById('statusIndicator').classList.toggle('bg-green-500', sessionActive);
    document.getElementById('statusIndicator').classList.toggle('bg-slate-400', !sessionActive);
    const micButton = document.getElementById('microphone');
    micButton.classList.toggle('bg-gradient-to-r', true);
    micButton.classList.toggle('from-blue-600', !isMicActive);
    micButton.classList.toggle('to-indigo-600', !isMicActive);
    micButton.classList.toggle('hover:from-blue-700', !isMicActive);
    micButton.classList.toggle('hover:to-indigo-700', !isMicActive);
    micButton.classList.toggle('from-red-600', isMicActive);
    micButton.classList.toggle('to-rose-600', isMicActive);
    micButton.classList.toggle('hover:from-red-700', isMicActive);
    micButton.classList.toggle('hover:to-rose-700', isMicActive);
    micButton.innerHTML = isMicActive
      ? '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3zM6 6l12 12" /></svg> Stop Mic'
      : '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg> Start Mic';
    document.getElementById('stopSpeaking').disabled = !isSpeaking;
    document.getElementById('liveCaption').classList.toggle('hidden', !isSpeaking);
    console.log('UI updated:', { sessionActive, isMicActive, isSpeaking });
  } catch (e) {
    console.error('updateUI error:', e);
  }
}

// Sidebar toggle with debugging
function setupSidebarToggle() {
  try {
    const menuButton = document.getElementById('mobileMenuButton');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (!menuButton || !sidebar || !overlay) {
      console.error('Sidebar elements missing:', {
        menuButton: !!menuButton,
        sidebar: !!sidebar,
        overlay: !!overlay
      });
      return;
    }
    menuButton.addEventListener('click', () => {
      try {
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
        console.log('Sidebar toggled, translate-x-full:', sidebar.classList.contains('-translate-x-full'));
      } catch (e) {
        console.error('Sidebar toggle error:', e);
      }
    });
    document.getElementById('closeSidebar').addEventListener('click', () => {
      try {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        console.log('Sidebar closed');
      } catch (e) {
        console.error('Close sidebar error:', e);
      }
    });
    document.getElementById('mobileOverlay').addEventListener('click', () => {
      try {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        console.log('Sidebar closed via overlay');
      } catch (e) {
        console.error('Overlay close error:', e);
      }
    });
    console.log('Sidebar toggle setup complete');
  } catch (e) {
    console.error('setupSidebarToggle error:', e);
  }
}

window.onload = async () => {
  await loadConfig();
  setInterval(checkHung, 2000);
  setupSidebarToggle();
  updateUI();
  document.getElementById('userMessageBox').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      const userQuery = document.getElementById('userMessageBox').value.trim();
      if (userQuery) {
        const transcriptionDiv = document.getElementById("transcriptionText");
        transcriptionDiv.innerHTML += `<div><b>User:</b> ${htmlEncode(userQuery)}<br></div><br>`;
        transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
        handleUserQuery(userQuery);
        document.getElementById('userMessageBox').value = '';
        document.getElementById('sendMessage').disabled = true;
      }
    }
  });
  document.getElementById('sendMessage').addEventListener('click', () => {
    const userQuery = document.getElementById('userMessageBox').value.trim();
    if (userQuery) {
      const transcriptionDiv = document.getElementById("transcriptionText");
      transcriptionDiv.innerHTML += `<div><b>User:</b> ${htmlEncode(userQuery)}<br></div><br>`;
      transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
      handleUserQuery(userQuery);
      document.getElementById('userMessageBox').value = '';
      document.getElementById('sendMessage').disabled = true;
    }
  });
  document.getElementById('userMessageBox').addEventListener('input', () => {
    document.getElementById('sendMessage').disabled = !document.getElementById('userMessageBox').value.trim();
  });
  document.getElementById('clearChatHistory').addEventListener('click', () => {
    document.getElementById('chatHistory').innerHTML = '';
    document.getElementById('transcriptionText').innerHTML = '<div class="text-slate-500 text-center py-8">Conversation transcripts will appear here...</div>';
    console.log('Chat history cleared');
  });
  document.getElementById('closeTranscription').addEventListener('click', () => {
    document.getElementById('chatHistoryPanel').style.display = 'none';
    document.getElementById('toggleChat').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97c-.814-.265-1.587-.81-2.145-1.607C2.475 18.564 2 17.433 2 16.5V5.25c0-2.485 2.015-4.5 4.5-4.5h10.5c2.485 0 4.5 2.015 4.5 4.5v11.25zm-4.5-11.25H6.75c-.621 0-1.125.504-1.125 1.125v11.625c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125z" /></svg> Show Transcriptions';
    console.log('Transcription panel closed');
  });
};

window.startSession = () => {
  lastInteractionTime = new Date();
  userClosedSession = false;
  connectAvatar();
};

window.stopSession = () => {
  lastInteractionTime = new Date();
  disconnectAvatar();
};

window.microphone = () => {
  lastInteractionTime = new Date();
  isMicActive = !isMicActive;
  if (isMicActive) {
    document.getElementById('microphone').disabled = true;
    speechRecognizer.startContinuousRecognitionAsync(() => {
      document.getElementById('microphone').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3zM6 6l12 12" /></svg> Stop Mic';
      document.getElementById('microphone').disabled = false;
      updateUI();
    }, (err) => {
      console.error("Failed to start recognition:", err);
      document.getElementById('microphone').disabled = false;
      isMicActive = false;
      updateUI();
    });

    speechRecognizer.recognized = async (s, e) => {
      if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
        let userQuery = e.result.text.trim();
        if (userQuery) {
          if (isSpeaking) {
            console.log("User started speaking - stopping avatar speech...");
            stopSpeaking();
          }
          const transcriptionDiv = document.getElementById("transcriptionText");
          transcriptionDiv.innerHTML += `<div><b>User:</b> ${htmlEncode(userQuery)}<br></div><br>`;
          transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
          handleUserQuery(userQuery);
        }
      }
    };
  } else {
    speechRecognizer.stopContinuousRecognitionAsync(() => {
      document.getElementById('microphone').innerHTML = '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg> Start Mic';
      document.getElementById('microphone').disabled = false;
      updateUI();
    }, (err) => {
      console.error("Failed to stop recognition:", err);
      document.getElementById('microphone').disabled = false;
      updateUI();
    });
  }
};

window.stopSpeaking = stopSpeaking;

window.clearChatHistory = () => {
  document.getElementById('chatHistory').innerHTML = '';
  document.getElementById('transcriptionText').innerHTML = '<div class="text-slate-500 text-center py-8">Conversation transcripts will appear here...</div>';
  console.log('Chat history cleared');
};
