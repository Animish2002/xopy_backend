const jwt = require('jsonwebtoken');

// Secret key for JWT - in production, use an environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

/**
 * Authentication middleware to verify JWT token and user role
 * @param {Array} allowedRoles - Array of roles allowed to access the route
 */
const authenticateUser = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      // Get token from header
      const token = req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ 
          message: 'No token, authorization denied' 
        });
      }

      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;

      // Check role if allowedRoles is not empty
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ 
          message: 'Access denied. Insufficient permissions' 
        });
      }

      next();
    } catch (error) {
      res.status(401).json({ 
        message: 'Token is not valid', 
        error: error.message 
      });
    }
  };
};

module.exports = authenticateUser;