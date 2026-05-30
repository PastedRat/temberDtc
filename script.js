const soundReferences = [
  {
    name: "Electric motor hum",
    icon: "⚙️",
    range: [50, 400],
    description: "Mains hum and spinning parts often sit in low bass through low-mid frequencies.",
  },
  {
    name: "Airplane / jet rumble",
    icon: "✈️",
    range: [20, 250],
    description: "Large aircraft are usually felt as very low rumble with changing harmonic tones.",
  },
  {
    name: "Male human voice",
    icon: "🧔",
    range: [85, 180],
    description: "Typical speaking fundamentals for many adult male voices.",
  },
  {
    name: "Female human voice",
    icon: "👩",
    range: [165, 255],
    description: "Typical speaking fundamentals for many adult female voices.",
  },
  {
    name: "Child voice",
    icon: "🧒",
    range: [250, 500],
    description: "Children often speak with a higher fundamental pitch than adults.",
  },
  {
    name: "Dog bark",
    icon: "🐕",
    range: [300, 1000],
    description: "Barks are short bursts, so the detector may jump between nearby peaks.",
  },
  {
    name: "Bird chirp",
    icon: "🐦",
    range: [1000, 8000],
    description: "Small birds commonly make bright, high-frequency sounds.",
  },
  {
    name: "Siren / alarm",
    icon: "🚨",
    range: [600, 1600],
    description: "Warning tones sweep or pulse across strong mid-to-high frequencies.",
  },
  {
    name: "Bass speaker",
    icon: "🔊",
    range: [35, 120],
    description: "Sub bass and kick-heavy music usually land in this low-frequency zone.",
  },
  {
    name: "Whistle",
    icon: "🎵",
    range: [1000, 4000],
    description: "Whistles create a clear narrow peak that is easy to detect.",
  },
];

const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const statusText = document.querySelector("#statusText");
const frequencyValue = document.querySelector("#frequencyValue");
const soundMatch = document.querySelector("#soundMatch");
const canvas = document.querySelector("#spectrumCanvas");
const canvasContext = canvas.getContext("2d");
const referenceGrid = document.querySelector("#referenceGrid");
const template = document.querySelector("#referenceCardTemplate");

let audioContext;
let analyser;
let microphoneStream;
let animationFrameId;
let frequencyData;

function renderReferences() {
  soundReferences.forEach((sound, index) => {
    const card = template.content.cloneNode(true);
    const article = card.querySelector(".reference-card");
    article.dataset.soundIndex = index;
    article.setAttribute("aria-label", `${sound.name}, ${sound.range[0]} to ${sound.range[1]} hertz`);
    card.querySelector(".reference-image").textContent = sound.icon;
    card.querySelector("h3").textContent = sound.name;
    card.querySelector(".range").textContent = `${sound.range[0].toLocaleString()}–${sound.range[1].toLocaleString()} Hz`;
    card.querySelector(".description").textContent = sound.description;
    referenceGrid.appendChild(card);
  });
}

function getSoundMatch(frequency) {
  if (!frequency) {
    return { label: "Listening for a steady peak...", sound: null };
  }

  const exactMatch = soundReferences.find((sound) => frequency >= sound.range[0] && frequency <= sound.range[1]);
  if (exactMatch) {
    return { label: `Closest match: ${exactMatch.icon} ${exactMatch.name}`, sound: exactMatch };
  }

  const closest = soundReferences
    .map((sound) => {
      const [min, max] = sound.range;
      const distance = frequency < min ? min - frequency : frequency - max;
      return { ...sound, distance };
    })
    .sort((a, b) => a.distance - b.distance)[0];

  return { label: `Near: ${closest.icon} ${closest.name}`, sound: closest };
}

function updateActiveReference(activeSound) {
  document.querySelectorAll(".reference-card").forEach((card) => {
    const sound = soundReferences[Number(card.dataset.soundIndex)];
    const isActive = Boolean(activeSound && sound.name === activeSound.name);
    card.classList.toggle("is-active", isActive);

    if (isActive) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
  });
}

function getDominantFrequency() {
  analyser.getByteFrequencyData(frequencyData);

  let loudestBin = 0;
  let loudestValue = 0;
  const nyquist = audioContext.sampleRate / 2;
  const binSize = nyquist / frequencyData.length;
  const minimumUsefulFrequency = 20;

  for (let index = 1; index < frequencyData.length; index += 1) {
    const frequency = index * binSize;
    if (frequency < minimumUsefulFrequency) {
      continue;
    }

    if (frequencyData[index] > loudestValue) {
      loudestValue = frequencyData[index];
      loudestBin = index;
    }
  }

  if (loudestValue < 18) {
    return 0;
  }

  return loudestBin * binSize;
}

function drawSpectrum(dominantFrequency) {
  const { width, height } = canvas;
  canvasContext.clearRect(0, 0, width, height);

  const gradient = canvasContext.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#62e6ff");
  gradient.addColorStop(0.5, "#72f2a1");
  gradient.addColorStop(1, "#9d7cff");

  const barWidth = width / frequencyData.length;
  canvasContext.fillStyle = gradient;

  frequencyData.forEach((value, index) => {
    const barHeight = (value / 255) * height;
    canvasContext.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
  });

  canvasContext.fillStyle = "rgba(255,255,255,0.8)";
  canvasContext.font = "700 15px system-ui";
  canvasContext.fillText("20 Hz", 18, height - 16);
  canvasContext.fillText(`${Math.round(audioContext.sampleRate / 2).toLocaleString()} Hz`, width - 110, height - 16);

  if (dominantFrequency) {
    const x = (dominantFrequency / (audioContext.sampleRate / 2)) * width;
    canvasContext.strokeStyle = "#ffcf5a";
    canvasContext.lineWidth = 3;
    canvasContext.beginPath();
    canvasContext.moveTo(x, 0);
    canvasContext.lineTo(x, height);
    canvasContext.stroke();
  }
}

function updateMeter() {
  const dominantFrequency = getDominantFrequency();
  const match = getSoundMatch(dominantFrequency);

  frequencyValue.textContent = dominantFrequency ? `${Math.round(dominantFrequency).toLocaleString()} Hz` : "-- Hz";
  soundMatch.textContent = match.label;
  updateActiveReference(match.sound);
  drawSpectrum(dominantFrequency);
  animationFrameId = requestAnimationFrame(updateMeter);
}

async function startListening() {
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.82;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);

    const source = audioContext.createMediaStreamSource(microphoneStream);
    source.connect(analyser);

    startButton.disabled = true;
    stopButton.disabled = false;
    statusText.textContent = "Listening now. Try humming, speaking, whistling, or playing a motor sound nearby.";
    updateMeter();
  } catch (error) {
    statusText.textContent = "Microphone could not start. Check browser permission and try again.";
    console.error(error);
  }
}

function stopListening() {
  cancelAnimationFrame(animationFrameId);
  microphoneStream?.getTracks().forEach((track) => track.stop());
  audioContext?.close();
  microphoneStream = undefined;
  audioContext = undefined;
  analyser = undefined;
  frequencyData = undefined;

  startButton.disabled = false;
  stopButton.disabled = true;
  frequencyValue.textContent = "-- Hz";
  soundMatch.textContent = "Press start to listen";
  updateActiveReference(null);
  statusText.textContent = "Stopped. Start again whenever you want another frequency reading.";
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
}

renderReferences();
startButton.addEventListener("click", startListening);
stopButton.addEventListener("click", stopListening);
