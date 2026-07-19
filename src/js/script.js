'use strict';

const API_BASE = window.location.origin;
const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=[\w-]{6,}|shorts\/[\w-]{6,}|embed\/[\w-]{6,})|youtu\.be\/[\w-]{6,})([?&]\S*)?$/;
const REQUEST_TIMEOUT_MS = 20000;

const els = {
  form: document.getElementById('url-form'),
  urlInput: document.getElementById('url-input'),
  urlError: document.getElementById('url-error'),
  analyzeBtn: document.getElementById('analyze-btn'),
  results: document.getElementById('results'),
  placeholderCard: document.getElementById('placeholder-card'),
  previewThumb: document.getElementById('preview-thumb'),
  previewChannel: document.getElementById('preview-channel'),
  previewTitle: document.getElementById('preview-title'),
  previewDuration: document.getElementById('preview-duration'),
  videoChips: document.getElementById('video-chips'),
  audioChips: document.getElementById('audio-chips'),
  videoDownloadBtn: document.getElementById('video-download-btn'),
  audioDownloadBtn: document.getElementById('audio-download-btn'),
  videoProgress: document.getElementById('video-progress'),
  videoProgressBar: document.getElementById('video-progress-bar'),
  videoStatus: document.getElementById('video-status'),
  audioProgress: document.getElementById('audio-progress'),
  audioProgressBar: document.getElementById('audio-progress-bar'),
  audioStatus: document.getElementById('audio-status'),
};

let analyzedUrl = '';
let selectedVideoQuality = null;
let selectedAudioQuality = null;

function isValidYoutubeUrl(value) {
  return YOUTUBE_URL_PATTERN.test(value.trim());
}

function setFormError(message) {
  els.urlError.textContent = message;
}

function setAnalyzeLoading(isLoading) {
  els.analyzeBtn.disabled = isLoading;
  els.analyzeBtn.classList.toggle('is-loading', isLoading);
}

function setDownloadLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle('is-loading', isLoading);
}

function setStatus(element, message, state) {
  element.textContent = message;
  if (state) {
    element.dataset.state = state;
  } else {
    delete element.dataset.state;
  }
}

function clearStatus(element) {
  setStatus(element, '', null);
}

function showProgress(wrap) {
  wrap.hidden = false;
}

function hideProgress(wrap, bar) {
  wrap.hidden = true;
  bar.style.width = '0%';
}

function updateProgressValue(bar, percent) {
  bar.style.width = `${percent}%`;
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (data && data.detail) || '*ERROR, ocurrió un error al comunicarse con el servidor.';
      throw new Error(message);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('*ERROR, la solicitud tardó demasiado. inténtelo de nuevo.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildChipGroup(container, values, labelFn, onSelect) {
  container.innerHTML = '';
  if (!values || values.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'No disponible para este vídeo.';
    container.appendChild(empty);
    return;
  }
  values.forEach((value) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', 'false');
    chip.textContent = labelFn(value);
    chip.addEventListener('click', () => {
      Array.from(container.children).forEach((sibling) => sibling.setAttribute('aria-checked', 'false'));
      chip.setAttribute('aria-checked', 'true');
      onSelect(value);
    });
    container.appendChild(chip);
  });
}

function updateDownloadButton(button, formatLabel, qualityLabel) {
  button.querySelector('.btn__label').textContent = `Descargar ${formatLabel}`;
  button.disabled = false;
}

function resetDownloadButton(button) {
  button.querySelector('.btn__label').textContent = 'Seleccione una calidad';
  button.disabled = true;
}

function formatPreciseDuration(durationStr) {
  if (!durationStr) return 'No disponible';
  const parts = durationStr.split(':').map(Number);
  let seconds = 0;
  let minutes = 0;
  let hours = 0;
  let days = 0;
  if (parts.length === 1) {
    seconds = parts[0] || 0;
  } else if (parts.length === 2) {
    minutes = parts[0] || 0;
    seconds = parts[1] || 0;
  } else if (parts.length === 3) {
    hours = parts[0] || 0;
    minutes = parts[1] || 0;
    seconds = parts[2] || 0;
  }

  if (hours >= 24) {
    days = Math.floor(hours / 24);
    hours = hours % 24;
  }

  const result = [];
  if (days > 0) result.push(`${days} ${days === 1 ? 'día' : 'días'}`);
  if (hours > 0) result.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
  if (minutes > 0) result.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
  if (seconds > 0 || result.length === 0) {
    result.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`);
  }
  
  return result.join(', ');
}

function populatePreview(data) {
  els.previewTitle.textContent = `${data.title}`;
  els.previewChannel.textContent = `${data.channel || 'No disponible'}`;
  els.previewDuration.textContent = `Duración: ${formatPreciseDuration(data.duration)}.`;
  
  if (data.thumbnail) {
    els.previewThumb.src = data.thumbnail;
    els.previewThumb.alt = data.title;
  } else {
    els.previewThumb.removeAttribute('src');
    els.previewThumb.alt = '';
  }
}

function populateQualityOptions(data) {
  selectedVideoQuality = null;
  selectedAudioQuality = null;

  buildChipGroup(
    els.videoChips,
    data.video_qualities,
    (q) => `${q}p`,
    (q) => {
      selectedVideoQuality = q;
      updateDownloadButton(els.videoDownloadBtn, 'MP4', `${q}p`);
    }
  );

  buildChipGroup(
    els.audioChips,
    data.audio_qualities,
    (q) => `${q} kbps`,
    (q) => {
      selectedAudioQuality = q;
      updateDownloadButton(els.audioDownloadBtn, 'MP3', `${q} kbps`);
    }
  );

  resetDownloadButton(els.videoDownloadBtn);
  resetDownloadButton(els.audioDownloadBtn);
  clearStatus(els.videoStatus);
  clearStatus(els.audioStatus);
  hideProgress(els.videoProgress, els.videoProgressBar);
  hideProgress(els.audioProgress, els.audioProgressBar);
}

function parseFilename(header, fallback) {
  if (!header) return fallback;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch (error) {
      return fallback;
    }
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch) return quotedMatch[1];
  const bareMatch = header.match(/filename=([^;]+)/i);
  if (bareMatch) return bareMatch[1].trim();
  return fallback;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

async function downloadMedia(mediaType) {
  const isVideo = mediaType === 'video';
  const quality = isVideo ? selectedVideoQuality : selectedAudioQuality;
  const button = isVideo ? els.videoDownloadBtn : els.audioDownloadBtn;
  const status = isVideo ? els.videoStatus : els.audioStatus;
  const progressWrap = isVideo ? els.videoProgress : els.audioProgress;
  const progressBar = isVideo ? els.videoProgressBar : els.audioProgressBar;

  if (!analyzedUrl || quality === null) return;

  setDownloadLoading(button, true);
  clearStatus(status);
  progressBar.style.width = '0%';
  showProgress(progressWrap);
  setStatus(status, 'Preparando descarga…', null);

  try {
    const response = await fetch(`${API_BASE}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: analyzedUrl, media_type: mediaType, quality }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error((errorBody && errorBody.detail) || '*ERROR, no se pudo completar la descarga correctamente.');
    }

    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    setStatus(status, 'Descargando…', null);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) {
        updateProgressValue(progressBar, Math.min(100, Math.round((received / total) * 100)));
      }
    }

    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    const fallbackName = isVideo ? 'video.mp4' : 'audio.mp3';
    const filename = parseFilename(response.headers.get('content-disposition'), fallbackName);
    triggerBlobDownload(blob, filename);

    updateProgressValue(progressBar, 100);
    setStatus(status, 'Descarga completada.', 'success');
  } catch (error) {
    setStatus(status, error.message || '*ERROR, ocurrió un error inesperado.', 'error');
  } finally {
    setDownloadLoading(button, false);
    setTimeout(() => hideProgress(progressWrap, progressBar), 1200);
  }
}

function launchNotification(title, message, type = 'info') {
  let xcontainer = document.getElementById('toast-container');
  
  if (!xcontainer) {
    xcontainer = document.createElement('div');
    xcontainer.id = 'toast-container';
    xcontainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; max-width: 350px;';
    document.body.appendChild(xcontainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  
  const configuration = {
    info: { icons: '💡', bg: 'rgba(63, 216, 196, 0.15)', borde: '#3fd8c4' },
    warning: { icons: '⚠️', bg: 'rgba(240, 111, 240, 0.15)', borde: '#7c6ff0' },
    alert: { icons: '🚨', bg: 'rgba(255, 107, 107, 0.15)', borde: '#ff6b6b' }
  };

  const config = configuration[type] || configuration.info;

  toast.style.cssText = `
    background: #121626; border-left: 4px solid ${config.borde}; color: #edeef7;
    padding: 12px 16px; border-radius: 8px; display: flex; gap: 12px; align-items: flex-start;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4); backdrop-filter: blur(8px);
    transition: all 0.3s ease; font-family: sans-serif;
  `;

  toast.innerHTML = `
    <span style="font-size: 1.2rem;">${config.icons}</span>
    <div style="flex: 1;">
      <strong style="display: block; font-size: 0.9rem; margin-bottom: 2px;">${title}</strong>
      <p style="margin: 0; font-size: 0.82rem; color: #9296b4;">${message}</p>
    </div>
    <button class="toast-close" style="background: none; border: none; color: #9296b4; cursor: pointer; font-size: 1.1rem; padding: 0 4px;">&times;</button>
  `;

  xcontainer.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 6000);
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setFormError('');
  const url = els.urlInput.value.trim();

  if (!isValidYoutubeUrl(url)) {
    setFormError('*ERROR, inténtelo de nuevo. Ingrese una URL válida de YouTube.');
    return;
  }

  launchNotification('Procesando solicitud', 'Analizando enlace de YouTube…', 'info');

  setAnalyzeLoading(true);
  els.results.hidden = true;
  els.placeholderCard.hidden = false;

  try {
    const data = await fetchJson('/api/formats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    analyzedUrl = url;
    populatePreview(data);
    populateQualityOptions(data);
    els.placeholderCard.hidden = true;
    els.results.hidden = false;

    launchNotification('¡Éxito!', 'Enlace de YouTube analizado correctamente.', 'info');

  } catch (error) {
    setFormError(error.message);
    els.placeholderCard.hidden = false;
    els.results.hidden = true;

    launchNotification('Error de Análisis', error.message, 'alert');

  } finally {
    setAnalyzeLoading(false);
  }
});

els.urlInput.addEventListener('input', () => setFormError(''));
els.videoDownloadBtn.addEventListener('click', () => downloadMedia('video'));
els.audioDownloadBtn.addEventListener('click', () => downloadMedia('audio'));
