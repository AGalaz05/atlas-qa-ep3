const express = require("express");
const multer = require("multer");
const { pool } = require("../db");
const { verificarToken, soloAdministrador } = require("../middlewares/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const permitidos = ["application/pdf", "application/msword", "image/jpeg", "image/png"];
    cb(null, permitidos.includes(file.mimetype));
  }
});

router.post("/", verificarToken, soloAdministrador, upload.single("file"), async (req, res) => {
  const { cliente_id, titulo, descripcion = null, fecha_inicio, fecha_fin } = req.body;
  try {
    const contractInsert = await pool.query(
      "INSERT INTO contratos (cliente_id, titulo, descripcion, fecha_inicio, fecha_fin) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [Number(cliente_id), titulo, descripcion, fecha_inicio, fecha_fin]
    );

    if (req.file && req.file.buffer) {
      await pool.query(
        "INSERT INTO documentos_contrato (contract_id, document) VALUES ($1, $2)",
        [contractInsert.rows[0].id, req.file.buffer]
      );
    }

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [req.user.nombreUsuario || null, `CONTRATOS_CREAR: creó contrato ${titulo} para cliente ${cliente_id}`]
    );

    res.status(201).json(contractInsert.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear contrato", glosa: err.message });
  }
});

router.get("/", verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.titulo, c.descripcion, c.fecha_inicio, c.fecha_fin, c.created_at, cl.nombre AS cliente_nombre
       FROM contratos c
       INNER JOIN clientes cl ON cl.id = c.cliente_id
       WHERE cl.empresa_id = $1
       ORDER BY c.id DESC`,
      [req.user.empresaId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar contratos", glosa: err.message });
  }
});

router.get("/estados", verificarToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const hoyFormateado = new Date().toISOString().split("T")[0];
    const fecha30Dias = new Date();
    fecha30Dias.setDate(fecha30Dias.getDate() + 30);
    const fecha30DiasFormateada = fecha30Dias.toISOString().split("T")[0];

    const porVencer = await pool.query(
      `SELECT c.id, c.cliente_id, c.titulo, c.descripcion, c.fecha_inicio, c.fecha_fin, c.created_at
       FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id
       WHERE cl.empresa_id = $1 AND c.fecha_fin >= $2 AND c.fecha_fin <= $3
       ORDER BY c.fecha_fin ASC LIMIT 3`,
      [empresaId, hoyFormateado, fecha30DiasFormateada]
    );

    const vencidos = await pool.query(
      `SELECT c.id, c.cliente_id, c.titulo, c.descripcion, c.fecha_inicio, c.fecha_fin, c.created_at
       FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id
       WHERE cl.empresa_id = $1 AND c.fecha_fin < $2
       ORDER BY c.fecha_fin DESC LIMIT 3`,
      [empresaId, hoyFormateado]
    );

    res.json([
      ...porVencer.rows.map((c) => ({ ...c, estado: "por_vencer" })),
      ...vencidos.rows.map((c) => ({ ...c, estado: "vencido" })),
    ]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener contratos por estado", glosa: err.message });
  }
});

router.get("/dashboard", verificarToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const hoy = new Date();
    const hoyFormateado = hoy.toISOString().split("T")[0];

    const sumarDias = (d) => {
      const f = new Date(hoy);
      f.setDate(f.getDate() + d);
      return f.toISOString().split("T")[0];
    };

    const [uRes, cRes, d7, d15, d30] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM empresa_usuarios WHERE empresa_id = $1", [empresaId]),
      pool.query("SELECT COUNT(*) as total FROM clientes WHERE empresa_id = $1", [empresaId]),
      pool.query("SELECT COUNT(*) as total FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id WHERE cl.empresa_id = $1 AND c.fecha_fin >= $2 AND c.fecha_fin <= $3", [empresaId, hoyFormateado, sumarDias(7)]),
      pool.query("SELECT COUNT(*) as total FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id WHERE cl.empresa_id = $1 AND c.fecha_fin >= $2 AND c.fecha_fin <= $3", [empresaId, hoyFormateado, sumarDias(15)]),
      pool.query("SELECT COUNT(*) as total FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id WHERE cl.empresa_id = $1 AND c.fecha_fin >= $2 AND c.fecha_fin <= $3", [empresaId, hoyFormateado, sumarDias(30)]),
    ]);

    res.json({
      totalUsuarios: parseInt(uRes.rows[0].total),
      totalClientes: parseInt(cRes.rows[0].total),
      contratosVencen7Dias: parseInt(d7.rows[0].total),
      contratosVencen15Dias: parseInt(d15.rows[0].total),
      contratosVencen30Dias: parseInt(d30.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener estadísticas", glosa: err.message });
  }
});

router.get("/:id", verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.cliente_id, c.titulo, c.descripcion, c.fecha_inicio, c.fecha_fin, c.created_at
       FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id=$1 AND cl.empresa_id=$2`,
      [req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "No encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener contrato", glosa: err.message });
  }
});

router.put("/:id", verificarToken, soloAdministrador, upload.single("file"), async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const contratoId = req.params.id;

    const contratoExistente = await pool.query(
      `SELECT c.id, c.cliente_id, c.titulo FROM contratos c
       INNER JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id = $1 AND cl.empresa_id = $2`,
      [contratoId, empresaId]
    );

    if (contratoExistente.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    const { cliente_id, titulo, descripcion, fecha_inicio, fecha_fin } = req.body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (cliente_id !== undefined) { updates.push(`cliente_id = $${paramIndex++}`); values.push(Number(cliente_id)); }
    if (titulo !== undefined) { updates.push(`titulo = $${paramIndex++}`); values.push(titulo); }
    if (descripcion !== undefined) { updates.push(`descripcion = $${paramIndex++}`); values.push(descripcion); }
    if (fecha_inicio !== undefined) { updates.push(`fecha_inicio = $${paramIndex++}`); values.push(fecha_inicio); }
    if (fecha_fin !== undefined) { updates.push(`fecha_fin = $${paramIndex++}`); values.push(fecha_fin); }

    let updatedRow = contratoExistente.rows[0];
    if (updates.length > 0) {
      values.push(contratoId);
      const result = await pool.query(
        `UPDATE contratos SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      updatedRow = result.rows[0];
    }

    if (req.file && req.file.buffer) {
      await pool.query(
        "INSERT INTO documentos_contrato (contract_id, document) VALUES ($1, $2)",
        [contratoId, req.file.buffer]
      );
    }

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [req.user.nombreUsuario || null, `CONTRATOS_ACTUALIZAR: actualizó contrato ID ${contratoId}`]
    );

    res.json(updatedRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar contrato", glosa: err.message });
  }
});

router.get("/:id/file", verificarToken, async (req, res) => {
  try {
    const doc = await pool.query(
      `SELECT dc.document
       FROM documentos_contrato dc
       INNER JOIN contratos c ON c.id = dc.contract_id
       INNER JOIN clientes cl ON cl.id = c.cliente_id
       WHERE dc.contract_id = $1 AND cl.empresa_id = $2
       ORDER BY dc.id DESC LIMIT 1`,
      [req.params.id, req.user.empresaId]
    );
    if (doc.rows.length === 0) {
      return res.status(404).json({ error: "Documento no encontrado o sin acceso" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="contrato.pdf"');
    res.send(doc.rows[0].document);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener archivo", glosa: err.message });
  }
});

router.delete("/:id", verificarToken, soloAdministrador, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT c.id FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id = $1 AND cl.empresa_id = $2`,
      [req.params.id, req.user.empresaId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: "No encontrado" });

    await pool.query("DELETE FROM documentos_contrato WHERE contract_id=$1", [req.params.id]);
    await pool.query("DELETE FROM contratos WHERE id=$1", [req.params.id]);

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [req.user.nombreUsuario || null, `CONTRATOS_ELIMINAR: eliminó contrato ID ${req.params.id}`]
    );

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar contrato", glosa: err.message });
  }
});

module.exports = router;