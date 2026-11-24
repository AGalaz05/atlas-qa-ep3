
const http = require("http");

const HOST = "127.0.0.1";
const PORT = 4000;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };

    if (data) {
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const inicio = performance.now();

    const req = http.request(
      { hostname: HOST, port: PORT, path, method, headers },
      (res) => {
        let raw = "";

        res.on("data", (chunk) => (raw += chunk));

        res.on("end", () => {
          const ms = performance.now() - inicio;
          let json = null;

          try {
            json = JSON.parse(raw);
          } catch {}

          resolve({
            status: res.statusCode,
            body: json,
            ms: parseFloat(ms.toFixed(2))
          });
        });
      }
    );

    req.setTimeout(10000, () => {
      req.destroy(new Error("Tiempo de espera agotado"));
    });

    req.on("error", reject);

    if (data) req.write(data);

    req.end();
  });
}

async function ejecutarPruebas() {
  let aprobados = 0;
  let fallidos = 0;

  function verificar(id, nombre, ok, detalle) {
    if (ok) {
      console.log(`[PASS] ${id} | ${nombre} -> ${detalle}`);
      aprobados++;
    } else {
      console.log(`[FAIL] ${id} | ${nombre} -> ${detalle}`);
      fallidos++;
    }
  }

  console.log(
    "=== SUITE AUTOMATIZADA DE SEGURIDAD, RBAC Y RENDIMIENTO (EP3) ===\n"
  );

  // CP-20.2: Login invalido
  const r1 = await request("POST", "/autenticacion/login", {
    nombre_usuario: "admin",
    password: "incorrecta"
  });

  verificar(
    "CP-20.2",
    "Login invalido rechazado",
    r1.status === 401,
    `HTTP ${r1.status}`
  );

  // CP-20.1: Login valido Admin
  const r2 = await request("POST", "/autenticacion/login", {
    nombre_usuario: "admin",
    password: "admin"
  });

  const tokenAdmin = r2.body?.token;

  verificar(
    "CP-20.1",
    "Login valido Admin",
    r2.status === 200 && Boolean(tokenAdmin),
    `HTTP ${r2.status} en ${r2.ms} ms`
  );

  // CP-11.1: Rendimiento del login
  verificar(
    "CP-11.1",
    "Sin retardo artificial 4s en Login",
    r2.status === 200 && r2.ms < 500,
    `${r2.ms} ms | Limite: 500 ms`
  );

  // CP-20.3: Login valido Editor
  const r3 = await request("POST", "/autenticacion/login", {
    nombre_usuario: "editor",
    password: "editor"
  });

  const tokenEditor = r3.body?.token;

  verificar(
    "CP-20.3",
    "Login valido Editor",
    r3.status === 200 && Boolean(tokenEditor),
    `HTTP ${r3.status}`
  );

  // CP-27: Control de permisos RBAC
  const r4 = await request(
    "POST",
    "/clientes",
    {
      nombre: "Cliente Test RBAC",
      correo: "test@atlas.cl"
    },
    tokenEditor
  );

  verificar(
    "CP-27",
    "Bloqueo escritura Rol Editor (INC-01)",
    Boolean(tokenEditor) && r4.status === 403,
    `HTTP ${r4.status} | Esperado: 403`
  );

  // CP-02: Proteccion de descarga PDF
  const r5 = await request("GET", "/contratos/1/file");

  verificar(
    "CP-02",
    "Bloqueo descarga PDF sin token (INC-02)",
    r5.status === 401,
    `HTTP ${r5.status} | Esperado: 401`
  );

  // CP-SEG-01: Comprobacion inicial de SQL Injection
  const payloadSql = encodeURIComponent("' OR '1'='1");

  const r6 = await request(
    "GET",
    `/clientes/search?name=${payloadSql}`,
    null,
    tokenAdmin
  );

  verificar(
    "CP-SEG-01",
    "Respuesta ante entrada SQL sospechosa",
    Boolean(tokenAdmin) && r6.status === 200,
    `HTTP ${r6.status} | Validacion preliminar`
  );

  // CP-22: Prueba de carga concurrente
  const inicioCarga = performance.now();

  const lote = Array.from(
    { length: 50 },
    () => request("GET", "/clientes", null, tokenAdmin)
  );

  const resultadosCarga = await Promise.all(lote);

  const totalMs = (
    performance.now() - inicioCarga
  ).toFixed(2);

  const promedioMs = (
    resultadosCarga.reduce((suma, r) => suma + r.ms, 0) /
    resultadosCarga.length
  ).toFixed(2);

  const todos200 = resultadosCarga.every(
    (r) => r.status === 200
  );

  const exitosas = resultadosCarga.filter(
    (r) => r.status === 200
  ).length;

  verificar(
    "CP-22",
    "Carga 50 peticiones concurrentes GET /clientes",
    Boolean(tokenAdmin) &&
      todos200 &&
      Number(promedioMs) < 300,
    `${exitosas}/50 HTTP 200 | Promedio: ${promedioMs} ms | Total: ${totalMs} ms`
  );

  // Resumen de resultados
  console.log("\n========================================");
  console.log("RESUMEN DE EJECUCION");
  console.log(`Total: ${aprobados + fallidos}`);
  console.log(`Aprobados: ${aprobados}`);
  console.log(`Fallidos: ${fallidos}`);
  console.log("========================================");

  console.log(
    `\nRESUMEN FINAL: ${aprobados} APROBADOS | ${fallidos} FALLIDOS`
  );

  // GitHub Actions falla si alguna prueba no es aprobada
  process.exitCode = fallidos > 0 ? 1 : 0;
}

ejecutarPruebas().catch((error) => {
  console.error("ERROR EN LA EJECUCION:", error);
  process.exitCode = 1;
});
