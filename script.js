const API = "https://studymetaai-2.onrender.com";

const state = {
  currentChatId: null,
  chats: loadChats(),
  controller: null,
  attachedFile: null
};

const $ = (id) => document.getElementById(id);
const input = $("messageInput");
const messages = $("messages");
const welcome = $("welcome");
const sendBtn = $("sendBtn");
const counter = $("counter");

function loadChats() {
  try {
    return JSON.parse(localStorage.getItem("studyMetaChats") || "[]");
  } catch {
    return [];
  }
}

function saveChats() {
  state.chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  localStorage.setItem("studyMetaChats", JSON.stringify(state.chats.slice(0, 30)));
}

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem("studyMetaUser") || "{}");
  } catch {
    return {};
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function formatAI(text) {
  let safe = escapeHTML(text);

  safe = safe.replace(/```(?:[\w+-]+)?\s*\n?([\s\S]*?)```/g,
    (_, code) => `<pre class="code-block">${code.trim()}</pre>`);

  safe = safe.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/^###\s+(.*)$/gm, "<strong>$1</strong>");
  safe = safe.replace(/^\s*[-*]\s+(.*)$/gm, "• $1");
  safe = safe.replace(/\n/g, "<br>");

  return safe;
}

function createId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function setupUser() {
  const user = currentUser();
  const name = user.full_name || user.fullname || "Student";
  $("userName").textContent = name;
  $("userPlan").textContent = "Free plan";
  $("userAvatar").textContent = name.trim().charAt(0).toUpperCase() || "S";
}

function renderHistory() {
  const box = $("chatHistory");
  box.innerHTML = "";

  if (!state.chats.length) {
    const empty = document.createElement("div");
    empty.className = "history-item";
    empty.textContent = "No recent chats";
    box.appendChild(empty);
    return;
  }

  state.chats.forEach((chat) => {
    const item = document.createElement("button");
    item.className = `history-item${chat.id === state.currentChatId ? " active" : ""}`;
    item.textContent = chat.title || "New chat";
    item.onclick = () => loadChat(chat.id);
    box.appendChild(item);
  });
}

function newChat() {
  state.currentChatId = createId();
  state.attachedFile = null;

  $("attachmentPreview").textContent = "";

  welcome.hidden = false;

  messages.innerHTML = "";

  input.value = "";

  updateComposer();

  renderHistory();

  input.focus();

  // Close sidebar only on mobile
  if (window.innerWidth <= 850) {
    closeSidebar();
  }
}

function loadChat(id) {
  const chat = state.chats.find((item) => item.id === id);
  if (!chat) return;

  state.currentChatId = id;
  welcome.hidden = true;
  messages.innerHTML = "";

  (chat.messages || []).forEach((message) => {
    renderMessage(message.role, message.content);
  });

  renderHistory();
scrollBottom();

if (window.innerWidth <= 850) {
  closeSidebar();
}
}

function ensureChat(title) {
  let chat = state.chats.find((item) => item.id === state.currentChatId);

  if (!chat) {
    chat = {
      id: state.currentChatId || createId(),
      title: String(title || "New chat").replace(/\s+/g, " ").slice(0, 55),
      messages: [],
      updatedAt: Date.now()
    };

    state.currentChatId = chat.id;
    state.chats.unshift(chat);
  }

  return chat;
}

function persistMessage(role, content, title) {
  const chat = ensureChat(title || content);
  chat.messages.push({ role, content });
  chat.updatedAt = Date.now();
  saveChats();
  renderHistory();
}

function renderMessage(role, content) {
  const row = document.createElement("div");
  row.className = `message ${role}`;

  const inner = document.createElement("div");
  inner.className = "message-inner";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "StudyMetaAI";

  const body = document.createElement("div");
  body.innerHTML = role === "assistant"
    ? formatAI(content)
    : escapeHTML(content).replace(/\n/g, "<br>");

  inner.append(label, body);

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copy = document.createElement("button");
    copy.textContent = "Copy";
    copy.onclick = () =>
      navigator.clipboard.writeText(content).then(() => showToast("Response copied"));

    actions.appendChild(copy);
    inner.appendChild(actions);
  }

  row.appendChild(inner);
  messages.appendChild(row);
  return row;
}

function addMessage(role, content, persist = true, title = "") {
  welcome.hidden = true;
  renderMessage(role, content);

  if (persist) {
    persistMessage(role, content, title || content);
  }

  scrollBottom();
}

function addTyping() {
  const row = document.createElement("div");
  row.className = "message assistant";
  row.id = "typingMessage";
  row.innerHTML = `
    <div class="message-inner">
      <div class="message-label">StudyMetaAI</div>
      <div class="typing"><span></span><span></span><span></span></div>
    </div>`;
  messages.appendChild(row);
  scrollBottom();
}

function removeTyping() {
  $("typingMessage")?.remove();
}

function scrollBottom() {
  requestAnimationFrame(() => {
    const area = $("chatScroll");
    area.scrollTop = area.scrollHeight;
  });
}

async function sendMessage() {
  if (state.controller) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  updateComposer();

  addMessage("user", text, true, text);
  addTyping();

  state.controller = new AbortController();
  sendBtn.disabled = false;
  sendBtn.textContent = "■";
  sendBtn.title = "Stop generation";

  try {
    const response = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
      signal: state.controller.signal
    });

    const data = await response.json().catch(() => ({}));
    removeTyping();

    if (!response.ok) {
      throw new Error(data.detail || "The AI request failed.");
    }

    const answer = data.answer || "I could not generate a response.";
    addMessage("assistant", answer, true, text);
  } catch (error) {
    removeTyping();

    if (error.name === "AbortError") {
      showToast("Generation stopped.");
    } else {
      addMessage(
        "assistant",
        `Sorry, I couldn't process that request.\n\n${error.message}`,
        true,
        text
      );
      showToast("AI request failed");
    }
  } finally {
    state.controller = null;
    updateComposer();
    input.focus();
  }
}

function stopGeneration() {
  if (state.controller) state.controller.abort();
}

function updateComposer() {
  counter.textContent = `${input.value.length} / 8000`;
  sendBtn.disabled = !input.value.trim() && !state.controller;
  sendBtn.textContent = state.controller ? "■" : "↑";
  sendBtn.title = state.controller ? "Stop generation" : "Send message";

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function toggleTheme() {
  const light = !document.body.classList.contains("light");
  document.body.classList.toggle("light", light);
  localStorage.setItem("studyMetaTheme", light ? "light" : "dark");
}

function setupTheme() {
  document.body.classList.toggle(
    "light",
    localStorage.getItem("studyMetaTheme") === "light"
  );
}

function openSidebar() {
  const sidebar = $("sidebar");

  // Desktop: collapse / expand sidebar
  if (window.innerWidth > 850) {
    sidebar.classList.toggle("collapsed");
    return;
  }

  // Mobile: slide sidebar in
  sidebar.classList.add("open");
  $("sidebarOverlay").classList.add("show");
}

function closeSidebar() {
  const sidebar = $("sidebar");

  // Desktop
  if (window.innerWidth > 850) {
    sidebar.classList.add("collapsed");
    return;
  }

  // Mobile
  sidebar.classList.remove("open");
  $("sidebarOverlay").classList.remove("show");
}

function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function openModal(title, body) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("modalBackdrop").classList.add("show");
}

function closeModal() {
  $("modalBackdrop").classList.remove("show");
}

function copyConversation() {
  const chat = state.chats.find((item) => item.id === state.currentChatId);

  if (!chat?.messages?.length) {
    showToast("There is no conversation to copy.");
    return;
  }

  const text = chat.messages
    .map((m) => `${m.role === "user" ? "You" : "StudyMetaAI"}:\n${m.content}`)
    .join("\n\n");

  navigator.clipboard.writeText(text)
    .then(() => showToast("Conversation copied"))
    .catch(() => showToast("Clipboard access was blocked"));
}

function clearCurrentChat() {
  messages.innerHTML = "";
  welcome.hidden = false;

  const chat = state.chats.find((item) => item.id === state.currentChatId);
  if (chat) {
    chat.messages = [];
    chat.updatedAt = Date.now();
    saveChats();
  }

  renderHistory();
  showToast("Current chat cleared");
}

function clearHistory() {
  if (!state.chats.length) {
    showToast("No recent chats");
    return;
  }

  if (!confirm("Clear all recent chats saved on this device?")) return;

  state.chats = [];
  state.currentChatId = null;
  localStorage.removeItem("studyMetaChats");
  messages.innerHTML = "";
  welcome.hidden = false;
  renderHistory();
  showToast("Recent chats cleared");
}

function searchChats() {
  const query = prompt("Search your recent chats:");
  if (!query?.trim()) return;

  const q = query.toLowerCase();
  const matches = state.chats.filter((chat) =>
    `${chat.title} ${(chat.messages || []).map((m) => m.content).join(" ")}`
      .toLowerCase()
      .includes(q)
  );

  if (matches.length) {
    loadChat(matches[0].id);
    showToast(`${matches.length} matching chat${matches.length === 1 ? "" : "s"} found`);
  } else {
    showToast("No matching chats found");
  }
}

  // Settings
  $("settingsBtn").onclick = () => {
    openModal(
      "Settings",
      `
      <div class="settings-content">

        <h3>Account</h3>

        <div class="setting-item">
          <div>
            <strong>Login</strong>
            <p>Sign in to your StudyMetaAI account.</p>
          </div>

          <button
            class="settings-action"
            onclick="window.location.href='/login'"
          >
            Login
          </button>
        </div>


        <div class="setting-item">
          <div class="google-account">
            <span class="google-icon">G</span>

            <div>
              <strong>Login with Google</strong>
              <p>Continue securely with your Google account.</p>
            </div>
          </div>

          <button
            class="google-login-btn"
            onclick="googleLogin()"
          >
            Continue with Google
          </button>
        </div>


        <h3>Appearance</h3>

        <div class="setting-item">

          <div>
            <strong>Theme</strong>
            <p>Switch between dark and light mode.</p>
          </div>

          <button
            class="settings-action"
            onclick="toggleTheme()"
          >
            Change
          </button>

        </div>


        <h3>Chat</h3>

        <div class="setting-item">

          <div>
            <strong>Clear chat history</strong>
            <p>Remove conversations saved on this device.</p>
          </div>

          <button
            class="settings-action danger"
            onclick="clearHistory(); closeModal();"
          >
            Clear
          </button>

        </div>

      </div>
      `
    );
  

  $("libraryBtn").onclick = () =>
    openModal("Library", "<p>Your study files, notes and learning material can be organized here. Backend file processing can be connected next.</p>");

  $("projectsBtn").onclick = () =>
    openModal("Projects", "<p>Create and organize your Python, AI/ML, CSE and college projects here.</p>");

  $("scheduleBtn").onclick = () =>
    openModal("Scheduled", "<p>Study sessions, revision plans and reminders can be added here.</p>");

  $("pluginsBtn").onclick = () =>
    openModal("Plugins", "<p>External tools and integrations can be connected to StudyMetaAI here.</p>");

  $("codingBtn").onclick = () =>
    openModal("Coding Lab", "<p>A dedicated workspace for Python, C, JavaScript and other languages can be added here.</p>");

  $("moreBtn").onclick = () =>
    openModal("More", "<p>Additional StudyMetaAI features will appear here.</p>");
}
function googleLogin() {
  showToast("Google login will be connected next.");
}

function checkBackend() {
  fetch(`${API}/api/health`)
    .then((response) => {
      if (!response.ok) throw new Error();
    })
    .catch(() => showToast("Backend is not responding"));
}

// ============================================================
// BUTTON EVENTS
// ============================================================

if ($("newChatBtn")) {
  $("newChatBtn").onclick = newChat;
}

if ($("sendBtn")) {
  $("sendBtn").onclick = () =>
    state.controller ? stopGeneration() : sendMessage();
}

if ($("themeBtn")) {
  $("themeBtn").onclick = toggleTheme;
}

if ($("openSidebar")) {
  $("openSidebar").onclick = openSidebar;
}

if ($("closeSidebar")) {
  $("closeSidebar").onclick = closeSidebar;
}

if ($("sidebarOverlay")) {
  $("sidebarOverlay").onclick = closeSidebar;
}

if ($("copyChatBtn")) {
  $("copyChatBtn").onclick = copyConversation;
}

if ($("clearBtn")) {
  $("clearBtn").onclick = clearCurrentChat;
}

if ($("clearHistoryBtn")) {
  $("clearHistoryBtn").onclick = clearHistory;
}

if ($("searchChatsBtn")) {
  $("searchChatsBtn").onclick = searchChats;
}


// ============================================================
// PROFILE
// ============================================================

if ($("profileBtn")) {

  $("profileBtn").onclick = () => {

    const user = currentUser();

    const name =
      user.full_name ||
      user.name ||
      "Student";

    const email =
      user.email ||
      "";


    openModal(
      "",
      `
      <div class="account-switcher">

        <!-- CURRENT ACCOUNT -->

        <div class="account-current">

          <div class="account-avatar large">
            ${escapeHTML(
              name.charAt(0).toUpperCase()
            )}
          </div>

          <div class="account-main">

            <strong>
              ${escapeHTML(name)}
            </strong>

            <span>
              ${escapeHTML(email)}
            </span>

          </div>

          <button
            class="account-arrow"
            id="accountCloseBtn"
          >
            ×
          </button>

        </div>


        <!-- ADD ANOTHER ACCOUNT -->

        <button
          class="account-action"
          id="addAccountBtn"
        >

          <span class="account-action-icon">
            ＋
          </span>

          <span>
            Add another account
          </span>

        </button>


        <!-- SIGN OUT -->

        <button
          class="account-action signout-all"
          id="signOutAllBtn"
        >

          <span class="account-action-icon">
            ⇥
          </span>

          <span>
            Sign out
          </span>

        </button>


        <div class="account-footer">

          <button>
            Privacy policy
          </button>

          <span>•</span>

          <button>
            Terms of Service
          </button>

        </div>

      </div>
      `
    );


    // Close popup

    const closeButton =
      $("accountCloseBtn");

    if (closeButton) {
      closeButton.onclick = closeModal;
    }


    // Add another account

    const addButton =
      $("addAccountBtn");

    if (addButton) {

      addButton.onclick = () => {

        closeModal();

        window.location.href =
          "/login";

      };

    }


    // Sign out

    const signOutButton =
      $("signOutAllBtn");

    if (signOutButton) {

      signOutButton.onclick = () => {

        localStorage.removeItem(
          "studyMetaUser"
        );

        localStorage.removeItem(
          "studyMetaChats"
        );

        closeModal();

        window.location.href =
          "/login";

      };

    }

  };

}


// ============================================================
// SETTINGS
// ============================================================

if ($("settingsBtn")) {

  $("settingsBtn").onclick = () => {

    openModal(
      "Settings",
      `
      <div class="settings-content">

        <h3>Appearance</h3>

        <div class="setting-item">

          <div>
            <strong>Theme</strong>

            <p>
              Switch between dark and light mode.
            </p>
          </div>

          <button
            class="settings-action"
            id="settingsThemeBtn"
          >
            Change
          </button>

        </div>


        <h3>Chat</h3>

        <div class="setting-item">

          <div>
            <strong>Chat History</strong>

            <p>
              Manage conversations saved on this device.
            </p>
          </div>

          <button
            class="settings-action danger"
            id="settingsClearBtn"
          >
            Clear
          </button>

        </div>


        <h3>About</h3>

        <div class="setting-item">

          <div>
            <strong>StudyMetaAI</strong>

            <p>
              AI Study Assistant for learning,
              coding, projects and exam preparation.
            </p>
          </div>

          <span class="version">
            v1.0
          </span>

        </div>

      </div>
      `
    );


    // Theme button inside settings

    const themeButton =
      $("settingsThemeBtn");

    if (themeButton) {

      themeButton.onclick = () => {

        toggleTheme();

        closeModal();

      };

    }


    // Clear history button inside settings

    const clearButton =
      $("settingsClearBtn");

    if (clearButton) {

      clearButton.onclick = () => {

        clearHistory();

        closeModal();

      };

    }

  };

}


// ============================================================
// LOGOUT
// ============================================================

// Logout intentionally removed.


// ============================================================
// FILE ATTACHMENT
// ============================================================

if ($("attachBtn") && $("fileInput")) {

  $("attachBtn").onclick = () => {

    $("fileInput").click();

  };


  $("fileInput").onchange = () => {

    const file =
      $("fileInput").files?.[0];

    if (!file) return;


    state.attachedFile =
      file;


    $("attachmentPreview").textContent =
      `Attached: ${file.name} (${
        Math.max(
          1,
          Math.round(file.size / 1024)
        )
      } KB)`;


    showToast(
      "File attached"
    );

  };

}


// ============================================================
// MODAL CLOSE
// ============================================================

if ($("modalClose")) {

  $("modalClose").onclick =
    closeModal;

}


if ($("modalBackdrop")) {

  $("modalBackdrop").onclick =
    (event) => {

      if (
        event.target ===
        $("modalBackdrop")
      ) {

        closeModal();

      }

    };

}


// ============================================================
// QUICK PROMPTS
// ============================================================

document
  .querySelectorAll(".suggestion")
  .forEach((card) => {

    card.onclick = () => {

      input.value =
        card.dataset.prompt || "";

      updateComposer();

      sendMessage();

    };

  });


// ============================================================
// MESSAGE INPUT
// ============================================================

input.addEventListener(
  "input",
  () => {

    updateComposer();

  }
);


// ============================================================
// ENTER TO SEND
// ============================================================

input.addEventListener(
  "keydown",
  (event) => {

    // Enter = send
    // Shift + Enter = new line

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();

      sendMessage();

    }

  }
);


// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener(
  "keydown",
  (event) => {

    if (
      (event.ctrlKey ||
        event.metaKey) &&
      event.key.toLowerCase() === "k"
    ) {

      event.preventDefault();

      newChat();

    }


    if (
      (event.ctrlKey ||
        event.metaKey) &&
      event.key === "/"
    ) {

      event.preventDefault();

      searchChats();

    }


    if (event.key === "Escape") {

      if (state.controller) {

        stopGeneration();

      }

      closeModal();

      closeSidebar();

    }

  }
);


// ============================================================
// START APPLICATION
// ============================================================

setupUser();

setupTheme();

renderHistory();

updateComposer();

checkBackend();
$("sendBtn").onclick = () => state.controller ? stopGeneration() : sendMessage();
$("themeBtn").onclick = toggleTheme;
$("openSidebar").onclick = openSidebar;
$("closeSidebar").onclick = closeSidebar;
$("sidebarOverlay").onclick = closeSidebar;
$("copyChatBtn").onclick = copyConversation;
$("clearBtn").onclick = clearCurrentChat;
$("clearHistoryBtn").onclick = clearHistory;
$("settingsBtn").onclick = () => {
  openModal(
    "Settings",
    `
    <div class="settings-content">

      <h3>Account</h3>

      <div class="setting-item">

        <div>
          <strong>Login</strong>
          <p>Sign in to your StudyMetaAI account.</p>
        </div>

        <button
          class="settings-action"
          onclick="window.location.href='/login'"
        >
          Login
        </button>

      </div>


      <div class="setting-item">

        <div class="google-account">

          <span class="google-icon">
            G
          </span>

          <div>
            <strong>Login with Google</strong>
            <p>
              Continue securely with your Google account.
            </p>
          </div>

        </div>

        <button
          class="google-login-btn"
          onclick="googleLogin()"
        >
          Continue with Google
        </button>

      </div>


      <h3>Appearance</h3>

      <div class="setting-item">

        <div>
          <strong>Theme</strong>
          <p>
            Switch between dark and light mode.
          </p>
        </div>

        <button
          class="settings-action"
          onclick="toggleTheme()"
        >
          Change
        </button>

      </div>


      <h3>Chat</h3>

      <div class="setting-item">

        <div>
          <strong>Chat History</strong>
          <p>
            Manage conversations saved on this device.
          </p>
        </div>

        <button
          class="settings-action danger"
          onclick="clearHistory(); closeModal();"
        >
          Clear
        </button>

      </div>

    </div>
    `
  );
};

 

$("attachBtn").onclick = () => $("fileInput").click();

$("fileInput").onchange = () => {
  const file = $("fileInput").files?.[0];
  if (!file) return;

  state.attachedFile = file;
  $("attachmentPreview").textContent =
    `Attached: ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`;
  showToast("File attached");
};

$("modalClose").onclick = closeModal;
$("modalBackdrop").onclick = (event) => {
  if (event.target === $("modalBackdrop")) closeModal();
};

document.querySelectorAll(".suggestion").forEach((card) => {
  card.onclick = () => {
    input.value = card.dataset.prompt || "";
    updateComposer();
    sendMessage();
  };
});

input.addEventListener("input", updateComposer);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    newChat();
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "/") {
    event.preventDefault();
    searchChats();
  }

  if (event.key === "Escape") {
    if (state.controller) stopGeneration();
    closeModal();
    closeSidebar();
  }
});

setupUser();
setupTheme();
renderHistory();
updateComposer();
setupModals();
checkBackend();
