const state = {
  month: new Date().toISOString().slice(0, 7),
  year: new Date().getFullYear(),
  summary: null,
  general: null
};

const $ = id => document.getElementById(id);

const money = n =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0
  }).format(Number(n || 0));

const esc = s =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[c]
  );

document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();

  $("periodoMes").value = state.month;

  $("todayLabel").textContent = now.toLocaleDateString(
    "es-CR",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  );

  fillYears();
  bind();
  initAccess();
});

function bind() {
  document
    .querySelectorAll("[data-view]")
    .forEach(button =>
      button.addEventListener("click", () =>
        showView(button.dataset.view)
      )
    );

  document
    .querySelectorAll(".add-btn")
    .forEach(button =>
      button.addEventListener("click", () =>
        openModal(button.dataset.type)
      )
    );

  $("periodoMes").addEventListener("change", event => {
    state.month = event.target.value;
    loadSummary();
  });

  $("yearSelect").addEventListener("change", event => {
    state.year = Number(event.target.value);
    loadAnnual();
  });

  $("refreshBtn").onclick = refreshActiveView;

  $("menuBtn").onclick = () =>
    $("sidebar").classList.toggle("open");

  $("modalClose").onclick = closeModal;
  $("overlay").onclick = closeAllModals;

  $("movementForm").addEventListener(
    "submit",
    saveMovement
  );


  $("loginForm").addEventListener(
    "submit",
    validatePassword
  );
}

function initAccess() {
  if (
    sessionStorage.getItem("presupuesto_access") ===
    "ok"
  ) {
    unlockApp();
  }
}

async function validatePassword(event) {
  event.preventDefault();

  const button =
    $("loginForm").querySelector("button");

  button.disabled = true;
  button.textContent = "Validando...";

  try {
    const result = await API.validarAcceso(
      $("passwordInput").value
    );

    if (!result.accesoActivo) {
      toast(
        "El acceso está apagado desde Google Sheets",
        true
      );
      return;
    }

    if (!result.autorizado) {
      toast("Contraseña incorrecta", true);

      $("passwordInput").value = "";
      $("passwordInput").focus();

      return;
    }

    sessionStorage.setItem(
      "presupuesto_access",
      "ok"
    );

    unlockApp();

  } catch (error) {
    toast(error.message, true);

  } finally {
    button.disabled = false;
    button.textContent = "Entrar al dashboard";
  }
}

function unlockApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("locked");

  loadSummary();
}

function fillYears() {
  const select = $("yearSelect");

  for (
    let year = new Date().getFullYear() + 1;
    year >= 2020;
    year--
  ) {
    select.add(
      new Option(
        year,
        year,
        year === state.year,
        year === state.year
      )
    );
  }
}

function showView(name) {
  document
    .querySelectorAll(".view")
    .forEach(view =>
      view.classList.remove("active")
    );

  $(name + "View").classList.add("active");

  document
    .querySelectorAll(".nav-btn")
    .forEach(button =>
      button.classList.toggle(
        "active",
        button.dataset.view === name
      )
    );

  const titles = {
    dashboard: "Resumen financiero",
    general: "Ingreso general",
    ingresos: "Ingresos",
    servicios: "Servicios",
    casa: "Pagos de casa",
    ahorros: "Ahorros",
    anual: "Balance anual"
  };

  $("pageTitle").textContent = titles[name];

  $("sidebar").classList.remove("open");

  if (name === "anual") {
    loadAnnual();

  } else if (name === "general") {
    loadGeneral();

  } else if (!state.summary) {
    loadSummary();
  }
}

function refreshActiveView() {
  const activeView =
    document.querySelector(".view.active").id;

  if (activeView === "anualView") {
    loadAnnual();

  } else if (activeView === "generalView") {
    loadGeneral();

  } else {
    loadSummary();
  }
}

async function loadSummary() {
  loading(true);

  try {
    const data = await API.resumen(state.month);

    state.summary = data;

    paintSummary(data);

  } catch (error) {
    toast(error.message, true);
    paintEmpty();

  } finally {
    loading(false);
  }
}

function paintSummary(data) {
  const totals = data.totales;

  setText(
    "kpiIngresos",
    money(totals.ingresos)
  );

  setText(
    "kpiAhorros",
    money(totals.ahorros)
  );

  setText(
    "kpiServicios",
    money(totals.servicios)
  );

  setText(
    "kpiCasa",
    money(totals.pagosCasa)
  );

  setText(
    "heroBalance",
    money(totals.remanente)
  );

  $("heroBalance").className =
    totals.remanente >= 0
      ? "positive"
      : "negative-text";

  $("heroMessage").textContent =
    totals.remanente >= 0
      ? "El mes mantiene un remanente positivo."
      : "Los gastos y ahorros superan los ingresos del mes.";

  $("dashboardView")
    .querySelector(".hero")
    .classList.toggle(
      "negative",
      totals.remanente < 0
    );

  setText(
    "kpiIngresosCount",
    plural(data.movimientos.INGRESOS.length)
  );

  setText(
    "kpiAhorrosCount",
    plural(data.movimientos.AHORROS.length)
  );

  setText(
    "kpiServiciosCount",
    plural(data.movimientos.SERVICIOS.length)
  );

  setText(
    "kpiCasaCount",
    plural(data.movimientos.PAGOS_CASA.length)
  );

  paintDistribution(totals);
  paintRecent(data.recientes);

  paintSection(
    "ingresos",
    data.movimientos.INGRESOS,
    totals.ingresos
  );

  paintSection(
    "servicios",
    data.movimientos.SERVICIOS,
    totals.servicios
  );

  paintSection(
    "casa",
    data.movimientos.PAGOS_CASA,
    totals.pagosCasa
  );

  paintSection(
    "ahorros",
    data.movimientos.AHORROS,
    totals.ahorros
  );
}

function paintDistribution(totals) {
  const totalIncome = totals.ingresos || 0;

  const rows = [
    [
      "Ahorros",
      totals.ahorros,
      "#6c55c7"
    ],
    [
      "Servicios",
      totals.servicios,
      "#d99416"
    ],
    [
      "Pagos de casa",
      totals.pagosCasa,
      "#2868d8"
    ]
  ];

  $("distribution").innerHTML = rows
    .map(row => {
      const percentage = totalIncome
        ? Math.min(
            (row[1] / totalIncome) * 100,
            100
          )
        : 0;

      return `
        <div class="dist-item">
          <div class="dist-line">
            <span>${row[0]}</span>

            <strong>
              ${money(row[1])} ·
              ${percentage.toFixed(0)}%
            </strong>
          </div>

          <div class="bar">
            <i
              style="
                width:${percentage}%;
                background:${row[2]}
              "
            ></i>
          </div>
        </div>
      `;
    })
    .join("");
}

function paintRecent(rows) {
  if (!rows.length) {
    $("recentList").innerHTML = `
      <div class="empty">
        Aún no hay movimientos en este periodo.
      </div>
    `;

    return;
  }

  $("recentList").innerHTML = rows
    .map(row => {
      const isIncome =
        row.TIPO === "INGRESOS";

      return `
        <div class="recent">
          <div class="recent-icon">
            ${isIncome ? "↗" : "↘"}
          </div>

          <div>
            <strong>
              ${esc(row.CONCEPTO)}
            </strong>

            <span>
              ${labelType(row.TIPO)}
              ·
              ${esc(row.FECHA)}
            </span>
          </div>

          <strong
            class="${
              isIncome
                ? "positive"
                : "negative-text"
            }"
          >
            ${isIncome ? "+" : "-"}
            ${money(row.MONTO)}
          </strong>
        </div>
      `;
    })
    .join("");
}

function paintSection(prefix, rows, total) {
  $(prefix + "Summary").innerHTML = `
    <article>
      <span>Total del periodo</span>

      <strong>
        ${money(total)}
      </strong>

      <span>
        · ${plural(rows.length)}
      </span>
    </article>
  `;

  if (!rows.length) {
    $(prefix + "Table").innerHTML = `
      <div class="empty">
        No hay registros para el mes seleccionado.
      </div>
    `;

    return;
  }

  $(prefix + "Table").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Concepto</th>
          <th>Periodo</th>
          <th>Método</th>
          <th>Monto</th>
          <th>Observaciones</th>
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>${esc(row.FECHA)}</td>

                <td>
                  <strong>
                    ${esc(row.CONCEPTO)}
                  </strong>
                </td>

                <td>
                  ${esc(row.FRECUENCIA)}
                </td>

                <td>
                  ${esc(row.METODO)}
                </td>

                <td class="amount">
                  ${money(row.MONTO)}
                </td>

                <td>
                  ${esc(row.OBSERVACIONES || "-")}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function loadGeneral() {
  loading(true);

  try {
    const data =
      await API.ingresoGeneral();

    state.general = data;

    paintGeneral(data);

  } catch (error) {
    toast(error.message, true);

  } finally {
    loading(false);
  }
}

function paintGeneral(data) {
  const rows = data.registros || [];

  setText(
    "generalActual",
    money(data.totales.actual)
  );

  setText(
    "generalAumento",
    money(data.totales.aumento)
  );

  setText(
    "generalPorcentaje",
    Number(
      data.totales.porcentaje || 0
    ).toFixed(2) + "%"
  );

  $("generalPorcentaje").className =
    data.totales.porcentaje >= 0
      ? "positive"
      : "negative-text";

  if (!rows.length) {
    $("generalTable").innerHTML = `
      <div class="empty">
        Aún no hay registros de ingreso general.
      </div>
    `;

    return;
  }

  $("generalTable").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Concepto</th>
          <th>Anterior</th>
          <th>Nuevo</th>
          <th>Aumento</th>
          <th>%</th>
          <th>Observaciones</th>
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>${esc(row.FECHA)}</td>

                <td>
                  <strong>
                    ${esc(row.CONCEPTO)}
                  </strong>
                </td>

                <td>
                  ${money(row.MONTO_ANTERIOR)}
                </td>

                <td>
                  ${money(row.MONTO_NUEVO)}
                </td>

                <td
                  class="
                    amount
                    ${
                      row.AUMENTO >= 0
                        ? "positive"
                        : "negative-text"
                    }
                  "
                >
                  ${money(row.AUMENTO)}
                </td>

                <td>
                  ${Number(
                    row.PORCENTAJE || 0
                  ).toFixed(2)}%
                </td>

                <td>
                  ${esc(row.OBSERVACIONES || "-")}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function loadAnnual() {
  try {
    const data =
      await API.anual(state.year);

    setText(
      "annualIncome",
      money(data.totales.ingresos)
    );

    setText(
      "annualOut",
      money(data.totales.egresos)
    );

    setText(
      "annualBalance",
      money(data.totales.remanente)
    );

    $("annualBalanceCard").className =
      data.totales.remanente >= 0
        ? "good"
        : "bad";

    paintAnnualChart(data.meses);
    paintAnnualTable(data.meses);

  } catch (error) {
    toast(error.message, true);
  }
}

function paintAnnualChart(rows) {
  const maximum = Math.max(
    1,
    ...rows.flatMap(row => [
      row.ingresos,
      row.egresos
    ])
  );

  $("annualChart").innerHTML = rows
    .map(
      row => `
        <div
          class="chart-month"
          title="
            ${row.nombre}:
            ingresos ${money(row.ingresos)},
            egresos ${money(row.egresos)}
          "
        >
          <div class="columns">
            <i
              class="in"
              style="
                height:
                ${(row.ingresos / maximum) * 100}%
              "
            ></i>

            <i
              class="out"
              style="
                height:
                ${(row.egresos / maximum) * 100}%
              "
            ></i>
          </div>

          <span>
            ${row.nombre.slice(0, 3)}
          </span>
        </div>
      `
    )
    .join("");
}

function paintAnnualTable(rows) {
  $("annualTable").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Mes</th>
          <th>Ingresos</th>
          <th>Ahorros</th>
          <th>Servicios</th>
          <th>Pagos de casa</th>
          <th>Remanente</th>
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>
                  <strong>
                    ${row.nombre}
                  </strong>
                </td>

                <td>
                  ${money(row.ingresos)}
                </td>

                <td>
                  ${money(row.ahorros)}
                </td>

                <td>
                  ${money(row.servicios)}
                </td>

                <td>
                  ${money(row.pagosCasa)}
                </td>

                <td
                  class="
                    amount
                    ${
                      row.remanente >= 0
                        ? "positive"
                        : "negative-text"
                    }
                  "
                >
                  ${money(row.remanente)}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function openModal(type) {
  const titles = {
    INGRESOS: "Registrar ingreso",
    SERVICIOS: "Registrar servicio",
    PAGOS_CASA: "Registrar pago de casa",
    AHORROS: "Registrar ahorro"
  };

  $("movementForm").reset();

  $("movementType").value = type;

  $("movementDate").value = new Date()
    .toISOString()
    .slice(0, 10);

  $("modalTitle").textContent = titles[type];

  const periodOptions = {
    INGRESOS: [
      ["DIARIO", "Diario"],
      ["QUINCENAL", "Quincenal"],
      ["EXTRAORDINARIO", "Extraordinario"]
    ],

    SERVICIOS: [
      ["MENSUAL", "Mensual"]
    ],

    PAGOS_CASA: [
      ["MENSUAL", "Mensual"],
      ["QUINCENAL", "Quincenal"],
      ["EXTRAORDINARIO", "Extraordinario"]
    ],

    AHORROS: [
      ["QUINCENAL", "Quincenal"],
      ["MENSUAL", "Mensual"],
      ["EXTRAORDINARIO", "Extraordinario"]
    ]
  };

  $("movementFrequency").innerHTML =
    (periodOptions[type] || [])
      .map(
        ([value, label]) =>
          `<option value="${value}">
            ${label}
          </option>`
      )
      .join("");

  $("modal").classList.add("open");
  $("overlay").classList.add("open");

  $("modal").setAttribute(
    "aria-hidden",
    "false"
  );
}

function openGeneralModal() {
  $("generalForm").reset();

  $("generalDate").value = new Date()
    .toISOString()
    .slice(0, 10);

  const latest =
    state.general &&
    state.general.totales
      ? state.general.totales.actual
      : 0;

  if (latest) {
    $("generalBefore").value = latest;
  }

  $("generalModal").classList.add("open");
  $("overlay").classList.add("open");

  $("generalModal").setAttribute(
    "aria-hidden",
    "false"
  );
}

function closeModal() {
  $("modal").classList.remove("open");

  $("modal").setAttribute(
    "aria-hidden",
    "true"
  );

  if (
    !$("generalModal").classList.contains("open")
  ) {
    $("overlay").classList.remove("open");
  }
}

function closeGeneralModal() {
  $("generalModal").classList.remove("open");

  $("generalModal").setAttribute(
    "aria-hidden",
    "true"
  );

  if (
    !$("modal").classList.contains("open")
  ) {
    $("overlay").classList.remove("open");
  }
}

function closeAllModals() {
  closeModal();
  closeGeneralModal();
}

async function saveMovement(event) {
  event.preventDefault();

  const button = $("saveMovement");

  button.disabled = true;
  button.textContent = "Guardando...";

  try {
    await API.guardar(
      $("movementType").value,
      {
        fecha: $("movementDate").value,

        concepto:
          $("movementConcept").value,

        monto: Number(
          $("movementAmount").value
        ),

        frecuencia:
          $("movementFrequency").value,

        metodo:
          $("movementMethod").value,

        observaciones:
          $("movementNotes").value
      }
    );

    closeModal();

    state.month =
      $("movementDate").value.slice(0, 7);

    $("periodoMes").value = state.month;

    await loadSummary();

    toast(
      "Movimiento guardado correctamente"
    );

  } catch (error) {
    toast(error.message, true);

  } finally {
    button.disabled = false;
    button.textContent =
      "Guardar movimiento";
  }
}

async function saveGeneral(event) {
  event.preventDefault();

  const button = $("saveGeneral");

  button.disabled = true;
  button.textContent = "Guardando...";

  try {
    await API.guardarIngresoGeneral({
      fecha: $("generalDate").value,

      concepto:
        $("generalConcept").value,

      montoAnterior: Number(
        $("generalBefore").value
      ),

      montoNuevo: Number(
        $("generalAfter").value
      ),

      observaciones:
        $("generalNotes").value
    });

    closeGeneralModal();

    await loadGeneral();

    toast(
      "Ingreso general guardado correctamente"
    );

  } catch (error) {
    toast(error.message, true);

  } finally {
    button.disabled = false;

    button.textContent =
      "Guardar ingreso general";
  }
}

function labelType(type) {
  return (
    {
      INGRESOS: "Ingreso",
      AHORROS: "Ahorro",
      SERVICIOS: "Servicio",
      PAGOS_CASA: "Pago de casa"
    }[type] || type
  );
}

function plural(number) {
  return (
    number +
    " " +
    (
      number === 1
        ? "registro"
        : "registros"
    )
  );
}

function setText(id, value) {
  $(id).textContent = value;
}

function loading(active) {
  $("refreshBtn").disabled = active;

  $("refreshBtn").textContent =
    active
      ? "Actualizando..."
      : "↻ Actualizar";
}

function toast(message, error = false) {
  const element = $("toast");

  element.textContent = message;

  element.className =
    "toast show" +
    (error ? " error" : "");

  setTimeout(() => {
    element.className = "toast";
  }, 3500);
}

function paintEmpty() {
  ["recentList", "distribution"].forEach(
    id => {
      $(id).innerHTML = `
        <div class="empty">
          No fue posible cargar los datos.
        </div>
      `;
    }
  );
}
