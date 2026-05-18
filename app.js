const defaultRooms = [
  { id: "a", name: "A 會議室", capacity: 6, equipment: "白板、視訊鏡頭", status: "active" },
  { id: "b", name: "B 會議室", capacity: 10, equipment: "投影機、HDMI", status: "active" },
  { id: "c", name: "C 會議室", capacity: 16, equipment: "大型螢幕、麥克風", status: "active" },
];

const defaultUsers = [
  {
    id: "admin",
    username: "admin",
    name: "系統管理員",
    password: "admin123",
    role: "admin",
    status: "active",
  },
];

const roleConfig = {
  admin: {
    label: "系統管理員",
    permissions: ["reports", "rooms", "accounts"],
  },
  manager: {
    label: "管理者",
    permissions: ["reports", "rooms"],
  },
  viewer: {
    label: "檢視者",
    permissions: ["reports"],
  },
};

const bookingStorageKey = "meeting-room-bookings";
const roomStorageKey = "meeting-room-rooms";
const userStorageKey = "meeting-room-users";
const sessionStorageKey = "meeting-room-current-user";
const timeOptions = buildTimeOptions("08:00", "19:00", 30);

const roomSelect = document.querySelector("#room");
const dateInput = document.querySelector("#date");
const viewDateInput = document.querySelector("#viewDate");
const startTimeSelect = document.querySelector("#startTime");
const endTimeSelect = document.querySelector("#endTime");
const attendeesInput = document.querySelector("#attendees");
const hostInput = document.querySelector("#host");
const subjectInput = document.querySelector("#subject");
const noteInput = document.querySelector("#note");
const form = document.querySelector("#bookingForm");
const formMessage = document.querySelector("#formMessage");
const availableHint = document.querySelector("#availableHint");
const scheduleTitle = document.querySelector("#scheduleTitle");
const scheduleDate = document.querySelector("#scheduleDate");
const roomGrid = document.querySelector("#roomGrid");
const bookingList = document.querySelector("#bookingList");
const bookingCount = document.querySelector("#bookingCount");
const roomCount = document.querySelector("#roomCount");
const clearPastButton = document.querySelector("#clearPast");
const viewTabs = document.querySelectorAll(".view-tab");
const appTabs = document.querySelectorAll(".app-tab");
const panelViews = document.querySelectorAll(".panel-view");
const reportTabs = document.querySelectorAll(".report-tab");
const reportDateInput = document.querySelector("#reportDate");
const reportRangeLabel = document.querySelector("#reportRangeLabel");
const reportBookings = document.querySelector("#reportBookings");
const reportHours = document.querySelector("#reportHours");
const reportAverage = document.querySelector("#reportAverage");
const reportTopRoom = document.querySelector("#reportTopRoom");
const reportBars = document.querySelector("#reportBars");
const usageDonut = document.querySelector("#usageDonut");
const usageRate = document.querySelector("#usageRate");
const usageHint = document.querySelector("#usageHint");
const bookingChart = document.querySelector("#bookingChart");
const chartUnitLabel = document.querySelector("#chartUnitLabel");
const adminLoginCard = document.querySelector("#adminLoginCard");
const adminContent = document.querySelector("#adminContent");
const loginForm = document.querySelector("#loginForm");
const loginUsernameInput = document.querySelector("#loginUsername");
const loginPasswordInput = document.querySelector("#loginPassword");
const loginMessage = document.querySelector("#loginMessage");
const logoutButton = document.querySelector("#logoutButton");
const currentUserName = document.querySelector("#currentUserName");
const currentUserRole = document.querySelector("#currentUserRole");
const permissionList = document.querySelector("#permissionList");
const roomForm = document.querySelector("#roomForm");
const roomIdInput = document.querySelector("#roomId");
const roomNameInput = document.querySelector("#roomName");
const roomCapacityInput = document.querySelector("#roomCapacity");
const roomStatusInput = document.querySelector("#roomStatus");
const roomEquipmentInput = document.querySelector("#roomEquipment");
const roomFormMessage = document.querySelector("#roomFormMessage");
const resetRoomFormButton = document.querySelector("#resetRoomForm");
const adminRoomList = document.querySelector("#adminRoomList");
const accountForm = document.querySelector("#accountForm");
const accountIdInput = document.querySelector("#accountId");
const accountUsernameInput = document.querySelector("#accountUsername");
const accountNameInput = document.querySelector("#accountName");
const accountRoleInput = document.querySelector("#accountRole");
const accountStatusInput = document.querySelector("#accountStatus");
const accountPasswordInput = document.querySelector("#accountPassword");
const accountFormMessage = document.querySelector("#accountFormMessage");
const resetAccountFormButton = document.querySelector("#resetAccountForm");
const accountList = document.querySelector("#accountList");

let rooms = loadRooms();
let bookings = loadBookings();
let users = loadUsers();
let currentUser = loadCurrentUser();
let currentView = "day";
let reportView = "day";

function init() {
  const today = toDateValue(new Date());
  dateInput.value = today;
  viewDateInput.value = today;
  reportDateInput.value = today;

  renderRoomOptions();
  renderTimeOptions();

  form.addEventListener("submit", handleSubmit);
  dateInput.addEventListener("change", syncFormDate);
  viewDateInput.addEventListener("change", syncViewDate);
  reportDateInput.addEventListener("change", renderReports);
  roomSelect.addEventListener("change", updateAvailabilityHint);
  startTimeSelect.addEventListener("change", updateAvailabilityHint);
  endTimeSelect.addEventListener("change", updateAvailabilityHint);
  clearPastButton.addEventListener("click", clearPastBookings);
  bookingList.addEventListener("click", deleteBooking);
  viewTabs.forEach((button) => button.addEventListener("click", changeView));
  reportTabs.forEach((button) => button.addEventListener("click", changeReportView));
  appTabs.forEach((button) => button.addEventListener("click", switchPanel));
  loginForm.addEventListener("submit", loginAdmin);
  logoutButton.addEventListener("click", logoutAdmin);
  roomForm.addEventListener("submit", saveRoom);
  resetRoomFormButton.addEventListener("click", resetRoomForm);
  adminRoomList.addEventListener("click", handleAdminRoomAction);
  accountForm.addEventListener("submit", saveAccount);
  resetAccountFormButton.addEventListener("click", resetAccountForm);
  accountList.addEventListener("click", handleAccountAction);

  render();
}

function renderRoomOptions() {
  const activeRooms = rooms.filter((room) => room.status === "active");
  const previous = roomSelect.value;
  roomSelect.innerHTML = "";

  activeRooms.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = `${room.name}（${room.capacity}人）`;
    roomSelect.append(option);
  });

  if (activeRooms.some((room) => room.id === previous)) {
    roomSelect.value = previous;
  }
}

function renderTimeOptions() {
  timeOptions.forEach((time, index) => {
    const startOption = document.createElement("option");
    startOption.value = time;
    startOption.textContent = time;
    startTimeSelect.append(startOption);

    if (index > 0) {
      const endOption = document.createElement("option");
      endOption.value = time;
      endOption.textContent = time;
      endTimeSelect.append(endOption);
    }
  });

  startTimeSelect.value = "09:00";
  endTimeSelect.value = "10:00";
}

function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  const booking = {
    id: crypto.randomUUID(),
    roomId: roomSelect.value,
    date: dateInput.value,
    start: startTimeSelect.value,
    end: endTimeSelect.value,
    attendees: Number(attendeesInput.value),
    host: hostInput.value.trim(),
    subject: subjectInput.value.trim(),
    note: noteInput.value.trim(),
    createdAt: new Date().toISOString(),
  };

  const validation = validateBooking(booking);
  if (!validation.ok) {
    showMessage(validation.message);
    return;
  }

  bookings.push(booking);
  saveBookings();
  viewDateInput.value = booking.date;
  reportDateInput.value = booking.date;
  form.reset();
  dateInput.value = booking.date;
  attendeesInput.value = "4";
  roomSelect.value = booking.roomId;
  startTimeSelect.value = booking.end;
  endTimeSelect.value = nextTime(booking.end) || booking.end;
  showMessage("預約已建立。", true);
  render();
}

function validateBooking(booking) {
  const room = rooms.find((item) => item.id === booking.roomId && item.status === "active");

  if (!room) return { ok: false, message: "請選擇可用的會議室。" };
  if (!booking.date) return { ok: false, message: "請選擇日期。" };
  if (toMinutes(booking.start) >= toMinutes(booking.end)) {
    return { ok: false, message: "結束時間必須晚於開始時間。" };
  }
  if (booking.attendees > room.capacity) {
    return { ok: false, message: `${room.name} 最多容納 ${room.capacity} 人。` };
  }
  if (!booking.host || !booking.subject) {
    return { ok: false, message: "請填寫預約人與會議主題。" };
  }
  if (hasConflict(booking)) {
    return { ok: false, message: "此會議室在該時段已有預約，請改選其他時間或會議室。" };
  }

  return { ok: true };
}

function hasConflict(target) {
  const targetStart = toMinutes(target.start);
  const targetEnd = toMinutes(target.end);

  return bookings.some((booking) => {
    if (booking.id === target.id) return false;
    if (booking.roomId !== target.roomId || booking.date !== target.date) return false;

    const start = toMinutes(booking.start);
    const end = toMinutes(booking.end);
    return targetStart < end && targetEnd > start;
  });
}

function render() {
  renderSchedule();
  renderAdminAuth();
  renderReports();
  renderAdminRooms();
  renderAccounts();
}

function renderAdminAuth() {
  const loggedIn = Boolean(currentUser);
  adminLoginCard.classList.toggle("is-hidden", loggedIn);
  adminContent.classList.toggle("is-active", loggedIn);

  if (!loggedIn) {
    return;
  }

  const config = roleConfig[currentUser.role] || roleConfig.viewer;
  currentUserName.textContent = currentUser.name;
  currentUserRole.textContent = `${config.label} · ${currentUser.username}`;

  permissionList.innerHTML = "";
  [
    { key: "reports", label: "查看報表" },
    { key: "rooms", label: "管理會議室" },
    { key: "accounts", label: "管理帳號" },
  ].forEach((permission) => {
    const item = document.createElement("span");
    item.className = hasPermission(permission.key) ? "is-allowed" : "";
    item.textContent = permission.label;
    permissionList.append(item);
  });

  document.querySelectorAll("[data-permission]").forEach((section) => {
    section.classList.toggle("is-hidden", !hasPermission(section.dataset.permission));
  });
}

function loginAdmin(event) {
  event.preventDefault();
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;
  const user = users.find((item) => item.username === username && item.password === password);

  if (!user || user.status !== "active") {
    showLoginMessage("帳號或密碼錯誤，或帳號已停用。");
    return;
  }

  currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };
  sessionStorage.setItem(sessionStorageKey, currentUser.id);
  loginForm.reset();
  showLoginMessage("");
  render();
}

function logoutAdmin() {
  currentUser = null;
  sessionStorage.removeItem(sessionStorageKey);
  resetRoomForm();
  resetAccountForm();
  render();
}

function hasPermission(permission) {
  if (!currentUser) return false;
  return (roleConfig[currentUser.role]?.permissions || []).includes(permission);
}

function renderSchedule() {
  const selectedDate = viewDateInput.value || toDateValue(new Date());
  const range = getViewRange(selectedDate, currentView);
  const rangeBookings = getBookingsInRange(range.start, range.end);
  const visibleRooms = rooms.filter((room) => room.status === "active");

  scheduleTitle.textContent = `${getViewLabel(currentView)}使用狀態`;
  scheduleDate.textContent = getRangeLabel(range, currentView);
  bookingCount.textContent = `${rangeBookings.length} 筆預約`;
  roomCount.textContent = `${visibleRooms.length} 間會議室`;

  roomGrid.innerHTML = "";
  visibleRooms.forEach((room) => {
    const roomBookings = rangeBookings.filter((booking) => booking.roomId === room.id);
    roomGrid.append(createRoomCard(room, roomBookings, currentView));
  });

  bookingList.innerHTML = "";
  if (rangeBookings.length === 0) {
    bookingList.append(createEmptyState("這個範圍還沒有預約。"));
  } else {
    rangeBookings.forEach((booking) => bookingList.append(createBookingItem(booking)));
  }

  viewTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === currentView);
  });
  updateAvailabilityHint();
}

function createRoomCard(room, roomBookings, view) {
  const card = document.createElement("article");
  card.className = "room-card";

  const meta = document.createElement("div");
  meta.className = "room-meta";
  meta.innerHTML = `
    <div>
      <h2>${escapeHtml(room.name)}</h2>
      <p>${escapeHtml(room.equipment)}</p>
    </div>
    <span class="room-capacity">${room.capacity} 人</span>
  `;

  const slots = document.createElement("div");
  slots.className = "slots";

  if (roomBookings.length === 0) {
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

  card.append(meta, slots);
  return card;
}

function createBookingItem(booking) {
  const room = rooms.find((item) => item.id === booking.roomId);
  const item = document.createElement("article");
  item.className = "booking-item";

  const details = document.createElement("div");
  details.innerHTML = `
    <h3>${escapeHtml(booking.subject)}</h3>
    <p>${formatShortDate(booking.date)} · ${escapeHtml(room?.name || "未知會議室")} · ${booking.start}-${booking.end} · ${escapeHtml(booking.host)} · ${booking.attendees} 人</p>
  `;

  if (booking.note) {
    const note = document.createElement("p");
    note.className = "booking-note";
    note.textContent = booking.note;
    details.append(note);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "delete-action";
  button.dataset.id = booking.id;
  button.textContent = "取消";

  item.append(details, button);
  return item;
}

function renderReports() {
  const range = getViewRange(reportDateInput.value || toDateValue(new Date()), reportView);
  const reportBookingsInRange = getBookingsInRange(range.start, range.end);
  const totalMinutes = reportBookingsInRange.reduce((sum, booking) => sum + (toMinutes(booking.end) - toMinutes(booking.start)), 0);
  const totalAttendees = reportBookingsInRange.reduce((sum, booking) => sum + Number(booking.attendees || 0), 0);
  const roomStats = rooms.map((room) => {
    const roomBookings = reportBookingsInRange.filter((booking) => booking.roomId === room.id);
    const minutes = roomBookings.reduce((sum, booking) => sum + (toMinutes(booking.end) - toMinutes(booking.start)), 0);
    return { room, count: roomBookings.length, hours: minutes / 60 };
  });
  const topRoom = [...roomStats].sort((a, b) => b.count - a.count || b.hours - a.hours)[0];
  const maxCount = Math.max(1, ...roomStats.map((item) => item.count));
  const availableHours = getRangeDayCount(range.start, range.end) * rooms.filter((room) => room.status === "active").length * 11;
  const usagePercent = availableHours ? Math.min(100, Math.round((totalMinutes / 60 / availableHours) * 100)) : 0;

  reportRangeLabel.textContent = getRangeLabel(range, reportView);
  reportBookings.textContent = String(reportBookingsInRange.length);
  reportHours.textContent = formatNumber(totalMinutes / 60);
  reportAverage.textContent = reportBookingsInRange.length ? formatNumber(totalAttendees / reportBookingsInRange.length) : "0";
  reportTopRoom.textContent = topRoom && topRoom.count > 0 ? topRoom.room.name : "-";
  usageDonut.style.setProperty("--value", usagePercent);
  usageRate.textContent = `${usagePercent}%`;
  usageHint.textContent = `${formatNumber(totalMinutes / 60)} / ${formatNumber(availableHours)} 小時`;
  chartUnitLabel.textContent = reportView === "day" ? "依時段" : "依日期";

  renderBookingChart(reportBookingsInRange, range);
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

  reportTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.reportView === reportView);
  });
}

function renderBookingChart(reportBookingsInRange, range) {
  const buckets = getChartBuckets(range, reportView);
  reportBookingsInRange.forEach((booking) => {
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

function renderAdminRooms() {
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

function saveRoom(event) {
  event.preventDefault();
  if (!hasPermission("rooms")) {
    showRoomMessage("你的角色沒有管理會議室的權限。");
    return;
  }

  const id = roomIdInput.value || crypto.randomUUID();
  const room = {
    id,
    name: roomNameInput.value.trim(),
    capacity: Number(roomCapacityInput.value),
    equipment: roomEquipmentInput.value.trim(),
    status: roomStatusInput.value,
  };

  if (!room.name || !room.capacity || !room.equipment) {
    showRoomMessage("請完整填寫會議室資料。");
    return;
  }

  const duplicated = rooms.some((item) => item.id !== id && item.name === room.name);
  if (duplicated) {
    showRoomMessage("會議室名稱已存在。");
    return;
  }

  const index = rooms.findIndex((item) => item.id === id);
  if (index >= 0) {
    rooms[index] = room;
  } else {
    rooms.push(room);
  }

  saveRooms();
  resetRoomForm();
  showRoomMessage("會議室已儲存。", true);
  renderRoomOptions();
  render();
}

function handleAdminRoomAction(event) {
  if (!hasPermission("rooms")) return;

  const button = event.target.closest("button[data-action]");
  if (!button) return;

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

  const hasBookings = bookings.some((booking) => booking.roomId === room.id);
  if (hasBookings) {
    room.status = "inactive";
    showRoomMessage("此會議室已有預約紀錄，已改為停用以保留報表資料。", true);
  } else {
    rooms = rooms.filter((item) => item.id !== room.id);
    showRoomMessage("會議室已刪除。", true);
  }

  saveRooms();
  renderRoomOptions();
  render();
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

function saveAccount(event) {
  event.preventDefault();
  if (!hasPermission("accounts")) {
    showAccountMessage("你的角色沒有管理帳號的權限。");
    return;
  }

  const id = accountIdInput.value || crypto.randomUUID();
  const password = accountPasswordInput.value;
  const existing = users.find((user) => user.id === id);
  const account = {
    id,
    username: accountUsernameInput.value.trim(),
    name: accountNameInput.value.trim(),
    password: password || existing?.password || "",
    role: accountRoleInput.value,
    status: accountStatusInput.value,
  };

  if (!account.username || !account.name || !account.password) {
    showAccountMessage("請完整填寫帳號、顯示名稱與密碼。");
    return;
  }

  const duplicated = users.some((user) => user.id !== id && user.username === account.username);
  if (duplicated) {
    showAccountMessage("帳號名稱已存在。");
    return;
  }

  const index = users.findIndex((user) => user.id === id);
  if (index >= 0) {
    users[index] = account;
  } else {
    users.push(account);
  }

  saveUsers();
  resetAccountForm();
  showAccountMessage("帳號已儲存。", true);
  refreshCurrentUser();
  render();
}

function handleAccountAction(event) {
  if (!hasPermission("accounts")) return;

  const button = event.target.closest("button[data-action]");
  if (!button) return;

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

  const activeAdmins = users.filter((item) => item.role === "admin" && item.status === "active");
  if (user.role === "admin" && activeAdmins.length <= 1) {
    showAccountMessage("至少需要保留一個啟用中的系統管理員。");
    return;
  }

  users = users.filter((item) => item.id !== user.id);
  saveUsers();

  if (currentUser?.id === user.id) {
    logoutAdmin();
    return;
  }

  showAccountMessage("帳號已刪除。", true);
  render();
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

function refreshCurrentUser() {
  if (!currentUser) return;
  const user = users.find((item) => item.id === currentUser.id && item.status === "active");
  if (!user) {
    logoutAdmin();
    return;
  }
  currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };
}

function switchPanel(event) {
  const target = event.currentTarget.dataset.panel;
  appTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.panel === target));
  panelViews.forEach((panel) => panel.classList.toggle("is-active", panel.id === target));
}

function changeView(event) {
  currentView = event.currentTarget.dataset.view;
  renderSchedule();
}

function changeReportView(event) {
  reportView = event.currentTarget.dataset.reportView;
  renderReports();
}

function deleteBooking(event) {
  const button = event.target.closest("button[data-id]");
  if (!button) return;

  bookings = bookings.filter((booking) => booking.id !== button.dataset.id);
  saveBookings();
  render();
}

function clearPastBookings() {
  const today = toDateValue(new Date());
  bookings = bookings.filter((booking) => booking.date >= today);
  saveBookings();
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

function updateAvailabilityHint() {
  const draft = {
    id: "draft",
    roomId: roomSelect.value,
    date: dateInput.value,
    start: startTimeSelect.value,
    end: endTimeSelect.value,
  };

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

  availableHint.textContent = "可預約";
  availableHint.classList.add("is-open");
}

function createEmptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
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
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { start: toDateValue(start), end: toDateValue(end) };
  }

  return { start: date, end: date };
}

function getBookingsInRange(start, end) {
  return bookings
    .filter((booking) => booking.date >= start && booking.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start) || a.roomId.localeCompare(b.roomId));
}

function getViewLabel(view) {
  if (view === "week") return "本週";
  if (view === "month") return "本月";
  return "當日";
}

function getRangeLabel(range, view) {
  if (view === "day") return formatLongDate(range.start);
  if (view === "month") {
    return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long" }).format(new Date(`${range.start}T00:00:00`));
  }
  return `${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
}

function getRangeDayCount(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate - startDate) / 86400000) + 1;
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
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const value = toDateValue(date);
    buckets.push({
      key: value,
      label: view === "week" ? formatWeekday(value) : String(date.getDate()),
      count: 0,
    });
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
  for (let minute = toMinutes(start); minute <= toMinutes(end); minute += interval) {
    options.push(toTimeValue(minute));
  }
  return options;
}

function toMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function toTimeValue(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function nextTime(time) {
  return timeOptions.find((option) => toMinutes(option) > toMinutes(time));
}

function toDateValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T00:00:00`));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function formatNumber(value) {
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

function loadRooms() {
  try {
    const savedRooms = JSON.parse(localStorage.getItem(roomStorageKey));
    if (Array.isArray(savedRooms) && savedRooms.length) return savedRooms;
  } catch {
    return defaultRooms;
  }
  return defaultRooms;
}

function saveRooms() {
  localStorage.setItem(roomStorageKey, JSON.stringify(rooms));
}

function loadUsers() {
  try {
    const savedUsers = JSON.parse(localStorage.getItem(userStorageKey));
    if (Array.isArray(savedUsers) && savedUsers.length) return savedUsers;
  } catch {
    return defaultUsers;
  }
  return defaultUsers;
}

function saveUsers() {
  localStorage.setItem(userStorageKey, JSON.stringify(users));
}

function loadCurrentUser() {
  const userId = sessionStorage.getItem(sessionStorageKey);
  if (!userId) return null;

  const user = users.find((item) => item.id === userId && item.status === "active");
  if (!user) return null;
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(bookingStorageKey)) || [];
  } catch {
    return [];
  }
}

function saveBookings() {
  localStorage.setItem(bookingStorageKey, JSON.stringify(bookings));
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

function clearMessage() {
  showMessage("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
