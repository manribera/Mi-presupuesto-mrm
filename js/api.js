window.API = {
  async request(action, payload = {}) {
    if (!window.CONFIG || !window.CONFIG.API_URL || window.CONFIG.API_URL.includes("PEGAR_AQUI")) {
      throw new Error("Configura la URL de Apps Script en js/config.js");
    }
    const r = await fetch(window.CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    });
    if (!r.ok) throw new Error("No fue posible conectar con Google Sheets");
    const data = await r.json();
    if (!data.ok) throw new Error(data.message || "Ocurrió un error");
    return data;
  },
  resumen(mes) {
    return this.request("obtenerResumen", { mes });
  },
  anual(anio) {
    return this.request("obtenerBalanceAnual", { anio });
  },
  historico(tipo, anio, mes) {
    return this.request("obtenerHistorico", { tipo, anio, mes });
  },
  ingresoGeneral() {
    return this.request("obtenerIngresoGeneral");
  },
  guardarIngresoGeneral(registro) {
    return this.request("guardarIngresoGeneral", { registro });
  },
  validarAcceso(password) {
    return this.request("validarAcceso", { password });
  },
  guardar(tipo, movimiento) {
    return this.request("guardarMovimiento", { tipo, movimiento });
  }
};
