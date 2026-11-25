const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { User } = require('../models');
const { AppError } = require('../errors');
const { asyncHandler, requireAuth } = require('../middleware');
const { parseBody, emailField } = require('../validate');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

router.post('/login', asyncHandler(async (req, res) => {
  const body = parseBody(req);
  const email = emailField(body);
  if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 72) {
    throw new AppError(400, 'password is required');
  }
  const password = body.password;
  const user = await User.unscoped().findOne({ where: { email } });
  const matches = user && await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw new AppError(401, 'Invalid email or password');
  if (!user.active) throw new AppError(403, 'This account is inactive');

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  res.json({ token, user: publicUser(user) });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

module.exports = router;
