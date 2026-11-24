
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");

const { pool } = require("./db");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const clientRoutes = require("./routes/clients");
const contractRoutes = require("./routes/contracts");
const auditRoutes = require("./routes/audit");
const empresasRoutes = require("./routes/empresas");
const rolesRoutes = require("./routes/roles");
const empresaUsuariosRoutes = require("./routes/empresa_usuarios");
const metricasRoutes = require("./routes/metricas");

const app = express();

// ========================================
// CONTROLES DE SEGURIDAD - EP5
// ========================================

// Ocultar informacion del framework
app.disable("x-powered-by");

// Encabezados de seguridad
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

  res.setHeader("X-Frame-Options", "DENY");

  res.setHeader("Referrer-Policy", "no-referrer");

  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );

  // Evitar almacenamiento de informacion sensible
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private"
  );

  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // CSP compatible con Swagger
  const esSwagger =
    req.path === "/docs" ||
    req.path.startsWith("/docs/");

  if (esSwagger) {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join("; ")
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'none'"
      ].join("; ")
    );
  }

  next();
});

// Configuracion restrictiva de CORS
const origenesPermitidos = (
  process.env.CORS_ORIGINS ||
  "http://localhost:3350,http://127.0.0.1:3350,http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origenesPermitidos.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],
    credentials: false
  })
);

// Procesamiento de solicitudes
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// Directorio de documentos
const uploadsDir = path.join(
  __dirname,
  "..",
  "uploads",
  "contracts"
);

fs.mkdirSync(uploadsDir, { recursive: true });

// ========================================
// RUTAS DE LA API
// ========================================

app.use("/autenticacion", authRoutes);
app.use("/usuarios", userRoutes);
app.use("/clientes", clientRoutes);
app.use("/contratos", contractRoutes);
app.use("/auditoria", auditRoutes);
app.use("/empresas", empresasRoutes);
app.use("/roles", rolesRoutes);
app.use("/empresa-usuarios", empresaUsuariosRoutes);
app.use("/metricas", metricasRoutes);

// ========================================
// DOCUMENTACION SWAGGER
// ========================================

const openapi = require("./openapi.json");

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapi)
);

app.get("/openapi.json", (req, res) => {
  res.json(openapi);
});

// No se exponen documentos mediante express.static.
// Las descargas deben utilizar las rutas autenticadas
// del modulo de contratos.

// ========================================
// DISPONIBILIDAD DEL BACKEND
// ========================================

app.get("/", (req, res) => {
  res.json({
    name: "Atlas",
    status: "ok"
  });
});

// ========================================
// MANEJO CONTROLADO DE ERRORES
// ========================================

// Rutas inexistentes
app.use((req, res) => {
  res.status(404).json({
    error: "Recurso no encontrado"
  });
});

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  console.error("Error interno:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "Archivo demasiado grande"
    });
  }

  const status = err.status || err.statusCode;

  if (status === 413) {
    return res.status(413).json({
      error: "Solicitud demasiado grande"
    });
  }

  if (status === 400) {
    return res.status(400).json({
      error: "Solicitud invalida"
    });
  }

  if (status >= 400 && status < 500) {
    return res.status(status).json({
      error: "Solicitud rechazada"
    });
  }

  return res.status(500).json({
    error: "Error interno del servidor"
  });
});

// ========================================
// INICIO DEL SERVIDOR
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Atlas API escuchando en puerto ${PORT}`);
  console.log("Controles de seguridad EP5 habilitados");
});
