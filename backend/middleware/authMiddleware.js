const jwt = require("jsonwebtoken")

exports.verifyToken = (req,res,next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({message: "No token provided"});
    
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({message: "Invalid token"})
    }
 
}

exports.requireAdmin = (req,res,next) => {
  const role = String(req.user?.role || "").trim().toUpperCase();
  if (role !== "ADMIN") return res.status(403).json({ message: "Access denied" });
  next();
};

exports.requireManagerOrAdmin = (req,res,next) => {
  const role = String(req.user?.role || "").trim().toUpperCase();
  if (!["ADMIN","MANAGER"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};
