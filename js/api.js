window.API = {
  API_URL: "API_URL: "https://script.google.com/macros/s/AKfycbwj3gUrdEgoviCw2MPaxgNPg0ZYYg_aDWE_LfcUNxaXsHCBejiAxg-f4yer7iAISuY/exec",

  async request(action, payload = {}) {
    const response = await fetch(this.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    if (!response.ok) {
      throw new Error(
        "No fue posible conectar con Google Sheets"
      );
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(
        data.message || "Ocurrió un error"
      );
    }

    return data;
  },

  resumen(mes) {
    return this.request("obtenerResumen", {
      mes
    });
  },

  anual(anio) {
    return this.request("obtenerBalanceAnual", {
      anio
    });
  },

  ingresoGeneral() {
    return this.request("obtenerIngresoGeneral");
  },

  guardarIngresoGeneral(registro) {
    return this.request("guardarIngresoGeneral", {
      registro
    });
  },

  validarAcceso(password) {
    return this.request("validarAcceso", {
      password
    });
  },

  guardar(tipo, movimiento) {
    return this.request("guardarMovimiento", {
      tipo,
      movimiento
    });
  }
};
