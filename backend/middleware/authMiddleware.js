const jwt = require("jsonwebtoken");

function authorize(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.status(401).json({ message: "No token provided" });

    const token = authHeader.split(" ")[1];

    jwt.verify(token, "secretkey", (err, decoded) => {
      if (err)
        return res.status(403).json({ message: "Invalid token" });

      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      req.user = decoded;
      next();
    });
  };
}

module.exports = authorize;
