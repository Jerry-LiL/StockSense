const { app, request, auth, loginAs, User } = require('./helpers');

describe('auth and roles', () => {
  test('login returns a token and hides the password hash', async () => {
    const { token, user } = await loginAs('staff', { name: 'Floor' });
    expect(token).toEqual(expect.any(String));
    expect(user.role).toBe('staff');
    expect(user.passwordHash).toBeUndefined();

    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(user.email);
    expect(JSON.stringify(me.body)).not.toContain('password');
  });

  test('rejects a bad password and a missing token', async () => {
    const account = await loginAs('manager');
    const bad = await request(app).post('/api/auth/login').send({
      email: account.email,
      password: 'not-the-password',
    });
    expect(bad.status).toBe(401);

    const missing = await request(app).get('/api/products');
    expect(missing.status).toBe(401);
    const junk = await request(app).get('/api/auth/me').set(auth('not-a-token'));
    expect(junk.status).toBe(401);
  });

  test('an inactive account cannot sign in and an existing token stops working', async () => {
    const admin = await loginAs('admin');
    const staff = await loginAs('staff');

    const deactivated = await request(app)
      .patch(`/api/users/${staff.user.id}`)
      .set(auth(admin.token))
      .send({ active: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.passwordHash).toBeUndefined();

    const login = await request(app).post('/api/auth/login').send({
      email: staff.email,
      password: staff.password,
    });
    expect(login.status).toBe(403);

    const reuse = await request(app).get('/api/auth/me').set(auth(staff.token));
    expect(reuse.status).toBe(401);
  });

  test('only an admin can create users, and not lock themselves out', async () => {
    const admin = await loginAs('admin');
    const manager = await loginAs('manager');

    const forbidden = await request(app)
      .post('/api/users')
      .set(auth(manager.token))
      .send({ name: 'New', email: 'new@example.com', password: 'test-pass-123', role: 'staff' });
    expect(forbidden.status).toBe(403);

    const created = await request(app)
      .post('/api/users')
      .set(auth(admin.token))
      .send({ name: 'New', email: 'new@example.com', password: 'test-pass-123', role: 'staff' });
    expect(created.status).toBe(201);
    expect(created.body.passwordHash).toBeUndefined();
    expect(created.body.role).toBe('staff');

    const self = await request(app)
      .patch(`/api/users/${admin.user.id}`)
      .set(auth(admin.token))
      .send({ active: false });
    expect(self.status).toBe(400);

    const stored = await User.unscoped().findByPk(created.body.id);
    expect(stored.passwordHash).toEqual(expect.any(String));
    expect(stored.passwordHash).not.toBe('test-pass-123');
  });

  test('health does not require a token', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
