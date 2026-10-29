'use strict';

const { allow, readJson, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { updateAvatar, publicUser } = require('../lib/users');

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['PUT'])) return;
  try {
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to edit your profile.' });

    const body = await readJson(req);
    const avatar = body.avatar === null || body.avatar === '' ? null : String(body.avatar || '');

    if (avatar && (!DATA_URL.test(avatar) || avatar.length > 160000)) {
      return json(res, 400, { error: 'Photo must be a PNG, JPEG or WebP under 120 KB.' });
    }

    const updated = await updateAvatar({ userId: user.id, avatar });
    return json(res, 200, { user: publicUser(updated) });
  } catch (err) {
    return fail(res, err);
  }
};
