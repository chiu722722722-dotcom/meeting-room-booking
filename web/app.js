const defaultRooms = [
  { id: "a", name: "A 會議室", capacity: 6, equipment: "白板、視訊鏡頭", status: "active" },
  { id: "b", name: "B 會議室", capacity: 10, equipment: "投影機、HDMI", status: "active" },
  { id: "c", name: "C 會議室", capacity: 16, equipment: "大型螢幕、麥克風", status: "active" },
];

const defaultUsers = [
  { id: "admin", username: "admin", name: "系統管理員", password: "admin123", role: "admin", status: "active" },
];

const roleConfig = {
  admin: { label: "系統管理員", permissions: ["reports", "rooms", "accounts", "logs"] },
  manager: { label: "管理者", permissions: ["reports", "rooms"] },
  viewer: { label: "檢視者", permissions: ["reports"] },
  user: { label: "一般使用者", permissions: [] },
};

const storageKeys = {
  rooms: "meeting-room-rooms",
  bookings: "meeting-room-bookings",
  users: "meeting-room-users",
  currentUser: "meeting-room-current-user",
};

const WOFF_ID = "goQlqEM2d0eZwBKMM7xw3Q";
const timeOptions = buildTimeOptions("08:00", "19:00", 30);
let rooms = loadLocal(storageKeys.rooms, defaultRooms);
let bookings = loadLocal(storageKeys.bookings, []);
let users = loadLocal(storageKeys.users, defaultUsers);
let currentUser = loadLocalCurrentUser();
let currentView = "day";
let reportView = "day";
let apiAvailable = false;
let selectedRoomStatusFilter = "";
let auditLogs = [];
let isWoffContext = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const roomSelect = $("#room");
const dateInput = $("#date");
const viewDateInput = $("#viewDate");
const startTimeSelect = $("#startTime");
const endTimeSelect = $("#endTime");
const attendeesInput = $("#attendees");
const hostInput = $("#host");
const subjectInput = $("#subject");
const noteInput = $("#note");
const form = $("#bookingForm");
const bookingSubmitButton = form.querySelector('button[type="submit"]');
const bookingLogin = $("#bookingLogin");
const formMessage = $("#formMessage");
const availableHint = $("#availableHint");
const scheduleTitle = $("#scheduleTitle");
const scheduleDate = $("#scheduleDate");
const roomGrid = $("#roomGrid");
const bookingList = $("#bookingList");
const bookingCount = $("#bookingCount");
const roomCount = $("#roomCount");
const roomStatusFilter = $("#roomStatusFilter");
const clearPastButton = $("#clearPast");
const reportDateInput = $("#reportDate");
const reportRangeLabel = $("#reportRangeLabel");
const reportBookings = $("#reportBookings");
const reportHours = $("#reportHours");
const reportAverage = $("#reportAverage");
const reportTopRoom = $("#reportTopRoom");
const reportBars = $("#reportBars");
const usageDonut = $("#usageDonut");
const usageRate = $("#usageRate");
const usageHint = $("#usageHint");
const bookingChart = $("#bookingChart");
const chartUnitLabel = $("#chartUnitLabel");
const adminLoginCard = $("#adminLoginCard");
const adminContent = $("#adminContent");
const loginForm = $("#loginForm");
const loginUsernameInput = $("#loginUsername");
const loginPasswordInput = $("#loginPassword");
const loginMessage = $("#loginMessage");
const logoutButton = $("#logoutButton");
const currentUserName = $("#currentUserName");
const currentUserRole = $("#currentUserRole");
const permissionList = $("#permissionList");
const roomForm = $("#roomForm");
const roomIdInput = $("#roomId");
const roomNameInput = $("#roomName");
const roomCapacityInput = $("#roomCapacity");
const roomStatusInput = $("#roomStatus");
const roomEquipmentInput = $("#roomEquipment");
const roomFormMessage = $("#roomFormMessage");
const resetRoomFormButton = $("#resetRoomForm");
const adminRoomList = $("#adminRoomList");
const accountForm = $("#accountForm");
const accountIdInput = $("#accountId");
const accountUsernameInput = $("#accountUsername");
const accountNameInput = $("#accountName");
const accountRoleInput = $("#accountRole");
const accountStatusInput = $("#accountStatus");
const accountPasswordInput = $("#accountPassword");
const accountFormMessage = $("#accountFormMessage");
const resetAccountFormButton = $("#resetAccountForm");
const accountList = $("#accountList");
const auditLogList = $("#auditLogList");
const refreshLogsButton = $("#refreshLogs");
const appTabs = $("#appTabs");
const adminTab = $("#adminTab");

init();

async function init() {
  await initializeWoffSession();
  const today = toDateValue(new Date());
  dateInput.value = today;
  viewDateInput.value = today;
  reportDateInput.value = today;
  renderTimeOptions();
  bindEvents();
  await syncFromApi();
  render();
}

async function initializeWoffSession() {
  const params = new URLSearchParams(window.location.search);
  const launchedFromWoff = params.has("woff.state") || params.has("access_token");
  if (!launchedFromWoff || !window.woff) return;
  isWoffContext = true;

  try {
    await window.woff.init({ woffId: WOFF_ID });
    if (!window.woff.isLoggedIn()) {
      window.woff.login({ redirectUri: window.location.href });
      return;
    }
    const accessToken = window.woff.getAccessToken();
    if (!accessToken) return;
    const data = await apiRequest("/api/auth/woff", {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    });
    currentUser = data.user;
  } catch (error) {
    console.warn("WOFF initialization failed:", error);
  }
}

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  dateInput.addEventListener("change", syncFormDate);
  viewDateInput.addEventListener("change", syncViewDate);
  reportDateInput.addEventListener("change", renderReports);
  roomStatusFilter.addEventListener("change", changeRoomStatusFilter);
  roomSelect.addEventListener("change", updateAvailabilityHint);
  startTimeSelect.addEventListener("change", updateAvailabilityHint);
  endTimeSelect.addEventListener("change", updateAvailabilityHint);
  clearPastButton.addEventListener("click", clearPastBookings);
  bookingList.addEventListener("click", deleteBooking);
  $$(".view-tab").forEach((button) => button.addEventListener("click", changeView));
  $$(".report-tab").forEach((button) => button.addEventListener("click", changeReportView));
  $$(".app-tab").forEach((button) => button.addEventListener("click", switchPanel));
  loginForm.addEventListener("submit", loginAdmin);
  logoutButton.addEventListener("click", logoutAdmin);
  roomForm.addEventListener("submit", saveRoom);
  resetRoomFormButton.addEventListener("click", resetRoomForm);
  adminRoomList.addEventListener("click", handleAdminRoomAction);
  accountForm.addEventListener("submit", saveAccount);
  resetAccountFormButton.addEventListener("click", resetAccountForm);
  accountList.addEventListener("click", handleAccountAction);
  refreshLogsButton.addEventListener("click", loadAuditLogs);
}

async function syncFromApi() {
  try {
    const data = await apiRequest("/api/bootstrap");
    apiAvailable = true;
    rooms = data.rooms || rooms;
    bookings = data.bookings || [];
    currentUser = data.user || null;
    if (hasPermission("accounts")) {
      const userData = await apiRequest("/api/users");
      users = userData.users || users;
    }
    if (hasPermission("logs")) await loadAuditLogs();
  } catch {
    apiAvailable = false;
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "API request failed.");
  return data;
}

function renderTimeOptions() {
  startTimeSelect.innerHTML = "";
  endTimeSelect.innerHTML = "";
  timeOptions.forEach((time, index) => {
    startTimeSelect.append(new Option(time, time));
    if (index > 0) endTimeSelect.append(new Option(time, time));
  });
  startTimeSelect.value = "09:00";
  endTimeSelect.value = "10:00";
}

async function handleSubmit(event) {
  event.preventDefault();
  showMessage("");

  const booking = {
    id: crypto.randomUUID(),
    roomId: roomSelect.value,
    date: dateInput.value,
    start: startTimeSelect.value,
    end: endTimeSelect.value,
    attendees: Number(attendeesInput.value),
    host: currentUser?.name || "",
    subject: subjectInput.value.trim(),
    note: noteInput.value.trim(),
  };

  const validation = validateBookingLocal(booking);
  if (!validation.ok) return showMessage(validation.message);

  try {
    if (apiAvailable) {
      const data = await apiRequest("/api/bookings", { method: "POST", body: JSON.stringify(booking) });
      bookings.push(data.booking);
    } else {
      bookings.push(booking);
      saveLocal(storageKeys.bookings, bookings);
    }
    viewDateInput.value = booking.date;
    reportDateInput.value = booking.date;
    form.reset();
    dateInput.value = booking.date;
    attendeesInput.value = "4";
    roomSelect.value = booking.roomId;
    startTimeSelect.value = booking.end;
    endTimeSelect.value = nextTime(booking.end) || booking.end;
    showMessage(apiAvailable ? "預約已建立並儲存到資料庫。" : "預約已建立。", true);
    if (hasPermission("logs")) await loadAuditLogs();
    render();
  } catch (error) {
    showMessage(error.message);
  }
}

function validateBookingLocal(booking) {
  const room = rooms.find((item) => item.id === booking.roomId && item.status === "active");
  if (!room) return { ok: false, message: "請選擇可用的會議室。" };
  if (!booking.date) return { ok: false, message: "請選擇日期。" };
  if (toMinutes(booking.start) >= toMinutes(booking.end)) return { ok: false, message: "結束時間必須晚於開始時間。" };
  if (booking.attendees > room.capacity) return { ok: false, message: `${room.name} 最多容納 ${room.capacity} 人。` };
  if (!booking.host || !booking.subject) return { ok: false, message: "請填寫預約人與會議主題。" };
  if (hasConflict(booking)) return { ok: false, message: "此會議室在該時段已有預約，請改選其他時間或會議室。" };
  return { ok: true };
}

function hasConflict(target) {
  const targetStart = toMinutes(target.start);
  const targetEnd = toMinutes(target.end);
  return bookings.some((booking) => {
    if (booking.id === target.id) return false;
    if (booking.roomId !== target.roomId || booking.date !== target.date) return false;
    return targetStart < toMinutes(booking.end) && targetEnd > toMinutes(booking.start);
  });
}

function render() {
  renderRoomOptions();
  renderSchedule();
  renderIdentityAndAccess();
  renderAdminAuth();
  renderReports();
  renderAdminRooms();
  renderAccounts();
  renderAuditLogs();
}

function renderIdentityAndAccess() {
  const loggedIn = Boolean(currentUser);
  hostInput.value = currentUser?.name || "";
  hostInput.readOnly = true;
  bookingSubmitButton.disabled = !loggedIn;
  bookingLogin.classList.toggle("is-hidden", loggedIn || isWoffContext);

  if (!loggedIn && isWoffContext) {
    showMessage("正在等待 LINE WORKS 登入，請重新開啟 WOFF 頁面。");
  }

  const hideAdminInWoff = isWoffContext && !currentUser?.isOwner;
  appTabs.classList.toggle("is-hidden", hideAdminInWoff);
  adminTab.classList.toggle("is-hidden", hideAdminInWoff);
  if (hideAdminInWoff) {
    $$(".app-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.panel === "bookingPanel"));
    $$(".panel-view").forEach((panel) => panel.classList.toggle("is-active", panel.id === "bookingPanel"));
  }
}

function renderRoomOptions() {
  const previous = roomSelect.value;
  roomSelect.innerHTML = "";
  rooms
    .filter((room) => room.status === "active")
    .forEach((room) => roomSelect.append(new Option(`${room.name}（${room.capacity}人）`, room.id)));
  if ([...roomSelect.options].some((option) => option.value === previous)) roomSelect.value = previous;
  else selectBossRoom(roomSelect);
}

function renderRoomStatusFilter(activeRooms) {
  const previous = selectedRoomStatusFilter;
  roomStatusFilter.innerHTML = "";
  roomStatusFilter.append(new Option("全部會議室", "all"));
  activeRooms.forEach((room) => roomStatusFilter.append(new Option(`${room.name}（${room.capacity}人）`, room.id)));
  const fallback = activeRooms.find(isBossRoom)?.id || "all";
  selectedRoomStatusFilter = [...roomStatusFilter.options].some((option) => option.value === previous) ? previous : fallback;
  roomStatusFilter.value = selectedRoomStatusFilter;
}

function renderSchedule() {
  const range = getViewRange(viewDateInput.value || toDateValue(new Date()), currentView);
  const rangeBookings = getBookingsInRange(range.start, range.end);
  const activeRooms = rooms.filter((room) => room.status === "active");
  renderRoomStatusFilter(activeRooms);
  const visibleRooms = selectedRoomStatusFilter === "all" ? activeRooms : activeRooms.filter((room) => room.id === selectedRoomStatusFilter);
  const visibleBookings = selectedRoomStatusFilter === "all" ? rangeBookings : rangeBookings.filter((booking) => booking.roomId === selectedRoomStatusFilter);
  scheduleTitle.textContent = `${getViewLabel(currentView)}使用狀態`;
  scheduleDate.textContent = getRangeLabel(range, currentView);
  bookingCount.textContent = `${visibleBookings.length} 筆預約`;
  roomCount.textContent = `${visibleRooms.length} 間會議室`;

  roomGrid.innerHTML = "";
  visibleRooms.forEach((room) => {
    roomGrid.append(createRoomCard(room, visibleBookings.filter((booking) => booking.roomId === room.id), currentView));
  });

  bookingList.innerHTML = "";
  if (!visibleBookings.length) bookingList.append(createEmptyState("這個範圍還沒有預約。"));
  else visibleBookings.forEach((booking) => bookingList.append(createBookingItem(booking)));

  $$(".view-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.view === currentView));
  updateAvailabilityHint();
}

function createRoomCard(room, roomBookings, view) {
  const card = document.createElement("article");
  card.className = "room-card";
  card.innerHTML = `
    <div class="room-meta">
      <div>
        <h2>${escapeHtml(room.name)}</h2>
        <p>${escapeHtml(room.equipment)}</p>
      </div>
      <span class="room-capacity">${room.capacity} 人</span>
    </div>
  `;
  const slots = document.createElement("div");
  slots.className = "slots";
  if (!roomBookings.length) {
    slots.append(createEmptyState("此範圍可預約"));
  } else {
    roomBookings.forEach((booking) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      const dateLabel = view === "day" ? "" : `<small>${formatShortDate(booking.date)}</small>`;
      slot.innerHTML = `
        <time>${dateLabel}${booking.start}-${booking.end}</time>
        <div>
          <strong>${escapeHtml(booking.subject)}</strong>
          <span>${escapeHtml(booking.host)} · ${booking.attendees} 人</span>
        </div>
      `;
      slots.append(slot);
    });
  }
  card.append(slots);
  return card;
}

function createBookingItem(booking) {
  const room = rooms.find((item) => item.id === booking.roomId);
  const item = document.createElement("article");
  item.className = "booking-item";
  const canDelete = Boolean(currentUser && (currentUser.isOwner || booking.userId === currentUser.id));
  item.innerHTML = `
    <div>
      <h3>${escapeHtml(booking.subject)}</h3>
      <p>${formatShortDate(booking.date)} · ${escapeHtml(room?.name || "未知會議室")} · ${booking.start}-${booking.end} · ${escapeHtml(booking.host)} · ${booking.attendees} 人</p>
      ${booking.note ? `<p class="booking-note">${escapeHtml(booking.note)}</p>` : ""}
    </div>
    ${canDelete ? `<button type="button" class="delete-action" data-id="${booking.id}">取消</button>` : ""}
  `;
  return item;
}

function renderAdminAuth() {
  const loggedIn = Boolean(currentUser);
  adminLoginCard.classList.toggle("is-hidden", loggedIn);
  adminContent.classList.toggle("is-active", loggedIn);
  if (!loggedIn) return;

  const config = roleConfig[currentUser.role] || roleConfig.viewer;
  currentUserName.textContent = currentUser.name;
  currentUserRole.textContent = `${config.label} · ${currentUser.username}`;
  permissionList.innerHTML = "";
  [
    { key: "reports", label: "查看報表" },
    { key: "rooms", label: "管理會議室" },
    { key: "accounts", label: "管理帳號" },
    { key: "logs", label: "查看操作紀錄" },
  ].forEach((permission) => {
    const item = document.createElement("span");
    item.className = hasPermission(permission.key) ? "is-allowed" : "";
    item.textContent = permission.label;
    permissionList.append(item);
  });
  $$("[data-permission]").forEach((section) => section.classList.toggle("is-hidden", !hasPermission(section.dataset.permission)));
}

async function loginAdmin(event) {
  event.preventDefault();
  showLoginMessage("");
  try {
    if (apiAvailable) {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: loginUsernameInput.value.trim(), password: loginPasswordInput.value }),
      });
      currentUser = data.user;
      if (hasPermission("accounts")) users = (await apiRequest("/api/users")).users || users;
      if (hasPermission("logs")) await loadAuditLogs();
    } else {
      const user = users.find((item) => item.username === loginUsernameInput.value.trim() && item.password === loginPasswordInput.value);
      if (!user || user.status !== "active") throw new Error("帳號或密碼錯誤，或帳號已停用。");
      currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };
      sessionStorage.setItem(storageKeys.currentUser, currentUser.id);
    }
    loginForm.reset();
    render();
  } catch (error) {
    showLoginMessage(error.message);
  }
}

async function loadAuditLogs() {
  if (!apiAvailable || !hasPermission("logs")) return;
  const data = await apiRequest("/api/audit-logs");
  auditLogs = data.logs || [];
  renderAuditLogs();
}

async function logoutAdmin() {
  if (apiAvailable) await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => null);
  currentUser = null;
  sessionStorage.removeItem(storageKeys.currentUser);
  resetRoomForm();
  resetAccountForm();
  render();
}

function renderReports() {
  const range = getViewRange(reportDateInput.value || toDateValue(new Date()), reportView);
  const rangeBookings = getBookingsInRange(range.start, range.end);
  const totalMinutes = rangeBookings.reduce((sum, booking) => sum + (toMinutes(booking.end) - toMinutes(booking.start)), 0);
  const totalAttendees = rangeBookings.reduce((sum, booking) => sum + Number(booking.attendees || 0), 0);
  const roomStats = rooms.map((room) => {
    const roomBookings = rangeBookings.filter((booking) => booking.roomId === room.id);
    const minutes = roomBookings.reduce((sum, booking) => sum + (toMinutes(booking.end) - toMinutes(booking.start)), 0);
    return { room, count: roomBookings.length, hours: minutes / 60 };
  });
  const topRoom = [...roomStats].sort((a, b) => b.count - a.count || b.hours - a.hours)[0];
  const activeRoomCount = Math.max(1, rooms.filter((room) => room.status === "active").length);
  const availableHours = getRangeDayCount(range.start, range.end) * activeRoomCount * 11;
  const usagePercent = availableHours ? Math.min(100, Math.round((totalMinutes / 60 / availableHours) * 100)) : 0;

  reportRangeLabel.textContent = getRangeLabel(range, reportView);
  reportBookings.textContent = String(rangeBookings.length);
  reportHours.textContent = formatNumber(totalMinutes / 60);
  reportAverage.textContent = rangeBookings.length ? formatNumber(totalAttendees / rangeBookings.length) : "0";
  reportTopRoom.textContent = topRoom && topRoom.count > 0 ? topRoom.room.name : "-";
  usageDonut.style.setProperty("--value", usagePercent);
  usageRate.textContent = `${usagePercent}%`;
  usageHint.textContent = `${formatNumber(totalMinutes / 60)} / ${formatNumber(availableHours)} 小時`;
  chartUnitLabel.textContent = reportView === "day" ? "依時段" : "依日期";
  renderBookingChart(rangeBookings, range);
  renderRoomBars(roomStats);
  $$(".report-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.reportView === reportView));
}

function renderBookingChart(rangeBookings, range) {
  const buckets = getChartBuckets(range, reportView);
  rangeBookings.forEach((booking) => {
    const key = reportView === "day" ? getTimeBucket(booking.start) : booking.date;
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) bucket.count += 1;
  });
  const maxValue = Math.max(1, ...buckets.map((item) => item.count));
  bookingChart.innerHTML = "";
  buckets.forEach((bucket) => {
    const item = document.createElement("div");
    item.className = "mini-bar";
    item.innerHTML = `
      <span class="mini-bar-fill" style="height: ${Math.max(6, (bucket.count / maxValue) * 100)}%"></span>
      <strong>${bucket.count}</strong>
      <small>${escapeHtml(bucket.label)}</small>
    `;
    bookingChart.append(item);
  });
}

function renderRoomBars(roomStats) {
  const maxCount = Math.max(1, ...roomStats.map((item) => item.count));
  reportBars.innerHTML = "";
  roomStats.forEach((item) => {
    const row = document.createElement("article");
    row.className = "report-bar";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.room.name)}</strong>
        <span>${item.count} 筆 · ${formatNumber(item.hours)} 小時</span>
      </div>
      <div class="bar-track"><span style="width: ${(item.count / maxCount) * 100}%"></span></div>
    `;
    reportBars.append(row);
  });
}

function renderAdminRooms() {
  if (!hasPermission("rooms")) return;
  adminRoomList.innerHTML = "";
  rooms.forEach((room) => {
    const count = bookings.filter((booking) => booking.roomId === room.id).length;
    const item = document.createElement("article");
    item.className = "admin-room-item";
    item.innerHTML = `
      <div>
        <h3>${escapeHtml(room.name)}</h3>
        <p>${room.capacity} 人 · ${escapeHtml(room.equipment)}</p>
        <span class="room-state ${room.status === "active" ? "is-active" : ""}">${room.status === "active" ? "啟用" : "停用"} · ${count} 筆預約</span>
      </div>
      <div class="room-actions">
        <button type="button" class="ghost-action" data-action="edit" data-id="${room.id}">編輯</button>
        <button type="button" class="delete-action" data-action="delete" data-id="${room.id}">刪除</button>
      </div>
    `;
    adminRoomList.append(item);
  });
}

async function saveRoom(event) {
  event.preventDefault();
  if (!hasPermission("rooms")) return showRoomMessage("你的角色沒有管理會議室的權限。");
  const room = {
    id: roomIdInput.value || crypto.randomUUID(),
    name: roomNameInput.value.trim(),
    capacity: Number(roomCapacityInput.value),
    equipment: roomEquipmentInput.value.trim(),
    status: roomStatusInput.value,
  };
  if (!room.name || !room.capacity || !room.equipment) return showRoomMessage("請完整填寫會議室資料。");
  try {
    if (apiAvailable) {
      const path = roomIdInput.value ? `/api/rooms/${room.id}` : "/api/rooms";
      const method = roomIdInput.value ? "PATCH" : "POST";
      const data = await apiRequest(path, { method, body: JSON.stringify(room) });
      const index = rooms.findIndex((item) => item.id === data.room.id);
      if (index >= 0) rooms[index] = data.room;
      else rooms.push(data.room);
    } else {
      const index = rooms.findIndex((item) => item.id === room.id);
      if (index >= 0) rooms[index] = room;
      else rooms.push(room);
      saveLocal(storageKeys.rooms, rooms);
    }
    resetRoomForm();
    showRoomMessage("會議室已儲存。", true);
    if (hasPermission("logs")) await loadAuditLogs();
    render();
  } catch (error) {
    showRoomMessage(error.message);
  }
}

function handleAdminRoomAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !hasPermission("rooms")) return;
  const room = rooms.find((item) => item.id === button.dataset.id);
  if (!room) return;
  if (button.dataset.action === "edit") {
    roomIdInput.value = room.id;
    roomNameInput.value = room.name;
    roomCapacityInput.value = room.capacity;
    roomEquipmentInput.value = room.equipment;
    roomStatusInput.value = room.status;
    showRoomMessage("正在編輯會議室。", true);
    roomNameInput.focus();
    return;
  }
  deleteRoom(room);
}

async function deleteRoom(room) {
  try {
    if (apiAvailable) {
      const data = await apiRequest(`/api/rooms/${room.id}`, { method: "DELETE" });
      if (data.disabled && data.room) {
        rooms[rooms.findIndex((item) => item.id === room.id)] = data.room;
      } else {
        rooms = rooms.filter((item) => item.id !== room.id);
      }
    } else {
      const hasBookings = bookings.some((booking) => booking.roomId === room.id);
      if (hasBookings) room.status = "inactive";
      else rooms = rooms.filter((item) => item.id !== room.id);
      saveLocal(storageKeys.rooms, rooms);
    }
    showRoomMessage("會議室已更新。", true);
    if (hasPermission("logs")) await loadAuditLogs();
    render();
  } catch (error) {
    showRoomMessage(error.message);
  }
}

function renderAccounts() {
  if (!hasPermission("accounts")) return;
  accountList.innerHTML = "";
  users.forEach((user) => {
    const item = document.createElement("article");
    item.className = "account-item";
    item.innerHTML = `
      <div>
        <h3>${escapeHtml(user.name)}</h3>
        <p>${escapeHtml(user.username)} · ${roleConfig[user.role]?.label || "未設定角色"}</p>
        <span class="room-state ${user.status === "active" ? "is-active" : ""}">${user.status === "active" ? "啟用" : "停用"}</span>
      </div>
      <div class="room-actions">
        <button type="button" class="ghost-action" data-action="edit" data-id="${user.id}">編輯</button>
        <button type="button" class="delete-action" data-action="delete" data-id="${user.id}">刪除</button>
      </div>
    `;
    accountList.append(item);
  });
}

function renderAuditLogs() {
  if (!hasPermission("logs")) return;
  auditLogList.innerHTML = "";
  if (!apiAvailable) {
    auditLogList.append(createEmptyState("正式資料庫模式才會顯示操作紀錄。"));
    return;
  }
  if (!auditLogs.length) {
    auditLogList.append(createEmptyState("尚無操作紀錄。"));
    return;
  }
  auditLogs.forEach((log) => {
    const item = document.createElement("article");
    item.className = "audit-log-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(getAuditActionLabel(log.action))}</strong>
        <p>${escapeHtml(getAuditSummary(log))}</p>
      </div>
      <time>${formatDateTime(log.createdAt)}</time>
    `;
    auditLogList.append(item);
  });
}

async function saveAccount(event) {
  event.preventDefault();
  if (!hasPermission("accounts")) return showAccountMessage("你的角色沒有管理帳號的權限。");
  const account = {
    id: accountIdInput.value || crypto.randomUUID(),
    username: accountUsernameInput.value.trim(),
    name: accountNameInput.value.trim(),
    role: accountRoleInput.value,
    status: accountStatusInput.value,
    password: accountPasswordInput.value,
  };
  if (!account.username || !account.name || (!accountIdInput.value && !account.password)) return showAccountMessage("請完整填寫帳號資料。");
  try {
    if (apiAvailable) {
      const path = accountIdInput.value ? `/api/users/${account.id}` : "/api/users";
      const method = accountIdInput.value ? "PATCH" : "POST";
      const data = await apiRequest(path, { method, body: JSON.stringify(account) });
      const index = users.findIndex((item) => item.id === data.user.id);
      if (index >= 0) users[index] = data.user;
      else users.push(data.user);
    } else {
      const index = users.findIndex((item) => item.id === account.id);
      const saved = { ...account, password: account.password || users[index]?.password || "" };
      if (index >= 0) users[index] = saved;
      else users.push(saved);
      saveLocal(storageKeys.users, users);
    }
    resetAccountForm();
    showAccountMessage("帳號已儲存。", true);
    if (hasPermission("logs")) await loadAuditLogs();
    render();
  } catch (error) {
    showAccountMessage(error.message);
  }
}

function handleAccountAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !hasPermission("accounts")) return;
  const user = users.find((item) => item.id === button.dataset.id);
  if (!user) return;
  if (button.dataset.action === "edit") {
    accountIdInput.value = user.id;
    accountUsernameInput.value = user.username;
    accountNameInput.value = user.name;
    accountRoleInput.value = user.role;
    accountStatusInput.value = user.status;
    accountPasswordInput.value = "";
    showAccountMessage("正在編輯帳號。", true);
    accountUsernameInput.focus();
    return;
  }
  deleteAccount(user);
}

async function deleteAccount(user) {
  try {
    if (apiAvailable) {
      await apiRequest(`/api/users/${user.id}`, { method: "DELETE" });
    }
    users = users.filter((item) => item.id !== user.id);
    saveLocal(storageKeys.users, users);
    if (currentUser?.id === user.id) await logoutAdmin();
    else {
      showAccountMessage("帳號已刪除。", true);
      if (hasPermission("logs")) await loadAuditLogs();
      render();
    }
  } catch (error) {
    showAccountMessage(error.message);
  }
}

async function deleteBooking(event) {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  try {
    if (apiAvailable) await apiRequest(`/api/bookings/${button.dataset.id}`, { method: "DELETE" });
    bookings = bookings.filter((booking) => booking.id !== button.dataset.id);
    saveLocal(storageKeys.bookings, bookings);
    if (hasPermission("logs")) await loadAuditLogs();
    render();
  } catch (error) {
    showMessage(error.message);
  }
}

function clearPastBookings() {
  const today = toDateValue(new Date());
  bookings = bookings.filter((booking) => booking.date >= today);
  if (!apiAvailable) saveLocal(storageKeys.bookings, bookings);
  render();
}

function syncFormDate() {
  viewDateInput.value = dateInput.value;
  reportDateInput.value = dateInput.value;
  render();
}

function syncViewDate() {
  dateInput.value = viewDateInput.value;
  reportDateInput.value = viewDateInput.value;
  render();
}

function changeRoomStatusFilter(event) {
  selectedRoomStatusFilter = event.currentTarget.value;
  renderSchedule();
}

function selectBossRoom(selectElement) {
  const bossOption = [...selectElement.options].find((option) => isBossRoom({ name: option.textContent }));
  if (bossOption) selectElement.value = bossOption.value;
}

function isBossRoom(room) {
  return String(room?.name || "").toLowerCase().includes("boss");
}

function updateAvailabilityHint() {
  const draft = { id: "draft", roomId: roomSelect.value, date: dateInput.value, start: startTimeSelect.value, end: endTimeSelect.value };
  availableHint.classList.remove("is-open", "is-busy");
  if (!rooms.some((room) => room.status === "active")) {
    availableHint.textContent = "無可用會議室";
    availableHint.classList.add("is-busy");
    return;
  }
  if (!draft.date || !draft.start || !draft.end || toMinutes(draft.start) >= toMinutes(draft.end)) {
    availableHint.textContent = "選擇時段";
    return;
  }
  if (hasConflict(draft)) {
    availableHint.textContent = "時段已滿";
    availableHint.classList.add("is-busy");
    return;
  }
  availableHint.textContent = apiAvailable ? "可預約 · 資料庫" : "可預約";
  availableHint.classList.add("is-open");
}

function switchPanel(event) {
  const target = event.currentTarget.dataset.panel;
  $$(".app-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.panel === target));
  $$(".panel-view").forEach((panel) => panel.classList.toggle("is-active", panel.id === target));
}

function changeView(event) {
  currentView = event.currentTarget.dataset.view;
  renderSchedule();
}

function changeReportView(event) {
  reportView = event.currentTarget.dataset.reportView;
  renderReports();
}

function getAuditActionLabel(action) {
  return {
    "booking.create": "建立預約",
    "booking.delete": "刪除預約",
    "room.create": "新增會議室",
    "room.update": "編輯會議室",
    "room.disable": "停用會議室",
    "room.delete": "刪除會議室",
    "user.create": "新增帳號",
    "user.update": "編輯帳號",
    "user.delete": "刪除帳號",
  }[action] || action;
}

function getAuditSummary(log) {
  const payload = log.payload || {};
  const actor = log.actorUsername ? `${log.actorName}（${log.actorUsername}）` : log.actorName;
  const target = payload.subject || payload.name || payload.username || log.targetId || "-";
  const schedule = payload.date && payload.start ? ` · ${payload.date} ${payload.start}-${payload.end}` : "";
  return `${actor} · ${target}${schedule}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function resetRoomForm() {
  roomForm.reset();
  roomIdInput.value = "";
  roomStatusInput.value = "active";
  showRoomMessage("");
}

function resetAccountForm() {
  accountForm.reset();
  accountIdInput.value = "";
  accountRoleInput.value = "manager";
  accountStatusInput.value = "active";
  showAccountMessage("");
}

function hasPermission(permission) {
  if (!currentUser) return false;
  return (roleConfig[currentUser.role]?.permissions || []).includes(permission);
}

function getBookingsInRange(start, end) {
  return bookings
    .filter((booking) => booking.date >= start && booking.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start) || a.roomId.localeCompare(b.roomId));
}

function getViewRange(date, view) {
  const base = new Date(`${date}T00:00:00`);
  if (view === "week") {
    const day = base.getDay() || 7;
    const start = new Date(base);
    start.setDate(base.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toDateValue(start), end: toDateValue(end) };
  }
  if (view === "month") {
    return { start: toDateValue(new Date(base.getFullYear(), base.getMonth(), 1)), end: toDateValue(new Date(base.getFullYear(), base.getMonth() + 1, 0)) };
  }
  return { start: date, end: date };
}

function getViewLabel(view) {
  if (view === "week") return "本週";
  if (view === "month") return "本月";
  return "當日";
}

function getRangeLabel(range, view) {
  if (view === "day") return formatLongDate(range.start);
  if (view === "month") return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long" }).format(new Date(`${range.start}T00:00:00`));
  return `${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
}

function getRangeDayCount(start, end) {
  return Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1;
}

function getChartBuckets(range, view) {
  if (view === "day") {
    return [
      { key: "morning", label: "上午", count: 0 },
      { key: "noon", label: "中午", count: 0 },
      { key: "afternoon", label: "下午", count: 0 },
      { key: "evening", label: "晚上", count: 0 },
    ];
  }
  const buckets = [];
  for (const date = new Date(`${range.start}T00:00:00`); date <= new Date(`${range.end}T00:00:00`); date.setDate(date.getDate() + 1)) {
    const value = toDateValue(date);
    buckets.push({ key: value, label: view === "week" ? formatWeekday(value) : String(date.getDate()), count: 0 });
  }
  return buckets;
}

function getTimeBucket(time) {
  const minutes = toMinutes(time);
  if (minutes < 12 * 60) return "morning";
  if (minutes < 14 * 60) return "noon";
  if (minutes < 18 * 60) return "afternoon";
  return "evening";
}

function buildTimeOptions(start, end, interval) {
  const options = [];
  for (let minute = toMinutes(start); minute <= toMinutes(end); minute += interval) options.push(toTimeValue(minute));
  return options;
}

function toMinutes(time) {
  const [hour, minute] = String(time).split(":").map(Number);
  return hour * 60 + minute;
}

function toTimeValue(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function nextTime(time) {
  return timeOptions.find((option) => toMinutes(option) > toMinutes(time));
}

function toDateValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${date}T00:00:00`));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat("zh-TW", { weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function formatNumber(value) {
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

function createEmptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
}

function loadLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadLocalCurrentUser() {
  const id = sessionStorage.getItem(storageKeys.currentUser);
  const user = users.find((item) => item.id === id && item.status === "active");
  return user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null;
}

function showMessage(message, success = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("success", success);
}

function showLoginMessage(message, success = false) {
  loginMessage.textContent = message;
  loginMessage.classList.toggle("success", success);
}

function showRoomMessage(message, success = false) {
  roomFormMessage.textContent = message;
  roomFormMessage.classList.toggle("success", success);
}

function showAccountMessage(message, success = false) {
  accountFormMessage.textContent = message;
  accountFormMessage.classList.toggle("success", success);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
