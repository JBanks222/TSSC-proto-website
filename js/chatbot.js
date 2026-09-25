const N8N_WEBHOOK_URL = "https://jalen222.app.n8n.cloud/webhook-test/782df198-c304-498e-b5ff-9e443f0b303c";

const CHAT_SESSION_KEY = "itChatSessionId";
const CHAT_HISTORY_KEY = "itChatMessages";
const CHAT_TIMEOUT_MS = 25000;
const ASSISTANT_RESPONSE_PROPERTY = "response";
const INITIAL_MESSAGE = "Hi! I'm the IT Help Assistant. What can I help you with today?";
const CONNECTION_ERROR = "Sorry, I'm having trouble connecting to the IT assistant right now. Please try again in a moment.";
let fallbackSessionId = null;

function createSessionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `it-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Reuse this ID for every request in the same browser tab; it contains no personal data.
function getSessionId() {
  let sessionId;

  try {
    sessionId = sessionStorage.getItem(CHAT_SESSION_KEY);
    if (!sessionId) {
      sessionId = createSessionId();
      sessionStorage.setItem(CHAT_SESSION_KEY, sessionId);
    }
  } catch (error) {
    console.error("Unable to access session storage for the IT chat.", error);
    if (!fallbackSessionId) {
      fallbackSessionId = createSessionId();
    }
    sessionId = fallbackSessionId;
  }

  return sessionId;
}

function loadMessages() {
  try {
    const savedMessages = JSON.parse(sessionStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    if (Array.isArray(savedMessages)) {
      return savedMessages.filter((message) =>
        message &&
        (message.role === "assistant" || message.role === "user") &&
        typeof message.content === "string"
      );
    }
  } catch (error) {
    console.error("Unable to restore the IT chat conversation.", error);
  }

  return [];
}

function initializeChatbot() {
  const launcher = document.getElementById("itChatLauncher");
  const backdrop = document.getElementById("itChatBackdrop");
  const panel = document.getElementById("itChatPanel");
  const closeButton = document.getElementById("itChatClose");
  const messagesElement = document.getElementById("itChatMessages");
  const typingIndicator = document.getElementById("itChatTyping");
  const form = document.getElementById("itChatForm");
  const input = document.getElementById("itChatInput");
  const sendButton = document.getElementById("itChatSend");

  if (!launcher || !backdrop || !panel || !closeButton || !messagesElement || !typingIndicator || !form || !input || !sendButton) {
    return;
  }

  getSessionId();
  let messages = loadMessages();
  let isWaiting = false;
  let previousFocus = null;

  if (!messages.length) {
    messages = [{ role: "assistant", content: INITIAL_MESSAGE }];
  }

  function saveMessages() {
    try {
      sessionStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-100)));
    } catch (error) {
      console.error("Unable to save the IT chat conversation.", error);
    }
  }

  function scrollToLatest() {
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  function addMessage(role, content) {
    const message = { role, content };
    messages.push(message);

    const messageElement = document.createElement("article");
    messageElement.className = `it-chat__message it-chat__message--${role}`;

    const sender = document.createElement("span");
    sender.className = "it-chat__sender";
    sender.textContent = role === "user" ? "You" : "IT Help Assistant";

    const bubble = document.createElement("p");
    bubble.className = "it-chat__bubble";
    bubble.textContent = content;

    messageElement.append(sender, bubble);
    messagesElement.insertBefore(messageElement, typingIndicator);
    saveMessages();
    scrollToLatest();
  }

  function renderMessages() {
    messagesElement.querySelectorAll(".it-chat__message").forEach((element) => element.remove());
    messages.forEach((message) => {
      const messageElement = document.createElement("article");
      messageElement.className = `it-chat__message it-chat__message--${message.role}`;

      const sender = document.createElement("span");
      sender.className = "it-chat__sender";
      sender.textContent = message.role === "user" ? "You" : "IT Help Assistant";

      const bubble = document.createElement("p");
      bubble.className = "it-chat__bubble";
      bubble.textContent = message.content;

      messageElement.append(sender, bubble);
      messagesElement.insertBefore(messageElement, typingIndicator);
    });
    saveMessages();
    scrollToLatest();
  }

  function openChat() {
    previousFocus = document.activeElement;
    backdrop.hidden = false;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    launcher.setAttribute("aria-expanded", "true");
    input.focus();
    scrollToLatest();
  }

  function closeChat() {
    backdrop.hidden = true;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    launcher.setAttribute("aria-expanded", "false");
    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    } else {
      launcher.focus();
    }
  }

  function setWaiting(waiting) {
    isWaiting = waiting;
    input.disabled = waiting;
    sendButton.disabled = waiting;
    typingIndicator.hidden = !waiting;
    scrollToLatest();
  }

  async function sendMessage() {
    const userMessage = input.value.trim();
    if (!userMessage || isWaiting) {
      return;
    }

    addMessage("user", userMessage);
    input.value = "";
    input.style.height = "auto";
    setWaiting(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      // Keep this request contract small; n8n can use sessionId for server-side memory.
      const webhookUrl = new URL(N8N_WEBHOOK_URL);
      webhookUrl.searchParams.set("message", userMessage);
      webhookUrl.searchParams.set("sessionId", getSessionId());

      // Cross-origin n8n deployments must allow this website's origin and GET requests.
      const response = await fetch(webhookUrl, {
        method: "GET",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`n8n webhook returned HTTP ${response.status}`);
      }

      // Update this extraction if the workflow returns a different response shape.
      const payload = await response.json();
      const assistantResponse = payload?.[ASSISTANT_RESPONSE_PROPERTY];
      if (typeof assistantResponse !== "string" || !assistantResponse.trim()) {
        throw new Error(`n8n webhook response did not include a non-empty ${ASSISTANT_RESPONSE_PROPERTY} string`);
      }

      addMessage("assistant", assistantResponse.trim());
    } catch (error) {
      console.error("IT assistant request failed.", error);
      addMessage("assistant", CONNECTION_ERROR);
    } finally {
      window.clearTimeout(timeoutId);
      setWaiting(false);
      if (!panel.hidden) {
        input.focus();
      }
    }
  }

  launcher.addEventListener("click", () => {
    if (panel.hidden) {
      openChat();
    } else {
      closeChat();
    }
  });
  backdrop.addEventListener("click", closeChat);
  closeButton.addEventListener("click", closeChat);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  });

  document.addEventListener("keydown", (event) => {
    if (panel.hidden) {
      return;
    }

    if (event.key === "Escape") {
      closeChat();
      return;
    }

    if (event.key === "Tab") {
      const focusable = Array.from(panel.querySelectorAll("button:not(:disabled), textarea:not(:disabled)"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  renderMessages();
}

initializeChatbot();