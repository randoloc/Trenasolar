import { supabase, isConfigured } from "./supabase-client.js?v=9";

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");

// ---------- Sesión ----------
async function checkSession() {
  if (!isConfigured) {
    const msg = document.getElementById("loginMsg");
    msg.textContent = "El panel todavía no está conectado a la base de datos.";
    msg.classList.add("err");
    document.getElementById("loginBtn").disabled = true;
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    showDashboard();
  } else {
    showLogin();
  }
}
function showLogin() {
  loginView.style.display = "flex";
  dashboardView.style.display = "none";
}
function showDashboard() {
  loginView.style.display = "none";
  dashboardView.style.display = "flex";
  loadAll();
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const msg = document.getElementById("loginMsg");
  msg.textContent = "";
  msg.className = "form-msg";
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    msg.textContent = "Correo o contraseña incorrectos.";
    msg.classList.add("err");
    return;
  }
  showDashboard();
});
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});

// ---------- Navegación entre pestañas ----------
document.querySelectorAll(".admin-nav [data-tab]").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".admin-nav [data-tab]").forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    document.querySelectorAll("main > section").forEach((s) => (s.style.display = "none"));
    document.getElementById("tab-" + link.dataset.tab).style.display = "block";
  });
});

const SERVICE_NAMES = { solar: "Energía Solar", electricidad: "Electricidad", automatica: "Automática" };
const STATUS_LABELS = { pendiente: "Pendiente", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada" };

function badge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// ---------- Carga general ----------
async function loadAll() {
  await Promise.all([loadStats(), loadAppointments(), loadClients(), loadBlocks(), loadReviews(), loadConfig()]);
}

// ---------- Configuración ----------
async function loadConfig() {
  const { data, error } = await supabase.from("admin_settings").select("*").eq("id", 1).single();
  if (error) {
    console.error("Error cargando configuración:", error);
    return;
  }
  document.getElementById("cfgPhone").value = data?.whatsapp_admin_phone || "";
  document.getElementById("cfgApikey").value = data?.callmebot_apikey || "";
  document.getElementById("cfgTelegramToken").value = data?.telegram_bot_token || "";
  document.getElementById("cfgTelegramChatId").value = data?.telegram_chat_id || "";
  document.getElementById("cfgEmail").value = data?.owner_email || "";
  document.getElementById("cfgResendKey").value = data?.resend_api_key || "";
}
document.getElementById("saveConfigBtn").addEventListener("click", async () => {
  const msg = document.getElementById("configMsg");
  msg.textContent = "";
  msg.className = "form-msg";

  const { error } = await supabase.from("admin_settings").upsert({
    id: 1,
    whatsapp_admin_phone: document.getElementById("cfgPhone").value.trim(),
    callmebot_apikey: document.getElementById("cfgApikey").value.trim(),
  });

  if (error) {
    console.error(error);
    msg.textContent = "No se pudo guardar.";
    msg.classList.add("err");
    return;
  }
  msg.textContent = "Guardado.";
  msg.classList.add("ok");
});
document.getElementById("saveTelegramConfigBtn").addEventListener("click", async () => {
  const msg = document.getElementById("telegramConfigMsg");
  msg.textContent = "";
  msg.className = "form-msg";

  const { error } = await supabase.from("admin_settings").upsert({
    id: 1,
    telegram_bot_token: document.getElementById("cfgTelegramToken").value.trim(),
    telegram_chat_id: document.getElementById("cfgTelegramChatId").value.trim(),
  });

  if (error) {
    console.error(error);
    msg.textContent = "No se pudo guardar.";
    msg.classList.add("err");
    return;
  }
  msg.textContent = "Guardado.";
  msg.classList.add("ok");
});
document.getElementById("saveEmailConfigBtn").addEventListener("click", async () => {
  const msg = document.getElementById("emailConfigMsg");
  msg.textContent = "";
  msg.className = "form-msg";
  const owner_email = document.getElementById("cfgEmail").value.trim();
  const resend_api_key = document.getElementById("cfgResendKey").value.trim();

  const { error } = await supabase.from("admin_settings").upsert({ id: 1, owner_email, resend_api_key });

  if (error) {
    console.error(error);
    msg.textContent = "No se pudo guardar.";
    msg.classList.add("err");
    return;
  }
  msg.textContent = "Guardado.";
  msg.classList.add("ok");
});

// ---------- Estadísticas ----------
async function loadStats() {
  const { data, error } = await supabase.from("stats_summary").select("*").single();
  if (error) {
    console.error("Error cargando estadísticas:", error);
    return;
  }
  document.getElementById("statCompletados").textContent = data.trabajos_completados ?? 0;
  document.getElementById("statActivas").textContent = data.citas_activas ?? 0;
  document.getElementById("statCalificacion").textContent = data.calificacion_promedio ?? "—";
  document.getElementById("statReferidos").textContent = data.clientes_por_referido ?? 0;
}

// ---------- Citas ----------
async function loadAppointments() {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, scheduled_date, scheduled_time, status, service_id, clients(full_name, phone)")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  if (error) {
    console.error("Error cargando citas:", error);
    return;
  }

  // Tabla completa
  const bodyAll = document.querySelector("#tablaCitas tbody");
  bodyAll.innerHTML = "";
  data.forEach((a) => bodyAll.appendChild(renderAppointmentRow(a, true)));
  if (data.length === 0) bodyAll.innerHTML = '<tr><td colspan="7" class="empty-state">Sin citas registradas.</td></tr>';

  // Próximas (resumen) — pendientes/confirmadas más cercanas
  const proximas = data.filter((a) => a.status === "pendiente" || a.status === "confirmada").slice(0, 6);
  const bodyProx = document.querySelector("#tablaProximas tbody");
  bodyProx.innerHTML = "";
  proximas.forEach((a) => bodyProx.appendChild(renderAppointmentRow(a, false)));
  if (proximas.length === 0) bodyProx.innerHTML = '<tr><td colspan="5" class="empty-state">No hay citas próximas.</td></tr>';
}

function renderAppointmentRow(a, withActions) {
  const tr = document.createElement("tr");
  const cliente = a.clients ? esc(a.clients.full_name) : "—";
  const telefono = a.clients ? esc(a.clients.phone) : "—";

  if (withActions) {
    tr.innerHTML = `
      <td>${a.scheduled_date}</td>
      <td>${a.scheduled_time.slice(0,5)}</td>
      <td>${SERVICE_NAMES[a.service_id] || a.service_id}</td>
      <td>${cliente}</td>
      <td>${telefono}</td>
      <td>${badge(a.status)}</td>
      <td class="row-actions"></td>
    `;
    const actions = tr.querySelector(".row-actions");

    if (a.clients?.phone) {
      const waBtn = document.createElement("button");
      waBtn.textContent = "WhatsApp";
      waBtn.style.fontWeight = "700";
      waBtn.onclick = () => openWhatsappConfirmation(a);
      actions.appendChild(waBtn);
    }

    const options = ["pendiente", "confirmada", "completada", "cancelada"].filter((s) => s !== a.status);
    options.forEach((s) => {
      const btn = document.createElement("button");
      btn.textContent = STATUS_LABELS[s];
      btn.onclick = () => updateAppointmentStatus(a.id, s);
      actions.appendChild(btn);
    });
  } else {
    tr.innerHTML = `
      <td>${a.scheduled_date}</td>
      <td>${a.scheduled_time.slice(0,5)}</td>
      <td>${SERVICE_NAMES[a.service_id] || a.service_id}</td>
      <td>${cliente}</td>
      <td>${badge(a.status)}</td>
    `;
  }
  return tr;
}

async function updateAppointmentStatus(id, status) {
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  if (error) {
    console.error(error);
    alert("No se pudo actualizar la cita.");
    return;
  }
  loadAppointments();
  loadStats();
}

function openWhatsappConfirmation(a) {
  const phoneDigits = a.clients.phone.replace(/[^\d]/g, "");
  const serviceName = SERVICE_NAMES[a.service_id] || a.service_id;
  const message =
    `Hola ${a.clients.full_name}, te confirmamos tu cita de ${serviceName} ` +
    `el ${a.scheduled_date} a las ${a.scheduled_time.slice(0, 5)}. ` +
    `¡Gracias por confiar en TreneSolar!`;
  window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`, "_blank");
}

// ---------- Clientes ----------
async function loadClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("full_name, phone, email, address, notes")
    .order("created_at", { ascending: false });
  const body = document.querySelector("#tablaClientes tbody");
  body.innerHTML = "";
  if (error) {
    console.error("Error cargando clientes:", error);
    return;
  }
  data.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(c.full_name)}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td>${esc(c.address)}</td><td>${esc(c.notes)}</td>`;
    body.appendChild(tr);
  });
  if (data.length === 0) body.innerHTML = '<tr><td colspan="5" class="empty-state">Sin clientes registrados.</td></tr>';
}

// ---------- Bloqueos de agenda ----------
async function loadBlocks() {
  const { data, error } = await supabase
    .from("blocked_slots")
    .select("id, blocked_date, blocked_time, reason")
    .order("blocked_date", { ascending: true });
  const body = document.querySelector("#tablaBloqueos tbody");
  body.innerHTML = "";
  if (error) {
    console.error("Error cargando bloqueos:", error);
    return;
  }
  data.forEach((b) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.blocked_date}</td>
      <td>${b.blocked_time ? b.blocked_time.slice(0,5) : "Todo el día"}</td>
      <td>${esc(b.reason)}</td>
      <td class="row-actions"><button data-id="${b.id}">Eliminar</button></td>
    `;
    tr.querySelector("button").onclick = () => deleteBlock(b.id);
    body.appendChild(tr);
  });
  if (data.length === 0) body.innerHTML = '<tr><td colspan="4" class="empty-state">No hay bloqueos activos.</td></tr>';
}

document.getElementById("addBlockBtn").addEventListener("click", async () => {
  const blocked_date = document.getElementById("blockDate").value;
  const blocked_time = document.getElementById("blockTime").value || null;
  const reason = document.getElementById("blockReason").value.trim() || null;
  if (!blocked_date) {
    alert("Elige una fecha.");
    return;
  }
  const { error } = await supabase.from("blocked_slots").insert({ blocked_date, blocked_time, reason });
  if (error) {
    console.error(error);
    alert("No se pudo crear el bloqueo.");
    return;
  }
  document.getElementById("blockDate").value = "";
  document.getElementById("blockTime").value = "";
  document.getElementById("blockReason").value = "";
  loadBlocks();
});
async function deleteBlock(id) {
  const { error } = await supabase.from("blocked_slots").delete().eq("id", id);
  if (error) {
    console.error(error);
    return;
  }
  loadBlocks();
}

// ---------- Reseñas ----------
async function loadReviews() {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, client_name, rating, comment, approved")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error cargando reseñas:", error);
    return;
  }
  const pendientes = data.filter((r) => !r.approved);
  const aprobadas = data.filter((r) => r.approved);

  const bodyP = document.querySelector("#tablaResenasPendientes tbody");
  bodyP.innerHTML = "";
  pendientes.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.client_name)}</td>
      <td>${"★".repeat(r.rating)}</td>
      <td>${esc(r.comment)}</td>
      <td class="row-actions"></td>
    `;
    const actions = tr.querySelector(".row-actions");
    const approveBtn = document.createElement("button");
    approveBtn.textContent = "Publicar";
    approveBtn.onclick = () => setReviewApproval(r.id, true);
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Descartar";
    deleteBtn.onclick = () => deleteReview(r.id);
    actions.append(approveBtn, deleteBtn);
    bodyP.appendChild(tr);
  });
  if (pendientes.length === 0) bodyP.innerHTML = '<tr><td colspan="4" class="empty-state">No hay reseñas pendientes.</td></tr>';

  const bodyA = document.querySelector("#tablaResenasAprobadas tbody");
  bodyA.innerHTML = "";
  aprobadas.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.client_name)}</td>
      <td>${"★".repeat(r.rating)}</td>
      <td>${esc(r.comment)}</td>
      <td class="row-actions"><button data-id="${r.id}">Ocultar</button></td>
    `;
    tr.querySelector("button").onclick = () => setReviewApproval(r.id, false);
    bodyA.appendChild(tr);
  });
  if (aprobadas.length === 0) bodyA.innerHTML = '<tr><td colspan="4" class="empty-state">Aún no hay reseñas publicadas.</td></tr>';
}
async function setReviewApproval(id, approved) {
  const { error } = await supabase.from("reviews").update({ approved }).eq("id", id);
  if (error) {
    console.error(error);
    return;
  }
  loadReviews();
  loadStats();
}
async function deleteReview(id) {
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) {
    console.error(error);
    return;
  }
  loadReviews();
}

checkSession();
