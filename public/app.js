const form = document.querySelector("#ask-form");
const input = document.querySelector("#question");
const send = document.querySelector("#send");
const messages = document.querySelector("#messages");
const history = [];

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function formatAnswer(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .split(/\n{2,}/)
    .map((part) => `<p>${part.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function addMessage(role, text, sources = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const citations = sources.length
    ? `<div class="sources"><strong>Retrieved sources:</strong> ${sources.map((source) => `${escapeHtml(source.title)}, p. ${source.page}`).join(" · ")}</div>`
    : "";
  article.innerHTML = role === "assistant"
    ? `<div class="avatar">PD</div><div class="bubble">${formatAnswer(text)}${citations}</div>`
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

async function ask(question) {
  addMessage("user", question);
  history.push({ role: "user", text: question });
  addTyping();
  send.disabled = true;
  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: history.slice(-8) })
    });
    const data = await response.json();
    document.querySelector("#typing")?.remove();
    const answer = data.answer || data.error || "I could not form an answer. Please try again.";
    addMessage("assistant", answer, data.sources || []);
    history.push({ role: "assistant", text: answer });
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
