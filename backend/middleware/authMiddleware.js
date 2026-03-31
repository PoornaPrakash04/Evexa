//authMiddleware.js
const jwt = require("jsonwebtoken");

function authorize(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    
    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Invalid authorization format" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Token is missing" });
    }

    try {
     
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

     
      if (roles.length && !roles.map(r => r.toLowerCase()).includes((decoded.role || "").toLowerCase())) {
        return res.status(403).json({ message: "Access denied" });
      }

      
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