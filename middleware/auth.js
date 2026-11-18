function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Please log in first." });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Please log in first." });
    }

    if (req.session.role !== role) {
      return res.status(403).json({ error: "Access denied." });
    }

    next();
  };
}

module.exports = { requireLogin, requireRole };
