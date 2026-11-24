const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { JWT_SECRET } = require("../middlewares/authMiddleware");

const router = express.Router();

function verificarPassword(password, guardado) {
  if (!guardado.includes(":")) {
    return password === guardado;
  }
  const [sal, hashOriginal] = guardado.split(":");
  const hashNuevo = crypto.scryptSync(password, sal, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hashOriginal, "hex"), Buffer.from(hashNuevo, "hex"));
}

router.post("/login", async (req, res) => {
  const { nombre_usuario, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT id, nombre_usuario, contrasena_hash FROM usuarios WHERE nombre_usuario = $1",
      [nombre_usuario]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = result.rows[0];
    if (!verificarPassword(password, user.contrasena_hash)) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const empresaUsuarioResult = await pool.query(
      `SELECT eu.id, eu.empresa_id, r.nombre AS rol 
       FROM empresa_usuarios eu 
       LEFT JOIN roles r ON eu.rol_id = r.id 
       WHERE eu.usuario_id = $1 
       ORDER BY eu.id DESC LIMIT 1`,
      [user.id]
    );

    const empresaUsuarioId = empresaUsuarioResult.rows[0]?.id || null;
    const empresaId = empresaUsuarioResult.rows[0]?.empresa_id || null;
    const rol = empresaUsuarioResult.rows[0]?.rol || "editor";

    const token = jwt.sign(
      {
        usuarioId: user.id,
        nombreUsuario: user.nombre_usuario,
        empresaUsuarioId,
        empresaId,
        rol
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [user.nombre_usuario, "LOGIN: usuario inició sesión"]
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en login", glosa: err.message || err.toString() });
  }
});

module.exports = router;