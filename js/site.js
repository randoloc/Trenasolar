import { supabase, isConfigured } from "./supabase-client.js?v=12";
import QRCode from "https://esm.sh/qrcode@1.5.3";

// ---------- Config de horarios ----------
const TIME_SLOTS = ["09:00", "11:30", "14:00", "16:30"];
const DAYS_AHEAD = 21;

// ---------- Estado ----------
let selectedService = "solar";
let selectedDate = null;
let selectedTime = null;
let bookedSlots = [];   // [{scheduled_date, scheduled_time}]
let blockedSlots = [];  // [{blocked_date, blocked_time}]
let newClientId = null;

const params = new URLSearchParams(location.search);
const referrerId = params.get("ref");

// ---------- Utilidades de fecha ----------
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}
function formatDayLabel(d) {
  return d.getDate();
}
function formatFullDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

// ---------- Carga inicial de disponibilidad ----------
async function loadAvailability() {
  const [{ data: booked, error: e1 }, { data: blocked, error: e2 }] = await Promise.all([
    supabase.from("public_booked_slots").select("scheduled_date,scheduled_time"),
    supabase.from("blocked_slots").select("blocked_date,blocked_time"),
  ]);
  if (e1) console.error("Error cargando citas ocupadas:", e1);
  if (e2) console.error("Error cargando bloqueos:", e2);
  bookedSlots = booked || [];
  blockedSlots = blocked || [];
}

function isDayFullyBlocked(iso) {
  return blockedSlots.some((b) => b.blocked_date === iso && b.blocked_time === null);
}
function isDayFullyBooked(iso) {
  const takenCount = TIME_SLOTS.filter((t) => isSlotTaken(iso, t)).length;
  return takenCount >= TIME_SLOTS.length;
}
function isSlotTaken(iso, time) {
  const bookedHit = bookedSlots.some(
    (b) => b.scheduled_date === iso && b.scheduled_time.slice(0, 5) === time
  );
  const blockedHit = blockedSlots.some(
    (b) => b.blocked_date === iso && (b.blocked_time === null || b.blocked_time.slice(0, 5) === time)
  );
  return bookedHit || blockedHit;
}

// ---------- Render del calendario ----------
function renderDayGrid() {
  const grid = document.getElementById("dayGrid");
  grid.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const startD = today;
  const endD = new Date(today);
  endD.setDate(endD.getDate() + DAYS_AHEAD - 1);
  const monthLabel = document.getElementById("calendarMonthLabel");
  if (startD.getMonth() === endD.getMonth()) {
    monthLabel.textContent = `${monthNames[startD.getMonth()]} ${startD.getFullYear()}`;
  } else {
    monthLabel.textContent = `${monthNames[startD.getMonth()]} – ${monthNames[endD.getMonth()]} ${endD.getFullYear()}`;
  }

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = toISODate(d);
    const disabled = isDayFullyBlocked(iso) || isDayFullyBooked(iso);
    const isFirstOfMonth = d.getDate() === 1;

    const btn = document.createElement("button");
    btn.className = "day" + (disabled ? " disabled" : "") + (iso === selectedDate ? " active" : "");
    btn.innerHTML = isFirstOfMonth
      ? `${formatDayLabel(d)}<span class="day-month">${monthNames[d.getMonth()].slice(0, 3)}</span>`
      : `${formatDayLabel(d)}`;
    btn.title = iso;
    if (!disabled) {
      btn.onclick = () => {
        selectedDate = iso;
        selectedTime = null;
        document.getElementById("sumDate").textContent = formatFullDate(iso);
        document.getElementById("sumSlot").textContent = "Elige un horario";
        renderDayGrid();
        renderSlotGrid();
      };
    }
    grid.appendChild(btn);
  }

  if (!selectedDate) {
    // selecciona automáticamente el primer día disponible
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const iso = toISODate(d);
      if (!isDayFullyBlocked(iso) && !isDayFullyBooked(iso)) {
        selectedDate = iso;
        document.getElementById("sumDate").textContent = formatFullDate(iso);
        renderDayGrid();
        break;
      }
    }
  }
}

function renderSlotGrid() {
  const grid = document.getElementById("slotGrid");
  grid.innerHTML = "";
  if (!selectedDate) return;

  TIME_SLOTS.forEach((time) => {
    const taken = isSlotTaken(selectedDate, time);
    const btn = document.createElement("button");
    btn.className = "slot" + (taken ? " taken" : "") + (time === selectedTime ? " active" : "");
    btn.textContent = formatTime(time);
    if (!taken) {
      btn.onclick = () => {
        selectedTime = time;
        document.getElementById("sumSlot").textContent = formatTime(time);
        renderSlotGrid();
      };
    }
    grid.appendChild(btn);
  });
}
function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

// ---------- Selección de servicio ----------
document.getElementById("servicePills").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-service]");
  if (!btn) return;
  document.querySelectorAll("[data-service]").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  selectedService = btn.dataset.service;
  document.getElementById("sumService").textContent = btn.textContent;
});

// ---------- Confirmar cita ----------
document.getElementById("confirmBtn").addEventListener("click", async () => {
  const msg = document.getElementById("bookingMsg");
  msg.textContent = "";
  msg.className = "form-msg";

  const full_name = document.getElementById("clientName").value.trim();
  const phone = document.getElementById("clientPhone").value.trim();
  const email = document.getElementById("clientEmail").value.trim();
  const address = document.getElementById("clientAddress").value.trim();
  const notes = document.getElementById("clientNotes").value.trim();

  if (!full_name || !phone || !address) {
    msg.textContent = "Completa nombre, teléfono y dirección.";
    msg.classList.add("err");
    return;
  }
  if (!selectedDate || !selectedTime) {
    msg.textContent = "Elige un día y un horario disponibles.";
    msg.classList.add("err");
    return;
  }

  const confirmBtn = document.getElementById("confirmBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Agendando…";

  try {
    // Generamos el ID en el navegador: así no necesitamos leer de vuelta el
    // registro del cliente (por seguridad, esa tabla solo la puede leer el admin).
    const clientId = crypto.randomUUID();
    const { error: clientErr } = await supabase.from("clients").insert({
      id: clientId,
      full_name,
      phone,
      email: email || null,
      address,
      notes: notes || null,
      referred_by: referrerId || null,
    });
    if (clientErr) throw clientErr;

    const { error: apptErr } = await supabase.from("appointments").insert({
      client_id: clientId,
      service_id: selectedService,
      scheduled_date: selectedDate,
      scheduled_time: selectedTime,
      status: "pendiente",
    });

    if (apptErr) {
      if (apptErr.code === "23505") {
        msg.textContent = "Ese horario se acaba de ocupar. Elige otro, por favor.";
        msg.classList.add("err");
        await loadAvailability();
        renderDayGrid();
        renderSlotGrid();
        return;
      }
      throw apptErr;
    }

    newClientId = clientId;
    msg.textContent = "¡Cita agendada! Te contactaremos por WhatsApp para confirmar.";
    msg.classList.add("ok");

    // Aviso al admin por WhatsApp — best effort, nunca bloquea ni rompe la confirmación al cliente.
    supabase.functions
      .invoke("notify-booking", {
        body: {
          full_name,
          phone,
          address,
          service_id: selectedService,
          scheduled_date: selectedDate,
          scheduled_time: selectedTime,
          notes,
        },
      })
      .catch((e) => console.error("No se pudo enviar el aviso de WhatsApp:", e));

    ["clientName", "clientPhone", "clientEmail", "clientAddress", "clientNotes"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    await loadAvailability();
    renderDayGrid();
    renderSlotGrid();
    setupDigitalCard(); // ahora con enlace de referido personalizado
  } catch (err) {
    console.error(err);
    msg.textContent = "No se pudo agendar la cita. Intenta de nuevo.";
    msg.classList.add("err");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirmar cita";
  }
});

// ---------- Tarjeta digital ----------
async function setupDigitalCard() {
  const baseUrl = location.origin + location.pathname;
  const url = newClientId ? `${baseUrl}?ref=${newClientId}` : baseUrl;

  document.getElementById("cardUrl").textContent = url.replace(/^https?:\/\//, "");

  const qrBox = document.getElementById("qrBox");
  qrBox.innerHTML = "";
  const canvas = document.createElement("canvas");
  qrBox.appendChild(canvas);
  try {
    await QRCode.toCanvas(canvas, url, { width: 118, margin: 0, color: { dark: "#16224F", light: "#FBF9F4" } });
  } catch (e) {
    console.error("Error generando QR:", e);
  }
}
document.getElementById("copyBtn").addEventListener("click", () => {
  const url = location.origin + location.pathname + (newClientId ? `?ref=${newClientId}` : "");
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById("copyBtn");
    const old = btn.textContent;
    btn.textContent = "¡Copiado!";
    setTimeout(() => (btn.textContent = old), 1500);
  });
});

// ---------- Reseñas ----------
async function loadReviews() {
  const { data, error } = await supabase
    .from("public_reviews")
    .select("client_name, rating, comment, created_at");
  const grid = document.getElementById("reviewsGrid");
  grid.innerHTML = "";
  if (error) {
    console.error("Error cargando reseñas:", error);
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML = '<div class="empty-state">Aún no hay reseñas publicadas.</div>';
    return;
  }
  data.forEach((r) => {
    const div = document.createElement("div");
    div.className = "testi";
    div.innerHTML = `
      <div class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
      <p>${escapeHtml(r.comment || "")}</p>
      <div class="testi-author">${escapeHtml(r.client_name)}</div>
    `;
    grid.appendChild(div);
  });

  if (data.length > 0) {
    const avg = (data.reduce((sum, r) => sum + r.rating, 0) / data.length).toFixed(1);
    const trust = document.getElementById("trustLine");
    trust.innerHTML = `<span class="stars">★</span> <strong>${avg}</strong> · ${data.length} reseña${data.length === 1 ? "" : "s"} de clientes`;
    trust.style.display = "flex";
  }
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let pickedRating = 0;
document.getElementById("starPicker").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-star]");
  if (!btn) return;
  pickedRating = Number(btn.dataset.star);
  document.querySelectorAll("[data-star]").forEach((s) => {
    s.classList.toggle("active", Number(s.dataset.star) <= pickedRating);
  });
});
document.getElementById("submitReviewBtn").addEventListener("click", async () => {
  const msg = document.getElementById("reviewMsg");
  msg.textContent = "";
  msg.className = "form-msg";
  const client_name = document.getElementById("reviewName").value.trim();
  const comment = document.getElementById("reviewComment").value.trim();

  if (!client_name || pickedRating === 0) {
    msg.textContent = "Escribe tu nombre y elige una calificación.";
    msg.classList.add("err");
    return;
  }
  const { error } = await supabase.from("reviews").insert({
    client_name,
    rating: pickedRating,
    comment: comment || null,
    approved: false,
  });
  if (error) {
    console.error(error);
    msg.textContent = "No se pudo enviar tu reseña. Intenta de nuevo.";
    msg.classList.add("err");
    return;
  }
  msg.textContent = "¡Gracias! Tu reseña se publicará luego de ser revisada.";
  msg.classList.add("ok");
  document.getElementById("reviewName").value = "";
  document.getElementById("reviewComment").value = "";
  pickedRating = 0;
  document.querySelectorAll("[data-star]").forEach((s) => s.classList.remove("active"));
});

// ---------- Inicio ----------
(async function init() {
  if (!isConfigured) {
    document.getElementById("dayGrid").innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;">La agenda todavía no está conectada. Vuelve a intentar en unos minutos o contáctanos directamente.</div>';
    document.getElementById("confirmBtn").disabled = true;
    document.getElementById("reviewsGrid").innerHTML =
      '<div class="empty-state">Aún no hay reseñas publicadas.</div>';
    document.getElementById("cardUrl").textContent = location.origin + location.pathname;
    return;
  }
  await loadAvailability();
  renderDayGrid();
  renderSlotGrid();
  setupDigitalCard();
  loadReviews();
})();
