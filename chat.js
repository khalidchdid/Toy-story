(() => {
  const API_BASE = "https://young-leaf-1708.akhmouchkhalid20.workers.dev";

  const roomEl = document.getElementById("room");
  const senderEl = document.getElementById("sender");
  const logEl = document.getElementById("log");
  const msgEl = document.getElementById("msg");
  const statusEl = document.getElementById("status");

  const connectBtn = document.getElementById("connectBtn");
  const sendBtn = document.getElementById("sendBtn");

  // NEW: notification UI (add these elements in chat.html)
  const notifOnBtn = document.getElementById("notifOnBtn");
  const notifOffBtn = document.getElementById("notifOffBtn");
  const notifStatus = document.getElementById("notifStatus");

  const LS_ROOM = "ourStoryRoom";
  const LS_SENDER = "ourStorySender";
  const LS_DEVICE = "ourStoryDeviceId";
  const LS_SUB_ENDPOINT = "ourStoryPushEndpoint";

  let connected = false;
  let lastId = 0;
  let pollTimer = null;

  // stable device id (so we don't notify ourselves)
  let deviceId = localStorage.getItem(LS_DEVICE);
  if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    localStorage.setItem(LS_DEVICE, deviceId);
  }

  roomEl.value = localStorage.getItem(LS_ROOM) || "";
  senderEl.value = localStorage.getItem(LS_SENDER) || "";

  function setStatus(s) { statusEl.textContent = s; }
  function setNotifStatus(s) { if (notifStatus) notifStatus.textContent = s; }

  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function addLine(m) {
    const t = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    logEl.insertAdjacentHTML(
      "beforeend",
      `<div style="margin-bottom:10px;">
         <div style="color:var(--muted);font-size:12px;font-weight:800;">${esc(m.sender)} • ${t}</div>
         <div style="font-size:15px;font-weight:800;">${esc(m.body)}</div>
       </div>`
    );
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function fetchNew() {
    if (!connected) return;
    const room = roomEl.value.trim();
    const url = `${API_BASE}/messages?room=${encodeURIComponent(room)}&after=${lastId}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    for (const m of (data.messages || [])) {
      lastId = Math.max(lastId, m.id);
      addLine(m);
    }
  }

  async function connect() {
    const room = roomEl.value.trim();
    const sender = senderEl.value.trim();

    if (room.length < 8) return alert("Room code too short. Use 12+ chars.");
    if (!sender) return alert("Choose a sender name.");

    localStorage.setItem(LS_ROOM, room);
    localStorage.setItem(LS_SENDER, sender);

    logEl.innerHTML = "";
    lastId = 0;
    connected = true;
    setStatus("Connected (polling)");

    await fetchNew();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => fetchNew().catch(() => {}), 1200);

    // update notif UI state
    refreshNotifState().catch(() => {});
  }

  async function send() {
    if (!connected) return;

    const room = roomEl.value.trim();
    const sender = senderEl.value.trim();
    const body = msgEl.value.trim();
    if (!body) return;

    msgEl.value = "";

    const r = await fetch(`${API_BASE}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, sender, body, device: deviceId }),
    });

    if (!r.ok) {
      setStatus("Send failed (check internet)");
      return;
    }
    setStatus("Connected (polling)");
    await fetchNew();
  }

  // ---------- PUSH SUBSCRIBE ----------
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function getVapidPublicKey() {
    const r = await fetch(`${API_BASE}/vapidPublicKey`, { cache: "no-store" });
    if (!r.ok) throw new Error("vapidPublicKey failed");
    const data = await r.json();
    return data.publicKey;
  }

  async function subscribePush() {
    const room = roomEl.value.trim();
    if (room.length < 8) return alert("Enter a room code first.");
    if (!("serviceWorker" in navigator)) return alert("No service worker support.");
    if (!("PushManager" in window)) return alert("Push not supported on this device.");

    // iOS requirement: user must tap a button to trigger permission prompt  [oai_citation:8‡Apple Developer](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers?utm_source=chatgpt.com)
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setNotifStatus("Notifications: blocked");
      return;
    }

    const reg = await navigator.serviceWorker.ready;

    const vapidPublicKey = await getVapidPublicKey();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const subJson = sub.toJSON();
    localStorage.setItem(LS_SUB_ENDPOINT, sub.endpoint);

    const resp = await fetch(`${API_BASE}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, device: deviceId, sub: subJson }),
    });

    if (!resp.ok) {
      setNotifStatus("Notifications: subscribe failed");
      return;
    }
    setNotifStatus("Notifications: ON");
  }

  async function unsubscribePush() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub?.endpoint || localStorage.getItem(LS_SUB_ENDPOINT) || "";
    if (sub) await sub.unsubscribe().catch(() => {});
    if (endpoint) {
      await fetch(`${API_BASE}/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    localStorage.removeItem(LS_SUB_ENDPOINT);
    setNotifStatus("Notifications: OFF");
  }

  async function refreshNotifState() {
    if (!notifStatus) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotifStatus("Notifications: not supported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") {
      setNotifStatus("Notifications: blocked");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setNotifStatus(sub ? "Notifications: ON" : "Notifications: OFF");
  }

  // Listen for notification click messages (optional)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (ev) => {
      if (ev.data?.type === "OPEN_ROOM") {
        // if later you support multiple rooms, you can switch room here
      }
    });
  }

  // UI events
  connectBtn.addEventListener("click", () => connect().catch(() => setStatus("Connect failed")));
  sendBtn.addEventListener("click", () => send().catch(() => setStatus("Send failed")));
  msgEl.addEventListener("keydown", (e) => { if (e.key === "Enter") send().catch(() => {}); });

  if (notifOnBtn) notifOnBtn.addEventListener("click", () => subscribePush().catch(() => setNotifStatus("Notifications: error")));
  if (notifOffBtn) notifOffBtn.addEventListener("click", () => unsubscribePush().catch(() => setNotifStatus("Notifications: error")));

  // Initial state
  refreshNotifState().catch(() => {});
})();
