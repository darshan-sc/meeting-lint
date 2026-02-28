const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co/functions/v1/analyze';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const CHUNK_INTERVAL_MS = 3000;

let mediaRecorder = null;
let stream = null;
let isRecording = false;
let accumulatedTranscript = '';

const recordBtn = document.getElementById('recordBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const wsHint = document.getElementById('wsHint');
const transcriptBox = document.getElementById('transcriptBox');
const flagsBox = document.getElementById('flagsBox');

// --- Audio chunk → Supabase ---

async function sendChunk(audioBlob) {
  try {
    const res = await fetch(SUPABASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/webm',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        // Send accumulated transcript so backend has full context
        'X-Transcript': accumulatedTranscript.slice(-2000), // last 2000 chars
      },
      body: audioBlob,
    });

    if (!res.ok) {
      console.error('Backend error:', res.status);
      return;
    }

    const data = await res.json();
    handleResponse(data);
  } catch (e) {
    console.error('Failed to send chunk:', e);
    wsHint.textContent = 'Error reaching backend.';
  }
}

// --- Response handling ---

function handleResponse(data) {
  if (data.transcript) {
    accumulatedTranscript += ' ' + data.transcript;
    appendTranscript(data.transcript);
  }
  if (data.flags && data.flags.length > 0) {
    data.flags.forEach(appendFlag);
  }
}

function appendTranscript(text) {
  const placeholder = transcriptBox.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  const p = document.createElement('p');
  p.textContent = text;
  transcriptBox.appendChild(p);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function appendFlag(flag) {
  const placeholder = flagsBox.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  // flag = { type: 'error' | 'warning', message: '...' }
  const div = document.createElement('div');
  div.className = `flag flag-${flag.type}`;

  const label = document.createElement('span');
  label.className = 'flag-label';
  label.textContent = flag.type === 'error' ? 'Incorrect' : 'Feasibility';

  const msg = document.createElement('span');
  msg.textContent = flag.message;

  div.appendChild(label);
  div.appendChild(msg);
  flagsBox.appendChild(div);
  flagsBox.scrollTop = flagsBox.scrollHeight;
}

// --- Recording ---

async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    wsHint.textContent = 'Microphone access denied.';
    return;
  }

  const mimeType = getSupportedMimeType();
  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      sendChunk(event.data);
    }
  };

  mediaRecorder.start(CHUNK_INTERVAL_MS);
  isRecording = true;
  recordBtn.textContent = 'Stop Recording';
  recordBtn.classList.add('recording');
  setStatus('recording');
  wsHint.textContent = '';
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  mediaRecorder = null;
  stream = null;
  isRecording = false;
  recordBtn.textContent = 'Start Recording';
  recordBtn.classList.remove('recording');
  setStatus('idle');
}

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

// --- UI helpers ---

function setStatus(state) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = {
    idle: 'Ready',
    recording: 'Recording',
  }[state] ?? state;
}

// --- Events ---

recordBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// --- Init ---
recordBtn.disabled = false;
setStatus('idle');
