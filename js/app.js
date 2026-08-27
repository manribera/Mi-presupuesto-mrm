const state = {
  month: new Date().toISOString().slice(0, 7),
  year: new Date().getFullYear(),
  summary: null
};

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(Number(n || 0));
const esc = s => String(s ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  $("periodoMes").value = state.month;
  $("todayLabel").textContent = now.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  fillYears();
  setupGeneralBalanceCard();
  bind();
  setupHistoryFilters();
  initAccess();
});

function setupGeneralBalanceCard() {
  const container = document.querySelector(".annual-kpis");
  if (!container || $("generalBalanceCard")) return;
  const card = document.createElement("article");
  card.id = "generalBalanceCard";
  card.innerHTML = '<span>Disponible acumulado general</span><strong id="generalBalance">₡0</strong>';
  container.appendChild(card);
}

function bind() {
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  document.querySelectorAll(".add-btn").forEach(b => b.addEventListener("click", () => openModal(b.dataset.type)));
  $("periodoMes").addEventListener("change", e => { state.month = e.target.value; loadSummary(); });
  $("yearSelect").addEventListener("change", e => { state.year = +e.target.value; loadAnnual(); });
  $("refreshBtn").onclick = refreshActiveView;
  $("logoutBtn").onclick = logout;
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
    if (!window.API) throw new Error("No se pudo cargar js/api.js");
    const result = await window.API.validarAcceso($("passwordInput").value);
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

function logout() {
  sessionStorage.removeItem("presupuesto_access");
  $("passwordInput").value = "";
  $("sidebar").classList.remove("open");
  $("appShell").classList.add("locked");
  $("loginScreen").classList.remove("hidden");
  $("passwordInput").focus();
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
  else if (["ingresos","servicios","casa","transferencias","ahorros"].includes(name)) loadHistory(name);
  else if (!state.summary) loadSummary();
}

const historyTypes = { ingresos:"INGRESOS", servicios:"SERVICIOS", casa:"PAGOS_CASA", transferencias:"TRANSFERENCIAS", ahorros:"AHORROS" };

function setupHistoryFilters() {
  Object.keys(historyTypes).forEach(name => {
    const summary = $(name + "Summary");
    if (!summary || $(name + "HistoryFilters")) return;
    const wrap = document.createElement("div");
    wrap.id = name + "HistoryFilters";
    wrap.className = "history-filters";
    wrap.innerHTML = `<label>Año<select data-history-year="${name}"></select></label><label>Mes<select data-history-month="${name}"><option value="TODOS">Todos los meses</option>${["01","02","03","04","05","06","07","08","09","10","11","12"].map((m,i)=>`<option value="${m}">${["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][i]}</option>`).join("")}</select></label><button class="secondary" data-history-load="${name}">Aplicar filtro</button><div class="history-compare" id="${name}Compare"></div>`;
    summary.parentNode.insertBefore(wrap, summary);
    const year = wrap.querySelector("select[data-history-year]");
    for (let y = new Date().getFullYear(); y >= 2020; y--) year.add(new Option(y,y));
    wrap.querySelector("[data-history-month]").value = state.month.slice(5,7);
    wrap.querySelector("button").onclick = () => loadHistory(name);
  });
}

async function loadHistory(name) {
  const type = historyTypes[name];
  const year = document.querySelector(`[data-history-year="${name}"]`).value;
  const month = document.querySelector(`[data-history-month="${name}"]`).value;
  try {
    const current = await window.API.request("obtenerHistorico", {tipo:type, anio:year, mes:month});
    let previous = {total:0};
    if (month !== "TODOS") {
      const date = new Date(Number(year), Number(month)-2, 1);
      previous = await window.API.request("obtenerHistorico", {tipo:type, anio:date.getFullYear(), mes:String(date.getMonth()+1).padStart(2,"0")});
    }
    renderHistory(name, current, previous, month);
  } catch (e) { toast(e.message,true); }
}

function renderHistory(name, data, previous, month) {
  const difference = data.total - previous.total;
  const percent = previous.total ? difference / previous.total * 100 : 0;
  $(name + "Summary").innerHTML = `<article><span>Total del periodo</span><strong>${money(data.total)}</strong><span>${plural(data.cantidad)}</span></article>`;
  $(name + "Compare").innerHTML = month === "TODOS" ? "Histórico anual" : `<span>Frente al mes anterior</span><strong class="${difference >= 0 ? "positive" : "negative-text"}">${difference >= 0 ? "+" : ""}${money(difference)} · ${percent.toFixed(1)}%</strong>`;
  $(name + "Table").innerHTML = data.filas.length ? `<table class="data-table"><thead><tr><th>Fecha</th><th>Categoría</th><th>Concepto</th>${name === "transferencias" ? "<th>Destinatario</th>" : ""}<th>Periodo</th><th>Método</th><th>Monto</th><th>Observaciones</th></tr></thead><tbody>${data.filas.map(r=>`<tr><td>${esc(r.FECHA)}</td><td>${esc(r.CATEGORIA || "-")}</td><td><strong>${esc(r.CONCEPTO)}</strong></td>${name === "transferencias" ? `<td>${esc(r.DESTINATARIO || "-")}</td>` : ""}<td>${esc(r.FRECUENCIA || "-")}</td><td>${esc(r.METODO || "-")}</td><td class="amount">${money(r.MONTO)}</td><td>${esc(r.OBSERVACIONES || "-")}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">No hay registros para el periodo seleccionado.</div>';
}

function refreshActiveView() {
  const id = document.querySelector(".view.active").id;
  if (id === "anualView") loadAnnual();
  else loadSummary();
}

async function loadSummary() {
  loading(true);
  try {
    const data = await window.API.resumen(state.month);
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
  setText("monthlyAvailable", money(t.remanente));
  setText("totalAvailable", money(d.acumuladoGeneral.remanente));
  $("monthlyAvailable").className = t.remanente >= 0 ? "positive" : "negative-text";
  $("totalAvailable").className = d.acumuladoGeneral.remanente >= 0 ? "positive" : "negative-text";
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

async function loadAnnual() {
  try {
    const [d, servicios, casa, transferencias, ahorros] = await Promise.all([
      window.API.anual(state.year),
      window.API.request("obtenerHistorico",{tipo:"SERVICIOS",anio:state.year,mes:"TODOS"}),
      window.API.request("obtenerHistorico",{tipo:"PAGOS_CASA",anio:state.year,mes:"TODOS"}),
      window.API.request("obtenerHistorico",{tipo:"TRANSFERENCIAS",anio:state.year,mes:"TODOS"}),
      window.API.request("obtenerHistorico",{tipo:"AHORROS",anio:state.year,mes:"TODOS"})
    ]);
    setText("annualIncome", money(d.totales.ingresos));
    setText("annualOut", money(d.totales.egresos));
    setText("annualBalance", money(d.totales.remanente));
    setText("generalBalance", money(d.acumuladoGeneral.remanente));
    $("annualBalanceCard").className = d.totales.remanente >= 0 ? "good" : "bad";
    $("generalBalanceCard").className = d.acumuladoGeneral.remanente >= 0 ? "good" : "bad";
    paintAnnualChart(d.meses);
    paintAnnualTrend(d.meses);
    paintAnnualDistribution([servicios,casa,transferencias,ahorros]);
    paintAnnualTable(d.meses);
  } catch (e) {
    toast(e.message, true);
  }
}

function paintAnnualTrend(rows) {
  const max = Math.max(1,...rows.map(r=>Math.abs(r.remanente)));
  $("annualTrend").innerHTML = rows.map((r,i)=>`<div class="trend-item"><span>${r.nombre.slice(0,3)}</span><div class="trend-axis"><i class="${r.remanente >= 0 ? "up" : "down"}" style="height:${Math.max(4,Math.abs(r.remanente)/max*90)}%"></i></div><strong class="${r.remanente >= 0 ? "positive" : "negative-text"}">${money(r.remanente)}</strong></div>`).join("");
}

function paintAnnualDistribution(groups) {
  const labels = ["Servicios","Pagos de casa","Transferencias","Ahorros"];
  const colors = ["#d99416","#2868d8","#0f8b8d","#6c55c7"];
  const total = groups.reduce((s,g)=>s+g.total,0);
  $("annualDistribution").innerHTML = groups.map((g,i)=>{ const p=total ? g.total/total*100 : 0; return `<div class="dist-item"><div class="dist-line"><span>${labels[i]}</span><strong>${money(g.total)} · ${p.toFixed(1)}%</strong></div><div class="bar"><i style="width:${p}%;background:${colors[i]}"></i></div></div>`; }).join("");
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

function closeModal() {
  $("modal").classList.remove("open");
  $("modal").setAttribute("aria-hidden", "true");
  $("overlay").classList.remove("open");
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
    await window.API.guardar($("movementType").value, {
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
