// URL unica del backend. Ya no depende de config.js.
const APPS_SCRIPT_URL = window.CONFIG.API_URL;

window.API = {
  async request(action, payload = {}) {
    if (!APPS_SCRIPT_URL) throw new Error("Configura la URL de implementación en js/config.js.");
    const r = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload, token: sessionStorage.getItem("presupuesto_token") || "" })
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
  validarAcceso(password) {
    return this.request("validarAcceso", { password });
  },
  guardar(tipo, movimiento) {
    return this.request("guardarMovimiento", { tipo, movimiento });
  }
};
