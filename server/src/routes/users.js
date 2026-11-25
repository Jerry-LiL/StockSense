const express = require('express');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User } = require('../models');
const { config } = require('../config');
const { AppError } = require('../errors');
const { asyncHandler, requireAuth, requireRoles } = require('../middleware');
const {
  parseBody,
  str,
  emailField,
  passwordField,
  oneOf,
  boolField,
  uuidField,
} = require('../validate');
const { pageParams, pageBody, searchText, likePattern } = require('../pagination');

const router = express.Router();
const ROLES = ['admin', 'manager', 'staff'];

router.use(requireAuth, requireRoles('admin'));

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const where = {};
  const search = searchText(req.query);
  if (search) {
    const term = likePattern(search);
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
    ];
  }
  if (req.query.role) {
    if (!ROLES.includes(req.query.role)) throw new AppError(400, 'Unknown role');
    where.role = req.query.role;
  }
  const result = await User.findAndCountAll({
    where,
    order: [['name', 'ASC']],
    limit,
    offset,
  });
  res.json(pageBody(result.rows, result.count, page, limit));
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = parseBody(req);
  const user = await User.create({
    name: str(body, 'name', { max: 120 }),
    email: emailField(body),
    role: oneOf(body, 'role', ROLES),
    passwordHash: await bcrypt.hash(passwordField(body), config.bcryptRounds),
    active: true,
  });
  res.status(201).json(user);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const body = parseBody(req);
  uuidField({ id: req.params.id }, 'id');
  const user = await User.unscoped().findByPk(req.params.id);
  if (!user) throw new AppError(404, 'User not found');

  const nextRole = body.role === undefined ? user.role : oneOf(body, 'role', ROLES);
  const nextActive = body.active === undefined ? user.active : boolField(body, 'active');
  if (user.id === req.user.id && (!nextActive || nextRole !== user.role)) {
    throw new AppError(400, 'You cannot change your own role or deactivate yourself');
  }

  if (body.name !== undefined) user.name = str(body, 'name', { max: 120 });
  if (body.role !== undefined) user.role = nextRole;
  if (body.active !== undefined) user.active = nextActive;
  if (body.password !== undefined) {
    user.passwordHash = await bcrypt.hash(passwordField(body), config.bcryptRounds);
  }
  await user.save();
  res.json(user);
}));

module.exports = router;
