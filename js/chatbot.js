const N8N_WEBHOOK_URL = "https://jalen222.app.n8n.cloud/webhook/782df198-c304-498e-b5ff-9e443f0b303c";
const CHAT_MESSAGES_URL = "https://jalen222.app.n8n.cloud/webhook/chat/messages";

const CHAT_SESSION_KEY = "itChatSessionId";
const CHAT_HISTORY_KEY = "itChatMessages";
const CHAT_TIMEOUT_MS = 60000;
const CHAT_POLL_TIMEOUT_MS = 10000;
const HANDOFF_POLL_INTERVAL_MS = 3000;
const ASSISTANT_RESPONSE_PROPERTY = "response";
const INITIAL_MESSAGE = "Hi! I'm the IT Help Assistant. What can I help you with today?";
const CONNECTION_ERROR = "Sorry, I'm having trouble connecting to the IT assistant right now. Please try again in a moment.";
const CHAT_ACTIONS = {
  CUNY_PASSWORD_RESET: {
    type: "link",
    label: "Reset CUNY Password",
    url: "https://managelogin.cuny.edu/OIMSelfService/forgotpwd"
  },
  CUNY_MFA_TYPE: {
    type: "choice",
    options: [
      {
        label: "Microsoft 365 MFA",
        value: "I need help with Microsoft 365 MFA."
      },
      {
        label: "CUNYfirst MFA",
        value: "I need help with CUNYfirst MFA."
      }
    ]
  },
  M365_MFA_ACTION: {
    type: "choice",
    options: [
      {
        label: "Set up MFA",
        value: "I need to set up Microsoft 365 MFA."
      },
      {
        label: "Reset / change MFA",
        value: "I need to reset or change my Microsoft 365 MFA."
      }
    ]
  },
  CUNYFIRST_MFA_ACTION: {
    type: "choice",
    options: [
      {
        label: "Set up MFA",
        value: "I need to set up CUNYfirst MFA."
      },
      {
        label: "Reset / change MFA",
        value: "I need to reset or change my CUNYfirst MFA."
      }
    ]
  },
  TSSC_MFA_RESET: {
    type: "contact",
    title: "Technology Support & Service Center",
    message: "Only the Technology Support & Service Center can reset your MFA account.",
    phone: "718-631-6348",
    phoneHref: "tel:+17186316348",
    email: "ServiceDesk@qcc.cuny.edu",
    emailHref: "mailto:ServiceDesk@qcc.cuny.edu",
    location: "Library Building, Room L-115"
  }
};
const ACTION_TOKEN_REGEX = /\[([A-Z0-9_]+)\]/g;
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

function readStoredSessionId() {
  try {
    return globalThis.localStorage?.getItem(CHAT_SESSION_KEY) || sessionStorage.getItem(CHAT_SESSION_KEY);
  } catch (error) {
    console.error("Unable to read the stored IT chat session.", error);
    return null;
  }
}

function getSessionId() {
  let sessionId;

  try {
    sessionId = readStoredSessionId();
    if (!sessionId) {
      sessionId = createSessionId();
      try {
        globalThis.localStorage?.setItem(CHAT_SESSION_KEY, sessionId);
      } catch (error) {
        console.error("Unable to persist the IT chat session in local storage.", error);
      }
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

// Human handoff state and polling support.
function loadHandoffState(sessionId) {
  const defaultState = { humanMode: false, status: "none", lastSeq: 0, staffName: null };
  try {
    const savedState = JSON.parse(globalThis.localStorage?.getItem(`itChatHandoff:${sessionId}`) || "null");
    return savedState && typeof savedState === "object"
      ? { ...defaultState, ...savedState, lastSeq: Number(savedState.lastSeq) || 0 }
      : defaultState;
  } catch (error) {
    console.error("Unable to restore IT chat handoff state.", error);
    return defaultState;
  }
}

function saveHandoffState(sessionId, state) {
  try {
    globalThis.localStorage?.setItem(`itChatHandoff:${sessionId}`, JSON.stringify(state));
  } catch (error) {
    console.error("Unable to save IT chat handoff state.", error);
  }
}

// Polling is single-flight, visibility-aware, and retries with bounded backoff.
function createPoller(fn, intervalMs) {
  let timer = null;
  let running = false;
  let inFlight = false;
  let backoffMs = intervalMs;

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(delay) {
    clearTimer();
    if (running && document.visibilityState !== "hidden") {
      timer = window.setTimeout(run, delay);
    }
  }

  async function run() {
    if (!running || inFlight || document.visibilityState === "hidden") {
      return;
    }

    inFlight = true;
    let nextDelay = intervalMs;
    try {
      await fn();
      backoffMs = intervalMs;
    } catch (error) {
      console.error("IT chat message polling failed.", error);
      backoffMs = Math.min(Math.max(intervalMs, backoffMs * 2), 15000);
      nextDelay = backoffMs;
    } finally {
      inFlight = false;
      schedule(nextDelay);
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      clearTimer();
    } else if (running && !inFlight) {
      run();
    }
  }

  function start() {
    if (running) {
      return;
    }
    running = true;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    run();
  }

  function stop() {
    running = false;
    clearTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  return { start, stop };
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

function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAction(action) {
  if (!action || typeof action !== "object") {
    return null;
  }

  const type = action.type;

  if (type === "link") {
    const label = sanitizeString(action.label);
    const url = sanitizeString(action.url);
    if (!label || !url) {
      return null;
    }

    return {
      type: "link",
      label,
      url
    };
  }

  if (type === "choice") {
    const options = Array.isArray(action.options)
      ? action.options
          .map((option) => {
            if (!option || typeof option !== "object") {
              return null;
            }

            const label = sanitizeString(option.label);
            const value = sanitizeString(option.value);
            if (!label || !value) {
              return null;
            }

            return { label, value };
          })
          .filter(Boolean)
      : [];

    if (options.length === 0) {
      return null;
    }

    return {
      type: "choice",
      options
    };
  }

  if (type === "contact") {
    const title = sanitizeString(action.title);
    const message = sanitizeString(action.message);
    const phone = sanitizeString(action.phone);
    const phoneHref = sanitizeString(action.phoneHref);
    const email = sanitizeString(action.email);
    const emailHref = sanitizeString(action.emailHref);
    const location = sanitizeString(action.location);

    if (!title || !message || !phone || !phoneHref || !email || !emailHref) {
      return null;
    }

    return {
      type: "contact",
      title,
      message,
      phone,
      phoneHref,
      email,
      emailHref,
      location
    };
  }

  if (type === "frontend_action") {
    const frontEndAction = sanitizeString(action.action);
    if (!frontEndAction) {
      return null;
    }

    return {
      type: "frontend_action",
      action: frontEndAction
    };
  }

  return null;
}

function parseChatActions(message) {
  if (typeof message !== "string") {
    return {
      cleanMessage: "",
      actions: []
    };
  }

  const actions = [];
  const cleanMessage = message.replace(ACTION_TOKEN_REGEX, (match, tokenName) => {
    const action = normalizeAction(CHAT_ACTIONS[tokenName]);
    if (!action) {
      return "";
    }

    actions.push(action);
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();

  return {
    cleanMessage,
    actions
  };
}

function createActionLink({ label, url, ariaLabel, openInNewTab = true }) {
  if (!label || !url) {
    return null;
  }

  const actionLink = document.createElement("a");
  actionLink.href = url;
  actionLink.className = "it-chat__action-button";
  actionLink.textContent = label;
  actionLink.setAttribute("aria-label", ariaLabel || label);

  if (openInNewTab) {
    actionLink.target = "_blank";
    actionLink.rel = "noopener noreferrer";
  }

  return actionLink;
}

function createChatActionButton(action) {
  if (!action || action.type !== "link" || typeof action.url !== "string" || !action.url.trim()) {
    return null;
  }

  return createActionLink({
    label: `${action.label} ↗`,
    url: action.url,
    ariaLabel: `${action.label} (opens in a new tab)`
  });
}

function renderChoiceAction(action, onSelect) {
  if (!action || action.type !== "choice" || !Array.isArray(action.options)) {
    return null;
  }

  const choiceGroup = document.createElement("div");
  choiceGroup.className = "it-chat__choices";

  const optionButtons = action.options.map((option) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "it-chat__choice-button";
    optionButton.textContent = option.label;
    optionButton.setAttribute("aria-label", option.label);

    optionButton.addEventListener("click", () => {
      if (optionButton.disabled) {
        return;
      }

      const buttons = Array.from(choiceGroup.querySelectorAll("button"));
      buttons.forEach((button) => {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      });
      optionButton.classList.add("is-selected");
      onSelect(option, buttons);
    });

    choiceGroup.appendChild(optionButton);
    return optionButton;
  });

  if (optionButtons.length === 0) {
    return null;
  }

  return choiceGroup;
}

function renderContactAction(action, container) {
  if (!action || action.type !== "contact") {
    return;
  }

  const card = document.createElement("div");
  card.className = "it-chat__contact-card";

  const title = document.createElement("h3");
  title.className = "it-chat__contact-title";
  title.textContent = action.title;

  const message = document.createElement("p");
  message.className = "it-chat__contact-message";
  message.textContent = action.message;

  const details = document.createElement("div");
  details.className = "it-chat__contact-details";

  const phoneLabel = document.createElement("div");
  phoneLabel.className = "it-chat__contact-row";
  const phoneText = document.createElement("a");
  phoneText.href = action.phoneHref;
  phoneText.className = "it-chat__contact-link";
  phoneText.textContent = action.phone;
  phoneText.setAttribute("aria-label", `Call ${action.phone}`);
  phoneLabel.appendChild(phoneText);

  const emailLabel = document.createElement("div");
  emailLabel.className = "it-chat__contact-row";
  const emailText = document.createElement("a");
  emailText.href = action.emailHref;
  emailText.className = "it-chat__contact-link";
  emailText.textContent = action.email;
  emailText.setAttribute("aria-label", `Email ${action.email}`);
  emailLabel.appendChild(emailText);

  if (action.location) {
    const locationLabel = document.createElement("div");
    locationLabel.className = "it-chat__contact-row";
    const locationText = document.createElement("span");
    locationText.className = "it-chat__contact-location";
    locationText.textContent = action.location;
    locationLabel.appendChild(locationText);
    details.appendChild(locationLabel);
  }

  const contactButtons = document.createElement("div");
  contactButtons.className = "it-chat__contact-actions";

  const callButton = createActionLink({
    label: "Call TSSC",
    url: action.phoneHref,
    ariaLabel: "Call the Technology Support & Service Center",
    openInNewTab: false
  });
  const emailButton = createActionLink({
    label: "Email TSSC",
    url: action.emailHref,
    ariaLabel: "Email the Technology Support & Service Center",
    openInNewTab: false
  });

  if (callButton) {
    contactButtons.appendChild(callButton);
  }
  if (emailButton) {
    contactButtons.appendChild(emailButton);
  }

  details.prepend(phoneLabel, emailLabel);

  card.append(title, message, details, contactButtons);
  container.appendChild(card);
}

function renderChatActions(actions, messageContainer, onMessageSubmit) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return;
  }

  const actionContainer = document.createElement("div");
  actionContainer.className = "it-chat__actions";

  actions.forEach((action) => {
    if (action.type === "link") {
      const button = createChatActionButton(action);
      if (button) {
        actionContainer.appendChild(button);
      }
      return;
    }

    if (action.type === "choice") {
      const choiceGroup = renderChoiceAction(action, (selectedOption) => {
        const selectedText = selectedOption.value;
        if (!selectedText || typeof onMessageSubmit !== "function") {
          return;
        }

        Promise.resolve(onMessageSubmit(selectedText)).catch((error) => {
          console.error("IT assistant clarification request failed.", error);
        });
      });
      if (choiceGroup) {
        actionContainer.appendChild(choiceGroup);
      }
      return;
    }

    if (action.type === "contact") {
      renderContactAction(action, actionContainer);
    }
  });

  if (actionContainer.hasChildNodes()) {
    messageContainer.appendChild(actionContainer);
  }
}

function initializeChatbot() {
  const launcher = document.getElementById("itChatLauncher");
  const backdrop = document.getElementById("itChatBackdrop");
  const panel = document.getElementById("itChatPanel");
  const closeButton = document.getElementById("itChatClose");
  const messagesElement = document.getElementById("itChatMessages");
  const typingIndicator = document.getElementById("itChatTyping");
  const typingLabel = typingIndicator?.querySelector(".it-chat__typing-label");
  const handoffBanner = document.getElementById("itChatHandoffBanner");
  const newMessagesButton = document.getElementById("itChatNewMessages");
  const form = document.getElementById("itChatForm");
  const input = document.getElementById("itChatInput");
  const sendButton = document.getElementById("itChatSend");

  if (!launcher || !backdrop || !panel || !closeButton || !messagesElement || !typingIndicator || !form || !input || !sendButton) {
    return;
  }

  let sessionId = readStoredSessionId();
  let messages = loadMessages();
  let handoffState = sessionId
    ? loadHandoffState(sessionId)
    : { humanMode: false, status: "none", lastSeq: 0, staffName: null };
  let isWaiting = false;
  let previousFocus = null;
  let poller = null;
  let initialPollPending = Boolean(sessionId);

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
    if (newMessagesButton) {
      newMessagesButton.hidden = true;
    }
  }

  function isScrolledUp() {
    return messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight > 60;
  }

  function updateHandoffBanner() {
    if (!handoffBanner) {
      return;
    }

    handoffBanner.hidden = !handoffState.humanMode;
    if (!handoffState.humanMode) {
      handoffBanner.textContent = "";
      return;
    }

    if (handoffState.status === "active" || handoffState.staffName) {
      handoffBanner.textContent = `You're now chatting with ${handoffState.staffName || "a support team member"}.`;
    } else {
      handoffBanner.textContent = "Connecting you with a support team member… You can keep typing.";
    }
  }

  function setHumanMode(active, status = "waiting", staffName = null) {
    handoffState.humanMode = active;
    handoffState.status = status || (active ? "waiting" : "none");
    handoffState.staffName = active ? (staffName || handoffState.staffName || null) : null;
    panel.classList.toggle("is-human-mode", active);
    updateHandoffBanner();
    if (sessionId) {
      saveHandoffState(sessionId, handoffState);
    }
    setWaiting(isWaiting);
  }

  function formatMessageTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function createMessageElement(message) {
    const messageElement = document.createElement("article");
    messageElement.className = `it-chat__message it-chat__message--${message.role}`;

    if (message.role === "system") {
      const note = document.createElement("p");
      note.className = "it-chat__system-note";
      note.textContent = message.content;
      messageElement.setAttribute("aria-label", `System message: ${message.content}`);
      messageElement.appendChild(note);
      return messageElement;
    }

    const senderName = message.role === "user"
      ? "You"
      : message.role === "staff"
        ? (message.staffName || "Support team")
        : "IT Help Assistant";
    const meta = document.createElement("div");
    meta.className = "it-chat__message-meta";
    const sender = document.createElement("span");
    sender.className = "it-chat__sender";
    sender.textContent = senderName;
    meta.appendChild(sender);

    const messageTime = formatMessageTime(message.sentAt || message.sent_at);
    if (messageTime && message.role !== "user") {
      const time = document.createElement("time");
      time.className = "it-chat__message-time";
      time.textContent = messageTime;
      if (message.sentAt || message.sent_at) {
        const date = new Date(message.sentAt || message.sent_at);
        if (!Number.isNaN(date.getTime())) {
          time.dateTime = date.toISOString();
        }
      }
      meta.appendChild(time);
    }

    const bubble = document.createElement("p");
    bubble.className = "it-chat__bubble";

    const parsedMessage = message.role === "assistant" || message.role === "staff" ? parseChatActions(message.content) : {
      cleanMessage: message.content,
      actions: []
    };

    bubble.textContent = parsedMessage.cleanMessage;
    messageElement.append(meta, bubble);

    if (message.role === "staff") {
      messageElement.setAttribute("aria-label", `Staff member ${senderName} said: ${parsedMessage.cleanMessage}`);
    }

    if (message.sent) {
      const sentLabel = document.createElement("span");
      sentLabel.className = "it-chat__delivery-status";
      sentLabel.textContent = "Sent";
      messageElement.appendChild(sentLabel);
    }

    if (message.failed) {
      const retryLink = document.createElement("a");
      retryLink.className = "it-chat__retry";
      retryLink.href = "#";
      retryLink.textContent = "Couldn't send – Retry";
      retryLink.addEventListener("click", (event) => {
        event.preventDefault();
        sendMessage(message.content, message);
      });
      messageElement.appendChild(retryLink);
    }

    if (message.role === "assistant" || message.role === "staff") {
      renderChatActions(parsedMessage.actions, messageElement, sendMessage);
    }

    return messageElement;
  }

  function addMessage(role, content, options = {}) {
    const message = { role, content, sentAt: options.sentAt || Date.now(), ...options };
    messages.push(message);

    const messageElement = createMessageElement(message);
    messagesElement.insertBefore(messageElement, typingIndicator);
    saveMessages();
    if (options.scroll !== false) {
      scrollToLatest();
    }
    return message;
  }

  function renderMessages() {
    messagesElement.querySelectorAll(".it-chat__message").forEach((element) => element.remove());
    messages.forEach((message) => {
      const messageElement = createMessageElement(message);
      messagesElement.insertBefore(messageElement, typingIndicator);
    });
    saveMessages();
    scrollToLatest();
  }

  function findMatchingMessage(remoteMessage, role) {
    const sequence = Number(remoteMessage.seq);
    const remoteText = typeof remoteMessage.message === "string" ? remoteMessage.message : "";
    const remoteTime = Date.parse(remoteMessage.sent_at) || Date.now();
    return messages.find((message) => {
      if (sequence && Number(message.seq) === sequence) {
        return true;
      }
      if (message.role !== role || message.content !== remoteText) {
        return false;
      }
      const localTime = Number(message.sentAt) || remoteTime;
      return Math.abs(remoteTime - localTime) <= 30000;
    });
  }

  function processPolledMessages(remoteMessages, markUsersSent) {
    if (!Array.isArray(remoteMessages) || remoteMessages.length === 0) {
      return { added: 0, hasSystem: false, staffName: null };
    }

    if (messages.length === 1 && messages[0].role === "assistant" && messages[0].content === INITIAL_MESSAGE) {
      messages = [];
      renderMessages();
    }

    const wasScrolledUp = isScrolledUp();
    let added = 0;
    let hasSystem = false;
    let staffName = null;
    const orderedMessages = [...remoteMessages].sort((first, second) => (Number(first.seq) || 0) - (Number(second.seq) || 0));

    orderedMessages.forEach((remoteMessage) => {
      if (!remoteMessage || typeof remoteMessage.message !== "string" || !remoteMessage.message.trim()) {
        return;
      }

      const remoteRole = remoteMessage.sender === "user"
        ? "user"
        : remoteMessage.sender === "ai"
          ? "assistant"
          : remoteMessage.sender === "staff" || remoteMessage.sender === "system"
            ? remoteMessage.sender
            : null;
      if (!remoteRole) {
        return;
      }

      hasSystem ||= remoteRole === "system";
      if (remoteRole === "staff" && typeof remoteMessage.staff_name === "string" && remoteMessage.staff_name.trim()) {
        staffName = remoteMessage.staff_name.trim();
      }

      const existingMessage = findMatchingMessage(remoteMessage, remoteRole);
      if (existingMessage) {
        if (remoteMessage.seq) {
          existingMessage.seq = Number(remoteMessage.seq);
        }
        if (remoteRole === "user" && markUsersSent) {
          existingMessage.sent = true;
        }
        return;
      }

      addMessage(remoteRole, remoteMessage.message, {
        seq: Number(remoteMessage.seq) || undefined,
        sentAt: Date.parse(remoteMessage.sent_at) || Date.now(),
        staffName: remoteRole === "staff" ? (remoteMessage.staff_name || null) : null,
        sent: remoteRole === "user" && markUsersSent,
        scroll: false
      });
      added += 1;
    });

    if (added > 0) {
      if (wasScrolledUp && !panel.hidden) {
        if (newMessagesButton) {
          newMessagesButton.hidden = false;
        }
      } else {
        scrollToLatest();
      }
    }
    saveMessages();
    return { added, hasSystem, staffName };
  }

  function startPolling() {
    if (!sessionId) {
      sessionId = getSessionId();
      handoffState = loadHandoffState(sessionId);
    }
    if (!poller) {
      poller = createPoller(pollMessages, HANDOFF_POLL_INTERVAL_MS);
    }
    poller.start();
  }

  async function pollMessages() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_POLL_TIMEOUT_MS);
    const since = initialPollPending ? 0 : handoffState.lastSeq;
    initialPollPending = false;

    try {
      const pollUrl = new URL(CHAT_MESSAGES_URL);
      pollUrl.searchParams.set("sessionId", sessionId);
      pollUrl.searchParams.set("since", String(since));
      const response = await fetch(pollUrl, { method: "GET", signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Chat message polling returned HTTP ${response.status}`);
      }

      const payload = await response.json();
      const remoteMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      const wasHumanMode = handoffState.humanMode;
      const status = typeof payload?.status === "string" ? payload.status : "none";
      const isHumanMode = payload?.human_mode === true;
      const shouldLeave = wasHumanMode && (!isHumanMode || status === "closed");
      const rendered = processPolledMessages(remoteMessages, isHumanMode || wasHumanMode);

      remoteMessages.forEach((message) => {
        const sequence = Number(message?.seq);
        if (Number.isFinite(sequence) && sequence > handoffState.lastSeq) {
          handoffState.lastSeq = sequence;
        }
      });

      if (isHumanMode && status !== "closed") {
        const active = status === "active" || Boolean(rendered.staffName);
        setHumanMode(true, active ? "active" : (status === "waiting" ? "waiting" : "waiting"), rendered.staffName);
      } else if (shouldLeave) {
        if (!rendered.hasSystem) {
          const shouldScroll = panel.hidden || !isScrolledUp();
          addMessage("system", "A staff member has ended the chat…", { scroll: false });
          if (shouldScroll) {
            scrollToLatest();
          } else if (newMessagesButton) {
            newMessagesButton.hidden = false;
          }
        }
        setHumanMode(false, status === "closed" ? "closed" : "none", null);
        poller?.stop();
      } else {
        handoffState.status = status;
      }

      saveHandoffState(sessionId, handoffState);
      if (!handoffState.humanMode && !wasHumanMode) {
        poller?.stop();
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
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
    typingIndicator.classList.toggle("it-chat__typing--sending", handoffState.humanMode);
    typingIndicator.setAttribute("aria-label", handoffState.humanMode ? "Sending" : "Assistant is typing");
    if (typingLabel) {
      typingLabel.hidden = !handoffState.humanMode;
    }
    if (!isScrolledUp()) {
      scrollToLatest();
    }
  }

  async function sendMessage(messageTextOverride, existingMessage = null) {
    const hasOverride = typeof messageTextOverride === "string";
    const userMessage = hasOverride ? messageTextOverride.trim() : input.value.trim();
    if (!userMessage || isWaiting) {
      return;
    }

    sessionId = sessionId || getSessionId();
    if (!existingMessage) {
      existingMessage = addMessage("user", userMessage);
    } else {
      existingMessage.failed = false;
      renderMessages();
    }
    if (!hasOverride) {
      input.value = "";
      input.style.height = "auto";
    }
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
      const enteredHumanMode = payload?.human_mode === true;
      if (typeof assistantResponse !== "string" || (!assistantResponse.trim() && !enteredHumanMode)) {
        throw new Error(`n8n webhook response did not include a non-empty ${ASSISTANT_RESPONSE_PROPERTY} string`);
      }

      existingMessage.failed = false;
      if (assistantResponse.trim()) {
        addMessage("assistant", assistantResponse.trim());
      }
      if (payload?.status === "sent_to_agent") {
        existingMessage.sent = true;
        renderMessages();
      }
      if (enteredHumanMode) {
        setHumanMode(true, "waiting", handoffState.staffName);
        startPolling();
      }
    } catch (error) {
      console.error("IT assistant request failed.", error);
      existingMessage.failed = true;
      renderMessages();
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

  messagesElement.addEventListener("scroll", () => {
    if (!isScrolledUp() && newMessagesButton) {
      newMessagesButton.hidden = true;
    }
  });
  newMessagesButton?.addEventListener("click", scrollToLatest);

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
  updateHandoffBanner();
  panel.classList.toggle("is-human-mode", handoffState.humanMode);
  setWaiting(false);
  if (sessionId) {
    saveHandoffState(sessionId, handoffState);
  }
  if (handoffState.humanMode || sessionId) {
    startPolling();
  }
}

initializeChatbot();