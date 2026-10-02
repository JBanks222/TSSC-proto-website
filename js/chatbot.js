const N8N_WEBHOOK_URL = "https://jalen222.app.n8n.cloud/webhook/782df198-c304-498e-b5ff-9e443f0b303c";

const CHAT_SESSION_KEY = "itChatSessionId";
const CHAT_HISTORY_KEY = "itChatMessages";
const CHAT_TIMEOUT_MS = 25000;
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

function renderChatActions(actions, messageContainer) {
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
        if (!selectedText) {
          return;
        }

        sendMessage(selectedText).catch((error) => {
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

  function createMessageElement(message) {
    const messageElement = document.createElement("article");
    messageElement.className = `it-chat__message it-chat__message--${message.role}`;

    const sender = document.createElement("span");
    sender.className = "it-chat__sender";
    sender.textContent = message.role === "user" ? "You" : "IT Help Assistant";

    const bubble = document.createElement("p");
    bubble.className = "it-chat__bubble";

    const parsedMessage = message.role === "assistant" ? parseChatActions(message.content) : {
      cleanMessage: message.content,
      actions: []
    };

    bubble.textContent = parsedMessage.cleanMessage;
    messageElement.append(sender, bubble);

    if (message.role === "assistant") {
      renderChatActions(parsedMessage.actions, messageElement);
    }

    return messageElement;
  }

  function addMessage(role, content) {
    const message = { role, content };
    messages.push(message);

    const messageElement = createMessageElement(message);
    messagesElement.insertBefore(messageElement, typingIndicator);
    saveMessages();
    scrollToLatest();
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

  async function sendMessage(messageTextOverride) {
    const hasOverride = typeof messageTextOverride === "string";
    const userMessage = hasOverride ? messageTextOverride.trim() : input.value.trim();
    if (!userMessage || isWaiting) {
      return;
    }

    addMessage("user", userMessage);
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