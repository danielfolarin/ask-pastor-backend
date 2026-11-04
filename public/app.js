const form = document.querySelector("#ask-form");
const input = document.querySelector("#question");
const send = document.querySelector("#send");
const record = document.querySelector("#record");
const recordLabel = record.querySelector(".record-label");
const recordStatus = document.querySelector("#record-status");
const messages = document.querySelector("#messages");
const shareSite = document.querySelector("#share-site");
const shareStatus = document.querySelector("#share-status");
const authButton = document.querySelector("#auth-button");
const authPanel = document.querySelector("#auth-panel");
const authClose = document.querySelector("#auth-close");
const authForm = document.querySelector("#auth-form");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authSubmit = document.querySelector("#auth-submit");
const authSignupMode = document.querySelector("#auth-signup-mode");
const authSigninMode = document.querySelector("#auth-signin-mode");
const authDescription = document.querySelector("#auth-description");
const authStatus = document.querySelector("#auth-status");
const historyButton = document.querySelector("#history-button");
const historyPanel = document.querySelector("#history-panel");
const historyClose = document.querySelector("#history-close");
const historyStatus = document.querySelector("#history-status");
const conversationList = document.querySelector("#conversation-list");
const rotatingPhrase = document.querySelector("#rotating-phrase");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const history = [];
let supabaseClient;
let currentSession;
let currentConversationId = "";
let mediaRecorder;
let mediaStream;
let audioChunks = [];
let authMode = "signup";

document.documentElement.classList.add("js-motion");

function initMotion() {
  const revealSections = document.querySelectorAll(".section-reveal");
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    revealSections.forEach((section) => section.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16, rootMargin: "0px 0px -70px 0px" });
  revealSections.forEach((section) => observer.observe(section));
}

function initRotatingPhrase() {
  if (!rotatingPhrase) return;
  const phrases = [
    "Ask about Scripture.",
    "Ask about theology.",
    "Ask about Christian living.",
    "Ask about difficult questions.",
    "Let us look to Christ."
  ];
  if (reducedMotion.matches) {
    rotatingPhrase.textContent = phrases[0];
    return;
  }
  let index = 0;
  window.setInterval(() => {
    rotatingPhrase.classList.add("phrase-changing");
    window.setTimeout(() => {
      index = (index + 1) % phrases.length;
      rotatingPhrase.textContent = phrases[index];
      rotatingPhrase.classList.remove("phrase-changing");
    }, 430);
  }, 3600);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function authHeaders() {
  return currentSession?.access_token
    ? { Authorization: `Bearer ${currentSession.access_token}` }
    : {};
}

function setPanel(panel, open) {
  panel.hidden = !open;
}

function updateAuthUI() {
  if (!supabaseClient) return;
  authButton.hidden = false;
  historyButton.hidden = !currentSession;
  authButton.textContent = currentSession ? "Sign out" : "Sign in";
}

async function loadConversations() {
  if (!currentSession) return;
  historyStatus.textContent = "Loading your conversations…";
  try {
    const response = await fetch("/api/conversations", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Conversations could not be loaded.");
    conversationList.innerHTML = data.conversations.length
      ? data.conversations.map((conversation) => `<button type="button" class="conversation-item" data-conversation-id="${escapeHtml(conversation.id)}"><strong>${escapeHtml(conversation.title)}</strong><small>${new Date(conversation.updated_at).toLocaleString()}</small></button>`).join("")
      : "<p class=\"history-empty\">Your saved conversations will appear here.</p>";
    historyStatus.textContent = "";
  } catch (error) {
    historyStatus.textContent = error.message;
  }
}

async function loadConversation(conversationId) {
  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Conversation could not be loaded.");
    messages.innerHTML = "";
    history.length = 0;
    currentConversationId = conversationId;
    data.messages.forEach((message) => {
      addMessage(message.role, message.content);
      history.push({ role: message.role, text: message.content });
    });
    setPanel(historyPanel, false);
    document.querySelector("#ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    historyStatus.textContent = error.message;
  }
}

async function initAuth() {
  try {
    const response = await fetch("/auth/config");
    const config = await response.json();
    if (!config.enabled || !window.supabase?.createClient) return;
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    const sessionState = await supabaseClient.auth.getSession();
    currentSession = sessionState.data.session;
    updateAuthUI();
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentSession = session;
      updateAuthUI();
      if (session) loadConversations();
    });
  } catch (error) {
    console.error("Authentication setup failed", error);
  }
}

initMotion();
initRotatingPhrase();
initAuth();

function formatAnswer(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .split(/\n{2,}/)
    .map((part) => `<p>${part.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function addMessage(role, text, sources = [], logId = "", resources = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const citations = sources.length
    ? `<div class="sources"><strong>Retrieved sources:</strong> ${sources.map((source) => `${escapeHtml(source.title)}, p. ${source.page}`).join(" · ")}</div>`
    : "";
  const feedback = role === "assistant" && logId
    ? `<div class="feedback" data-log-id="${escapeHtml(logId)}">
        <span>Was this helpful?</span>
        <button type="button" data-rating="helpful">Yes</button>
        <button type="button" data-rating="not-helpful">Not yet</button>
      </div>`
    : "";
  const recommendedResources = role === "assistant" && resources.length
    ? `<div class="resource-links"><strong>Recommended next steps</strong><div class="resource-link-grid">${resources.map((resource) => `
        <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer" class="resource-link resource-${escapeHtml(resource.type)}">
          <span>${escapeHtml(resource.type === "sermon" ? "▶" : resource.type === "church" ? "✦" : "▤")}</span>
          <span><strong>${escapeHtml(resource.title)}</strong><small>${escapeHtml(resource.description)}</small><em>${escapeHtml(resource.label)} ↗</em></span>
        </a>`).join("")}</div></div>`
    : "";
  article.innerHTML = role === "assistant"
    ? `<div class="avatar">PD</div><div class="bubble">${formatAnswer(text)}${citations}${recommendedResources}${feedback}</div>`
    : `<div class="bubble"><p>${escapeHtml(text)}</p></div>`;
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

function addTyping() {
  const article = document.createElement("article");
  article.id = "typing";
  article.className = "message assistant";
  article.innerHTML = `<div class="avatar">PD</div><div class="bubble typing"><span></span><span></span><span></span></div>`;
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

function setRecordState(state, message = "") {
  record.dataset.state = state;
  record.classList.toggle("recording", state === "recording");
  record.disabled = state === "transcribing";
  recordLabel.textContent = state === "recording" ? "Stop" : state === "transcribing" ? "Working" : "Record";
  record.setAttribute("aria-label", state === "recording" ? "Stop recording" : "Record question");
  recordStatus.textContent = message;
}

function stopStream() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

async function transcribe(audioBlob) {
  setRecordState("transcribing", "Transcribing…");
  try {
    const response = await fetch("/transcribe", {
      method: "POST",
      headers: { "Content-Type": audioBlob.type || "audio/webm" },
      body: audioBlob
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The recording could not be transcribed.");
    input.value = data.text;
    input.dispatchEvent(new Event("input"));
    input.focus();
    setRecordState("idle", "Transcription ready. You can edit it before sending.");
  } catch (error) {
    setRecordState("idle", error.message || "The recording could not be transcribed.");
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setRecordState("idle", "Voice recording is not supported by this browser.");
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    mediaRecorder = preferredType
      ? new MediaRecorder(mediaStream, { mimeType: preferredType })
      : new MediaRecorder(mediaStream);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      stopStream();
      transcribe(audioBlob);
    }, { once: true });
    mediaRecorder.start();
    setRecordState("recording", "Listening… Tap Stop when you are finished.");
  } catch (error) {
    stopStream();
    const denied = error.name === "NotAllowedError" || error.name === "PermissionDeniedError";
    setRecordState("idle", denied
      ? "Microphone permission was denied. Allow microphone access in your browser and try again."
      : "The microphone could not be started. Please try again.");
  }
}

record.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }
  startRecording();
});

async function ask(question) {
  addMessage("user", question);
  history.push({ role: "user", text: question });
  addTyping();
  send.disabled = true;
  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ question, history: history.slice(-8), pageUrl: window.location.href, conversationId: currentConversationId })
    });
    const data = await response.json();
    document.querySelector("#typing")?.remove();
    const answer = data.answer || data.error || "I could not form an answer. Please try again.";
    addMessage("assistant", answer, data.sources || [], data.logId || "", data.resources || []);
    history.push({ role: "assistant", text: answer });
    currentConversationId = data.conversationId || currentConversationId;
    if (currentSession) loadConversations();
  } catch {
    document.querySelector("#typing")?.remove();
    addMessage("assistant", "The answer service could not be reached. Please try again shortly.");
  } finally {
    send.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || send.disabled) return;
  input.value = "";
  input.style.height = "auto";
  ask(question);
});

messages.addEventListener("click", async (event) => {
  const button = event.target.closest(".feedback button");
  if (!button) return;
  const container = button.closest(".feedback");
  const logId = container.dataset.logId;
  const rating = button.dataset.rating;
  container.querySelectorAll("button").forEach((item) => { item.disabled = true; });
  try {
    const response = await fetch("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId, rating })
    });
    if (!response.ok) throw new Error("Feedback was not saved.");
    container.innerHTML = "<span>Thank you for the feedback.</span>";
  } catch {
    container.innerHTML = "<span>Feedback could not be saved right now.</span>";
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
});

document.querySelectorAll(".suggestions button").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.textContent;
    form.requestSubmit();
  });
});

shareSite.addEventListener("click", async () => {
  const shareData = {
    title: "Ask Pastor Daniel AI",
    text: "Explore Scripture and theology with Ask Pastor Daniel AI.",
    url: window.location.href
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
    shareStatus.textContent = "Thank you for sharing Ask Pastor Daniel AI.";
  } catch (error) {
    if (error.name !== "AbortError") {
      shareStatus.textContent = "The link could not be shared. Please copy it from your browser.";
    }
  }
});

authButton.addEventListener("click", async () => {
  if (currentSession) {
    await supabaseClient.auth.signOut();
    currentSession = null;
    currentConversationId = "";
    updateAuthUI();
    return;
  }
  authStatus.textContent = "";
  setAuthMode("signup");
  setPanel(authPanel, true);
  authEmail.focus();
});

authClose.addEventListener("click", () => setPanel(authPanel, false));
historyClose.addEventListener("click", () => setPanel(historyPanel, false));
historyButton.addEventListener("click", () => {
  setPanel(historyPanel, true);
  loadConversations();
});

function setAuthMode(mode) {
  authMode = mode;
  const signingIn = mode === "signin";
  authSubmit.textContent = signingIn ? "Sign in" : "Create account";
  authPassword.autocomplete = signingIn ? "current-password" : "new-password";
  authDescription.textContent = signingIn
    ? "Sign in to reopen your saved conversations and continue where you stopped."
    : "Create an account with your email and a password to keep your conversations available.";
  authSignupMode.classList.toggle("active", !signingIn);
  authSigninMode.classList.toggle("active", signingIn);
  authStatus.textContent = "";
}

authSignupMode.addEventListener("click", () => {
  setAuthMode("signup");
  authPassword.focus();
});

authSigninMode.addEventListener("click", () => {
  setAuthMode("signin");
  authPassword.focus();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) return;
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const signingIn = authMode === "signin";
  authSubmit.disabled = true;
  authStatus.textContent = signingIn ? "Signing you in…" : "Creating your account…";
  try {
    const result = signingIn
      ? await supabaseClient.auth.signInWithPassword({ email, password })
      : await supabaseClient.auth.signUp({ email, password });
    const { data, error } = result;
    if (error) throw error;
    if (!signingIn && !data.session) {
      authStatus.textContent = "Your account was created. Check your email to confirm it, then sign in here.";
    } else {
      authStatus.textContent = signingIn ? "You are signed in." : "Your account is ready.";
      authPassword.value = "";
      setPanel(authPanel, false);
    }
  } catch (error) {
    authStatus.textContent = error.message || (signingIn ? "Sign-in failed." : "Account creation failed.");
  } finally {
    authSubmit.disabled = false;
  }
});

conversationList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-conversation-id]");
  if (item) loadConversation(item.dataset.conversationId);
});
