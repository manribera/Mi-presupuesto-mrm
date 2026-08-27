const state = {
  month: new Date().toISOString().slice(0, 7),
  year: new Date().getFullYear(),
  summary: null,
  general: null
};

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(Number(n || 0));
const esc = s => String(s ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  $("periodoMes").value = state.month;
  $("todayLabel").textContent = now.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  fillYears();
  bind();
  initAccess();
});

function bind() {
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  document.querySelectorAll(".add-btn").forEach(b => b.addEventListener("click", () => openModal(b.dataset.type)));
  $("periodoMes").addEventListener("change", e => { state.month = e.target.value; loadSummary(); });
  $("yearSelect").addEventListener("change", e => { state.year = +e.target.value; loadAnnual(); });
  $("refreshBtn").onclick = refreshActiveView;
  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");
  $("modalClose").onclick = closeModal;
  $("overlay").onclick = closeAllModals;
  $("movementForm").addEventListener("submit", saveMovement);
  $("loginForm").addEventListener("submit", validatePassword);
}

function initAccess() {
  if (sessionStorage.getItem("presupuesto_access") === "ok") unlockApp();
}

async function validatePassword(e) {
  e.preventDefault();
  const btn = $("loginForm").querySelector("button");
  btn.disabled = true;
  btn.textContent = "Validando...";
  try {
    const result = await API.validarAcceso($("passwordInput").value);
    if (!result.accesoActivo) {
      toast("El acceso está apagado desde Google Sheets", true);
      return;
    }
    if (!result.autorizado) {
      toast("Contraseña incorrecta", true);
      $("passwordInput").value = "";
      $("passwordInput").focus();
      return;
    }
    sessionStorage.setItem("presupuesto_access", "ok");
    unlockApp();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar al dashboard";
  }
}

function unlockApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("locked");
  loadSummary();
}

function fillYears() {
  const s = $("yearSelect");
  for (let y = new Date().getFullYear() + 1; y >= 2020; y--) s.add(new Option(y, y, y === state.year, y === state.year));
}

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(name + "View").classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  const titles = { dashboard: "Resumen financiero", transferencias: "Transferencias varias", ingresos: "Ingresos", servicios: "Servicios", casa: "Pagos de casa", ahorros: "Ahorros", anual: "Balance anual" };
  $("pageTitle").textContent = titles[name];
  $("sidebar").classList.remove("open");
  if (name === "anual") loadAnnual();
  else if (!state.summary) loadSummary();
}

function refreshActiveView() {
  const id = document.querySelector(".view.active").id;
  if (id === "anualView") loadAnnual();
  else loadSummary();
}

async function loadSummary() {
  loading(true);
  try {
    const data = await API.resumen(state.month);
    state.summary = data;
    paintSummary(data);
  } catch (e) {
    toast(e.message, true);
    paintEmpty();
  } finally {
    loading(false);
  }
}

function paintSummary(d) {
  const t = d.totales;
  setText("kpiIngresos", money(t.ingresos));
  setText("kpiAhorros", money(t.ahorros));
  setText("kpiServicios", money(t.servicios));
  setText("kpiCasa", money(t.pagosCasa));
  setText("kpiTransferencias", money(t.transferencias));
  setText("heroBalance", money(t.remanente));
  $("heroBalance").className = t.remanente >= 0 ? "positive" : "negative-text";
  $("heroMessage").textContent = t.remanente >= 0 ? "El mes mantiene un remanente positivo." : "Los gastos y ahorros superan los ingresos del mes.";
  $("dashboardView").querySelector(".hero").classList.toggle("negative", t.remanente < 0);
  setText("kpiIngresosCount", plural(d.movimientos.INGRESOS.length));
  setText("kpiAhorrosCount", plural(d.movimientos.AHORROS.length));
  setText("kpiServiciosCount", plural(d.movimientos.SERVICIOS.length));
  setText("kpiCasaCount", plural(d.movimientos.PAGOS_CASA.length));
  setText("kpiTransferenciasCount", plural(d.movimientos.TRANSFERENCIAS.length));
  paintDistribution(t);
  paintRecent(d.recientes);
  paintSection("ingresos", d.movimientos.INGRESOS, t.ingresos);
  paintSection("servicios", d.movimientos.SERVICIOS, t.servicios);
  paintSection("casa", d.movimientos.PAGOS_CASA, t.pagosCasa);
  paintSection("ahorros", d.movimientos.AHORROS, t.ahorros);
  paintSection("transferencias", d.movimientos.TRANSFERENCIAS, t.transferencias);
}

function paintDistribution(t) {
  const total = t.ingresos || 0;
  const rows = [["Ahorros", t.ahorros, "#6c55c7"], ["Servicios", t.servicios, "#d99416"], ["Pagos de casa", t.pagosCasa, "#2868d8"], ["Transferencias", t.transferencias, "#0f8b8d"]];
  $("distribution").innerHTML = rows.map(x => {
    const p = total ? Math.min(x[1] / total * 100, 100) : 0;
    return '<div class="dist-item"><div class="dist-line"><span>' + x[0] + '</span><strong>' + money(x[1]) + ' · ' + p.toFixed(0) + '%</strong></div><div class="bar"><i style="width:' + p + '%;background:' + x[2] + '"></i></div></div>';
  }).join("");
}

function paintRecent(rows) {
  $("recentList").innerHTML = rows.length ? rows.map(r => '<div class="recent"><div class="recent-icon">' + (r.TIPO === "INGRESOS" ? "↗" : "↘") + '</div><div><strong>' + esc(r.CONCEPTO) + '</strong><span>' + labelType(r.TIPO) + ' · ' + esc(r.FECHA) + '</span></div><strong class="' + (r.TIPO === "INGRESOS" ? "positive" : "negative-text") + '">' + (r.TIPO === "INGRESOS" ? "+" : "-") + money(r.MONTO) + '</strong></div>').join("") : '<div class="empty">Aún no hay movimientos en este periodo.</div>';
}

function paintSection(prefix, rows, total) {
  $(prefix + "Summary").innerHTML = '<article><span>Total del periodo</span><strong>' + money(total) + '</strong><span>· ' + plural(rows.length) + '</span></article>';
  $(prefix + "Table").innerHTML = rows.length ? '<table class="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Periodo</th><th>Método</th><th>Monto</th><th>Observaciones</th></tr></thead><tbody>' + rows.map(r => '<tr><td>' + esc(r.FECHA) + '</td><td><strong>' + esc(r.CONCEPTO) + '</strong></td><td>' + esc(r.FRECUENCIA) + '</td><td>' + esc(r.METODO) + '</td><td class="amount">' + money(r.MONTO) + '</td><td>' + esc(r.OBSERVACIONES || "-") + '</td></tr>').join("") + '</tbody></table>' : '<div class="empty">No hay registros para el mes seleccionado.</div>';
}

async function loadGeneral() {
  loading(true);
  try {
    const d = await API.ingresoGeneral();
    state.general = d;
    paintGeneral(d);
  } catch (e) {
    toast(e.message, true);
  } finally {
    loading(false);
  }
}

function paintGeneral(d) {
  const rows = d.registros || [];
  setText("generalActual", money(d.totales.actual));
  setText("generalAumento", money(d.totales.aumento));
  setText("generalPorcentaje", (d.totales.porcentaje || 0).toFixed(2) + "%");
  $("generalPorcentaje").className = d.totales.porcentaje >= 0 ? "positive" : "negative-text";
  $("generalTable").innerHTML = rows.length ? '<table class="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Anterior</th><th>Nuevo</th><th>Aumento</th><th>%</th><th>Observaciones</th></tr></thead><tbody>' + rows.map(r => '<tr><td>' + esc(r.FECHA) + '</td><td><strong>' + esc(r.CONCEPTO) + '</strong></td><td>' + money(r.MONTO_ANTERIOR) + '</td><td>' + money(r.MONTO_NUEVO) + '</td><td class="amount ' + (r.AUMENTO >= 0 ? "positive" : "negative-text") + '">' + money(r.AUMENTO) + '</td><td>' + Number(r.PORCENTAJE || 0).toFixed(2) + '%</td><td>' + esc(r.OBSERVACIONES || "-") + '</td></tr>').join("") + '</tbody></table>' : '<div class="empty">Aún no hay registros de ingreso general.</div>';
}

async function loadAnnual() {
  try {
    const d = await API.anual(state.year);
    setText("annualIncome", money(d.totales.ingresos));
    setText("annualOut", money(d.totales.egresos));
    setText("annualBalance", money(d.totales.remanente));
    $("annualBalanceCard").className = d.totales.remanente >= 0 ? "good" : "bad";
    paintAnnualChart(d.meses);
    paintAnnualTable(d.meses);
  } catch (e) {
    toast(e.message, true);
  }
}

function paintAnnualChart(rows) {
  const max = Math.max(1, ...rows.flatMap(r => [r.ingresos, r.egresos]));
  $("annualChart").innerHTML = rows.map(r => '<div class="chart-month" title="' + r.nombre + ': ingresos ' + money(r.ingresos) + ', egresos ' + money(r.egresos) + '"><div class="columns"><i class="in" style="height:' + (r.ingresos / max * 100) + '%"></i><i class="out" style="height:' + (r.egresos / max * 100) + '%"></i></div><span>' + r.nombre.slice(0, 3) + '</span></div>').join("");
}

function paintAnnualTable(rows) {
  $("annualTable").innerHTML = '<table class="data-table"><thead><tr><th>Mes</th><th>Ingresos</th><th>Ahorros</th><th>Servicios</th><th>Pagos de casa</th><th>Transferencias</th><th>Remanente</th></tr></thead><tbody>' + rows.map(r => '<tr><td><strong>' + r.nombre + '</strong></td><td>' + money(r.ingresos) + '</td><td>' + money(r.ahorros) + '</td><td>' + money(r.servicios) + '</td><td>' + money(r.pagosCasa) + '</td><td>' + money(r.transferencias) + '</td><td class="amount ' + (r.remanente >= 0 ? "positive" : "negative-text") + '">' + money(r.remanente) + '</td></tr>').join("") + '</tbody></table>';
}

function openModal(type) {
  const titles = { INGRESOS: "Registrar ingreso", SERVICIOS: "Registrar servicio", PAGOS_CASA: "Registrar pago de casa", AHORROS: "Registrar ahorro", TRANSFERENCIAS: "Registrar transferencia enviada" };
  $("movementForm").reset();
  $("movementType").value = type;
  $("movementDate").value = new Date().toISOString().slice(0, 10);
  $("modalTitle").textContent = titles[type];
  const periods = {
    INGRESOS: [["QUINCENAL","Quincenal"],["EXTRAORDINARIO","Extraordinario"]],
    SERVICIOS: [["MENSUAL","Mensual"]],
    PAGOS_CASA: [["MENSUAL","Mensual"],["QUINCENAL","Quincenal"],["EXTRAORDINARIO","Extraordinario"]],
    AHORROS: [["QUINCENAL","Quincenal"],["MENSUAL","Mensual"],["EXTRAORDINARIO","Extraordinario"]],
    TRANSFERENCIAS: [["OCASIONAL","Ocasional"],["MENSUAL","Mensual"]]
  };
  $("movementFrequency").innerHTML = periods[type].map(x => `<option value="${x[0]}">${x[1]}</option>`).join("");
  const categories = {
    INGRESOS: ["SALARIO ORDINARIO","FERIADOS","SALARIO ESCOLAR","AGUINALDO","SERVICIOS PROFESIONALES","OTRO INGRESO EXTRA"],
    SERVICIOS: ["AGUA","ELECTRICIDAD","INTERNET","TELÉFONO","OTRO SERVICIO"],
    PAGOS_CASA: ["ALQUILER","ALIMENTACIÓN","PRÉSTAMO","MANTENIMIENTO","OTRO PAGO DE CASA"],
    AHORROS: ["AHORRO REGULAR","EMERGENCIA","META","INVERSIÓN"],
    TRANSFERENCIAS: ["TRANSFERENCIA BANCARIA","SINPE MÓVIL","OTRA TRANSFERENCIA"]
  };
  $("movementCategory").innerHTML = categories[type].map(x => `<option value="${x}">${x}</option>`).join("");
  $("destinationField").hidden = type !== "TRANSFERENCIAS";
  $("movementDestination").required = type === "TRANSFERENCIAS";
  $("modal").classList.add("open");
  $("overlay").classList.add("open");
  $("modal").setAttribute("aria-hidden", "false");
}

function openGeneralModal() {
  $("generalForm").reset();
  $("generalDate").value = new Date().toISOString().slice(0, 10);
  const latest = state.general && state.general.totales ? state.general.totales.actual : 0;
  if (latest) $("generalBefore").value = latest;
  $("generalModal").classList.add("open");
  $("overlay").classList.add("open");
  $("generalModal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("modal").classList.remove("open");
  $("modal").setAttribute("aria-hidden", "true");
  $("overlay").classList.remove("open");
}

function closeGeneralModal() {
  $("generalModal").classList.remove("open");
  $("generalModal").setAttribute("aria-hidden", "true");
  if (!$("modal").classList.contains("open")) $("overlay").classList.remove("open");
}

function closeAllModals() {
  closeModal();
}

async function saveMovement(e) {
  e.preventDefault();
  const btn = $("saveMovement");
  btn.disabled = true;
  btn.textContent = "Guardando...";
  try {
    await API.guardar($("movementType").value, {
      fecha: $("movementDate").value,
      concepto: $("movementConcept").value,
      monto: Number($("movementAmount").value),
      frecuencia: $("movementFrequency").value,
      metodo: $("movementMethod").value,
      observaciones: $("movementNotes").value
      ,categoria: $("movementCategory").value
      ,destinatario: $("movementDestination").value
    });
    closeModal();
    state.month = $("movementDate").value.slice(0, 7);
    $("periodoMes").value = state.month;
    await loadSummary();
    toast("Movimiento guardado correctamente");
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar movimiento";
  }
}

async function saveGeneral(e) {
  e.preventDefault();
  const btn = $("saveGeneral");
  btn.disabled = true;
  btn.textContent = "Guardando...";
  try {
    await API.guardarIngresoGeneral({
      fecha: $("generalDate").value,
      concepto: $("generalConcept").value,
      montoAnterior: Number($("generalBefore").value),
      montoNuevo: Number($("generalAfter").value),
      observaciones: $("generalNotes").value
    });
    closeGeneralModal();
    await loadGeneral();
    toast("Ingreso general guardado correctamente");
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar ingreso general";
  }
}

function labelType(t) {
  return ({ INGRESOS: "Ingreso", AHORROS: "Ahorro", SERVICIOS: "Servicio", PAGOS_CASA: "Pago de casa", TRANSFERENCIAS: "Transferencia enviada" })[t] || t;
}

function plural(n) {
  return n + " " + (n === 1 ? "registro" : "registros");
}

function setText(id, v) {
  $(id).textContent = v;
}

function loading(on) {
  $("refreshBtn").disabled = on;
  $("refreshBtn").textContent = on ? "Actualizando..." : "↻ Actualizar";
}

function toast(msg, error = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (error ? " error" : "");
  setTimeout(() => t.className = "toast", 3500);
}

function paintEmpty() {
  ["recentList", "distribution"].forEach(id => $(id).innerHTML = '<div class="empty">No fue posible cargar los datos.</div>');
}
