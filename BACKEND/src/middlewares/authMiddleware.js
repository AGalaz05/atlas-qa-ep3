const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_atlas_qa_2026';

function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function soloAdministrador(req, res, next) {
  if (!req.user || req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso denegado: rol editor es solo lectura' });
  }
  next();
}

module.exports = { verificarToken, soloAdministrador, JWT_SECRET };