/**
 * Hearloop Widget v1.0.0
 * Embeddable voice feedback capture widget
 * Usage: Hearloop.init({ apiKey, promptText, maxDurationSec, position })
 */
(function (global) {
    'use strict';
  
    const DEFAULT_CONFIG = {
      apiKey: '',
      promptText: 'How was your experience today?',
      maxDurationSec: 5,
      position: 'bottom-right',
      accentColor: '#1D9E75',
      apiBaseUrl: 'http://18.189.188.126:3001/v1',
    };
  
    const STYLES = `
      #hl-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      #hl-fab {
        position: fixed;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        transition: transform 0.2s ease, background 0.2s ease;
      }
      #hl-fab:hover { transform: scale(1.08); }
      #hl-fab:active { transform: scale(0.96); }
      #hl-fab.bottom-right { bottom: 24px; right: 24px; }
      #hl-fab.bottom-left { bottom: 24px; left: 24px; }
      #hl-panel {
        position: fixed;
        width: 260px;
        background: #ffffff;
        border: 0.5px solid rgba(0,0,0,0.12);
        border-radius: 16px;
        padding: 18px;
        z-index: 999998;
        display: none;
        flex-direction: column;
        gap: 12px;
        transition: opacity 0.2s ease, transform 0.2s ease;
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      #hl-panel.bottom-right { bottom: 86px; right: 24px; }
      #hl-panel.bottom-left { bottom: 86px; left: 24px; }
      #hl-panel.open { opacity: 1; transform: translateY(0) scale(1); }
      #hl-title { font-size: 13px; font-weight: 600; color: #111; }
      #hl-prompt { font-size: 11px; color: #888; line-height: 1.4; }
      #hl-mic-btn {
        width: 100%;
        height: 76px;
        border-radius: 10px;
        background: #f5f5f5;
        border: 0.5px solid rgba(0,0,0,0.1);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: background 0.15s, border-color 0.15s;
      }
      #hl-mic-btn:hover { background: #edfaf4; border-color: rgba(29,158,117,0.3); }
      #hl-mic-btn.recording { background: #fff5f5; border-color: rgba(226,75,74,0.3); }
      #hl-mic-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      #hl-mic-label { font-size: 12px; color: #666; }
      #hl-mic-btn.recording #hl-mic-label { color: #a32d2d; }
      #hl-waveform { display: flex; align-items: center; gap: 2px; height: 22px; }
      .hl-bar {
        width: 3px;
        border-radius: 99px;
        background: #E24B4A;
        animation: hlPulse 0.55s ease-in-out infinite;
      }
      .hl-bar:nth-child(1){animation-delay:0s;height:6px}
      .hl-bar:nth-child(2){animation-delay:.08s;height:12px}
      .hl-bar:nth-child(3){animation-delay:.16s;height:18px}
      .hl-bar:nth-child(4){animation-delay:.24s;height:14px}
      .hl-bar:nth-child(5){animation-delay:.16s;height:20px}
      .hl-bar:nth-child(6){animation-delay:.08s;height:10px}
      .hl-bar:nth-child(7){animation-delay:0s;height:6px}
      @keyframes hlPulse { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
      #hl-timer { font-size: 11px; color: #aaa; text-align: center; display: none; }
      #hl-send {
        width: 100%;
        padding: 9px;
        border-radius: 10px;
        border: none;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        color: #fff;
        transition: opacity 0.15s;
      }
      #hl-send:disabled { opacity: 0.4; cursor: not-allowed; }
      #hl-footer { font-size: 10px; color: #bbb; text-align: center; }
      #hl-success { display: none; flex-direction: column; align-items: center; gap: 10px; padding: 8px 0; }
      #hl-check { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
      #hl-success-title { font-size: 13px; font-weight: 600; color: #111; }
      #hl-success-sub { font-size: 11px; color: #888; text-align: center; line-height: 1.5; }
      #hl-reset { margin-top: 4px; font-size: 11px; padding: 5px 12px; border-radius: 8px; border: 0.5px solid rgba(0,0,0,0.15); background: transparent; color: #888; cursor: pointer; }
      #hl-error { font-size: 11px; color: #a32d2d; background: #fff5f5; border: 0.5px solid rgba(226,75,74,0.3); border-radius: 8px; padding: 8px 10px; display: none; }
    `;
  
    const MIC_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2C8 2 6 3.2 6 6V9.5C6 10.9 6.9 12 8 12C9.1 12 10 10.9 10 9.5V6C10 3.2 8 2 8 2Z" fill="white"/>
      <path d="M5 10.5C5 12.4 6.3 14 8 14C9.7 14 11 12.4 11 10.5" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M8 14V15.5" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`;
  
    const PLAY_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4 2.5L11 7L4 11.5V2.5Z" fill="white"/>
    </svg>`;
  
    const CHECK_SVG = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10L8 14L16 6" stroke="#1D9E75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  
    const LOGO_SVG = (color) => `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 3C11 3 5.5 7 5.5 12C5.5 14.5 8 16.5 11 16.5C14 16.5 16.5 14.5 16.5 12C16.5 7 11 3 11 3Z" fill="white" opacity=".92"/>
      <circle cx="11" cy="12" r="2.2" fill="white" opacity=".55"/>
    </svg>`;
  
    class HearloopWidget {
      constructor(config) {
        this.config = Object.assign({}, DEFAULT_CONFIG, config);
        this.state = 'idle'; // idle | recording | recorded | sending | success | error
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.stream = null;
        this.countdownTimer = null;
        this.secondsLeft = this.config.maxDurationSec;
        this.sessionId = null;
        this._inject();
        this._bind();
      }
  
      _inject() {
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);
  
        const pos = this.config.position;
        const ac = this.config.accentColor;
  
        const wrap = document.createElement('div');
        wrap.id = 'hl-widget';
        wrap.innerHTML = `
          <button id="hl-fab" class="${pos}" style="background:${ac};" aria-label="Open feedback widget">
            ${LOGO_SVG(ac)}
          </button>
          <div id="hl-panel" class="${pos}" role="dialog" aria-label="Hearloop feedback">
            <div id="hl-main">
              <div id="hl-title">Share your feedback</div>
              <div id="hl-prompt">${this.config.promptText}</div>
              <button id="hl-mic-btn" aria-label="Tap to record">
                <div id="hl-mic-icon" style="background:${ac};">${MIC_SVG}</div>
                <span id="hl-mic-label">Tap to record feedback</span>
              </button>
              <div id="hl-timer"></div>
              <div id="hl-error"></div>
              <button id="hl-send" style="background:${ac};" disabled>Send feedback</button>
              <div id="hl-footer">Powered by <strong>Hearloop</strong></div>
            </div>
            <div id="hl-success">
              <div id="hl-check" style="background:#E1F5EE;">${CHECK_SVG}</div>
              <div id="hl-success-title">Feedback sent successfully</div>
              <div id="hl-success-sub">Thank you — your voice matters<br>and has been received.</div>
              <button id="hl-reset">Give more feedback</button>
            </div>
          </div>
        `;
        document.body.appendChild(wrap);
      }
  
      _bind() {
        document.getElementById('hl-fab').onclick = () => this._togglePanel();
        document.getElementById('hl-mic-btn').onclick = () => this._toggleRecording();
        document.getElementById('hl-send').onclick = () => this._send();
        document.getElementById('hl-reset').onclick = () => this._reset();
      }
  
      _togglePanel() {
        const panel = document.getElementById('hl-panel');
        const isOpen = panel.style.display === 'flex';
        if (isOpen) {
          panel.classList.remove('open');
          setTimeout(() => { panel.style.display = 'none'; }, 200);
        } else {
          panel.style.display = 'flex';
          requestAnimationFrame(() => panel.classList.add('open'));
        }
      }
  
      async _toggleRecording() {
        if (this.state === 'idle' || this.state === 'recorded') {
          await this._startRecording();
        } else if (this.state === 'recording') {
          this._stopRecording();
        }
      }
  
      async _startRecording() {
        this._clearError();
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          this._showError('Microphone access denied. Please allow mic access and try again.');
          return;
        }
  
        this.audioChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
  
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };
  
        this.mediaRecorder.onstop = () => {
          this.audioBlob = new Blob(this.audioChunks, { type: mimeType });
          this._onRecorded();
        };
  
        this.mediaRecorder.start(100);
        this.state = 'recording';
        this.secondsLeft = this.config.maxDurationSec;
        this._updateUI();
  
        this.countdownTimer = setInterval(() => {
          this.secondsLeft--;
          document.getElementById('hl-timer').textContent = `Recording… ${this.secondsLeft}s remaining`;
          if (this.secondsLeft <= 0) this._stopRecording();
        }, 1000);
      }
  
      _stopRecording() {
        clearInterval(this.countdownTimer);
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
        if (this.stream) {
          this.stream.getTracks().forEach(t => t.stop());
        }
      }
  
      _onRecorded() {
        this.state = 'recorded';
        this._updateUI();
      }
  
      async _send() {
        this.state = 'sending';
        this._updateUI();
        this._clearError();
  
        try {
          // Step 1 — create session
          const sessionRes = await fetch(`${this.config.apiBaseUrl}/sessions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
              promptText: this.config.promptText,
              maxDurationSec: this.config.maxDurationSec,
              consentRequired: false,
              externalEventId: `widget_${Date.now()}`,
            }),
          });
  
          if (!sessionRes.ok) throw new Error('Failed to create session');
          const { sessionId, sessionToken } = await sessionRes.json();
          this.sessionId = sessionId;
  
          // Step 2 — open session
          await fetch(`${this.config.apiBaseUrl}/public/session/${sessionToken}/open`, {
            method: 'POST',
          });
  
          // Step 3 — get upload URL
          const mimeType = this.audioBlob.type;
          const urlRes = await fetch(`${this.config.apiBaseUrl}/sessions/${sessionId}/upload-url`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({ mimeType }),
          });
  
          if (!urlRes.ok) throw new Error('Failed to get upload URL');
          const { uploadUrl, storageKey } = await urlRes.json();
  
          // Step 4 — upload to S3
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: this.audioBlob,
            headers: { 'Content-Type': mimeType },
          });
  
          if (!uploadRes.ok) throw new Error('Audio upload failed');
  
          // Step 5 — finalize
          const finalRes = await fetch(`${this.config.apiBaseUrl}/sessions/${sessionId}/finalize`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
              storageKey,
              mimeType,
              sizeBytes: this.audioBlob.size,
              consentGiven: true,
            }),
          });
  
          if (!finalRes.ok) throw new Error('Failed to finalize session');
  
          this.state = 'success';
          this._updateUI();
        } catch (err) {
          this.state = 'error';
          this._showError('Something went wrong. Please try again.');
          this._updateUI();
        }
      }
  
      _reset() {
        this.state = 'idle';
        this.audioBlob = null;
        this.audioChunks = [];
        this.sessionId = null;
        this.secondsLeft = this.config.maxDurationSec;
        this._clearError();
        this._updateUI();
      }
  
      _updateUI() {
        const micBtn = document.getElementById('hl-mic-btn');
        const micIcon = document.getElementById('hl-mic-icon');
        const micLabel = document.getElementById('hl-mic-label');
        const timer = document.getElementById('hl-timer');
        const sendBtn = document.getElementById('hl-send');
        const main = document.getElementById('hl-main');
        const success = document.getElementById('hl-success');
        const ac = this.config.accentColor;
  
        if (this.state === 'success') {
          main.style.display = 'none';
          success.style.display = 'flex';
          return;
        }
  
        main.style.display = 'flex';
        main.style.flexDirection = 'column';
        main.style.gap = '12px';
        success.style.display = 'none';
  
        if (this.state === 'idle') {
          micBtn.classList.remove('recording');
          micIcon.style.background = ac;
          micIcon.innerHTML = MIC_SVG;
          micLabel.textContent = 'Tap to record feedback';
          timer.style.display = 'none';
          sendBtn.disabled = true;
          sendBtn.textContent = 'Send feedback';
        }
  
        if (this.state === 'recording') {
          micBtn.classList.add('recording');
          micIcon.style.background = '#E24B4A';
          micIcon.innerHTML = `<div id="hl-waveform" style="display:flex;align-items:center;gap:2px;height:22px;">${'<div class="hl-bar"></div>'.repeat(7)}</div>`;
          micLabel.textContent = 'Tap to stop';
          timer.style.display = 'block';
          timer.textContent = `Recording… ${this.secondsLeft}s remaining`;
          sendBtn.disabled = true;
          sendBtn.textContent = 'Send feedback';
        }
  
        if (this.state === 'recorded') {
          micBtn.classList.remove('recording');
          micIcon.style.background = ac;
          micIcon.innerHTML = PLAY_SVG;
          micLabel.textContent = 'Recorded — tap to re-record';
          timer.style.display = 'none';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send feedback';
        }
  
        if (this.state === 'sending') {
          sendBtn.disabled = true;
          sendBtn.textContent = 'Sending…';
        }
  
        if (this.state === 'error') {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Try again';
        }
      }
  
      _showError(msg) {
        const el = document.getElementById('hl-error');
        el.textContent = msg;
        el.style.display = 'block';
      }
  
      _clearError() {
        const el = document.getElementById('hl-error');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
      }
    }
  
    global.Hearloop = {
      init(config) {
        if (!config.apiKey) {
          console.warn('[Hearloop] apiKey required');
          return;
        }
        return new HearloopWidget(config);
      }
    };
  
  })(window);