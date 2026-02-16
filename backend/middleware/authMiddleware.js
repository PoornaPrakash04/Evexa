const jwt = require("jsonwebtoken");

function authorize(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    
    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Check if header starts with "Bearer "
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Invalid authorization format" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Token is missing" });
    }

    try {
      // ✅ USE ENVIRONMENT VARIABLE (same as in auth.js)
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if role is allowed (if roles specified)
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Attach user data to request
      req.user = decoded;
      next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      }
      return res.status(403).json({ message: "Invalid token" });
    }
  };
}

module.exports = authorize;