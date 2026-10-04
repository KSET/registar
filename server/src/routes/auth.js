const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { logAction, logError } = require('../utils/auditLog');
const { isKsetEmail } = require('../utils/email');
const { createLinkNonce, consumeLinkNonce } = require('../utils/linkNonce');
const { createLoginTicket, consumeLoginTicket } = require('../utils/oauthLoginTicket');
const { completeDiscordVerification } = require('../utils/discordVerification');

const router = express.Router();
const JWT_ALGORITHM = 'HS256';

// Matches on either email, but only if it's verified via OAuth.
function findMemberByVerifiedEmail(email) {
  return prisma.member.findFirst({
    where: {
      OR: [
        { ksetEmail: email, ksetEmailVerified: true },
        { privateEmail: email, privateEmailVerified: true },
      ],
    },
  });
}

const LOGIN_STATE_COOKIE = 'oauth_login_state';
const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

function discordVerificationPage(success) {
  const title = success ? 'Verifikacija završena' : 'Verifikacija nije uspjela';
  const heading = success ? 'Discord račun je povezan.' : 'Verifikacija nije uspjela.';
  const message = success
    ? 'Vaš račun je uspješno povezan s Registrom članova KSET-a.'
    : 'Račun nije moguće povezati. Vratite se u Discord i pokušajte ponovo.';
  const status = success ? 'Povezivanje uspješno' : 'Povezivanje nije dovršeno';
  const icon = success ? '&#10003;' : '!';

  return `<!doctype html>
<html lang="hr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#17353b">
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        padding: 32px 20px;
        display: grid;
        place-items: center;
        color: #20343a;
        background:
          radial-gradient(ellipse at 12% 12%, rgba(247, 145, 36, .2), transparent 32%),
          radial-gradient(ellipse at 88% 88%, rgba(86, 135, 143, .25), transparent 34%),
          #17353b;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .page { width: 100%; max-width: 520px; text-align: center; }
      .card {
        overflow: hidden;
        padding: 42px 44px 36px;
        border: 1px solid rgba(255, 255, 255, .62);
        border-radius: 22px;
        background: #fff;
        box-shadow: 0 28px 80px rgba(5, 20, 24, .32);
      }
      .logo-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 196px;
        max-width: 100%;
        padding: 10px 12px;
        border: 1px solid #edf0ef;
        border-radius: 12px;
        background: #f8f9f7;
      }
      .logo { display: block; width: 100%; height: auto; }
      .icon {
        display: grid;
        place-items: center;
        width: 56px;
        height: 56px;
        margin: 30px auto 18px;
        border: 1px solid ${success ? '#b8e1cf' : '#f3d5b7'};
        border-radius: 50%;
        color: ${success ? '#16734a' : '#a85b17'};
        background: ${success ? '#e8f6ef' : '#fff4e8'};
        font-size: 27px;
        font-weight: 700;
      }
      .eyebrow {
        margin: 0 0 12px;
        color: ${success ? '#16734a' : '#a85b17'};
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .09em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        color: #20343a;
        font-size: clamp(24px, 6vw, 30px);
        line-height: 1.2;
        letter-spacing: -.035em;
      }
      .message {
        max-width: 360px;
        margin: 14px auto 0;
        color: #62747a;
        font-size: 15px;
        line-height: 1.7;
      }
      .divider { height: 1px; margin: 28px 0 20px; background: #e9edec; }
      .return-note {
        margin: 0;
        color: #52656b;
        font-size: 13px;
        line-height: 1.6;
      }
      .brand {
        margin: 24px 0 0;
        color: rgba(255, 255, 255, .66);
        font-size: 12px;
        font-weight: 500;
        letter-spacing: .04em;
      }
      @media (max-width: 480px) {
        body { padding: 20px 16px; }
        .card { padding: 32px 24px 28px; border-radius: 18px; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="card" aria-labelledby="status-heading">
        <div class="logo-wrap">
          <img class="logo" src="${config.clientUrl}/logo-full.png" alt="KSET">
        </div>
        <div class="icon" aria-hidden="true">${icon}</div>
        <p class="eyebrow">${status}</p>
        <h1 id="status-heading">${heading}</h1>
        <p class="message">${message}</p>
        <div class="divider"></div>
        <p class="return-note">${
          success
            ? 'Sada možete zatvoriti ovu karticu i vratiti se u Discord.'
            : 'Zatvorite ovu karticu, vratite se u Discord i pokušajte ponovo.'
        }</p>
      </section>
      <p class="brand">REGISTAR ČLANOVA KSET-A</p>
    </main>
  </body>
</html>`;
}

function verifyLoginOAuthState(req, res, next) {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (/^discord:[0-9a-f]{64}$/.test(state)) {
    res.clearCookie(LOGIN_STATE_COOKIE, { path: '/api/auth/google/callback' });
    return next();
  }
  if (/^link:[0-9a-f]{48}$/.test(state)) {
    res.clearCookie(LOGIN_STATE_COOKIE, { path: '/api/auth/google/callback' });
    return next();
  }

  const match = /^login:([0-9a-f]{48})$/.exec(state);
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${LOGIN_STATE_COOKIE}=`))?.slice(LOGIN_STATE_COOKIE.length + 1);
  res.clearCookie(LOGIN_STATE_COOKIE, { path: '/api/auth/google/callback' });

  if (!match || !cookie || cookie !== match[1]) {
    return res.redirect(`${config.clientUrl}/login?error=invalid_state`);
  }
  next();
}

// Bind OAuth state to an HttpOnly cookie in this browser to prevent login CSRF.
router.get('/google', (req, res, next) => {
  const state = `login:${crypto.randomBytes(24).toString('hex')}`;
  res.cookie(LOGIN_STATE_COOKIE, state.slice('login:'.length), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: LOGIN_STATE_TTL_MS,
    path: '/api/auth/google/callback',
  });

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
    state,
  })(req, res, next);
});

// Shared by normal login and the /google/link flow below - Google always
// redirects here, so the two are told apart via `state`, not the route.
router.get(
  '/google/callback',
  verifyLoginOAuthState,
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${config.clientUrl}/login?error=auth_failed`,
  }),
  async (req, res) => {
    const linkStateMatch = /^link:([0-9a-f]{48})$/.exec(req.query.state || '');
    const discordStateMatch = /^discord:([0-9a-f]{64})$/.exec(req.query.state || '');

    if (linkStateMatch) {
      const memberId = consumeLinkNonce(linkStateMatch[1]);
      if (!memberId) {
        return res.redirect(`${config.clientUrl}/?linkError=invalid_state`);
      }
      return handleEmailLinkCallback(req, res, memberId);
    }

    try {
      if (discordStateMatch) {
        const result = await completeDiscordVerification(
          discordStateMatch[1],
          req.user.email,
          req.user.emailVerified
        );
        res.set('Cache-Control', 'no-store');
        res.set('Referrer-Policy', 'no-referrer');
        res.set(
          'Content-Security-Policy',
          `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' ${new URL(config.clientUrl).origin}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
        );
        return res
          .status(result.status === 'SUCCESS' ? 200 : 400)
          .type('html')
          .send(discordVerificationPage(result.status === 'SUCCESS'));
      }

      const { email, displayName } = req.user;

      let member = await findMemberByVerifiedEmail(email);

      if (!member) {
        // No verified match - but does an existing (e.g. bulk-imported)
        // member already claim this exact email, just not verified yet?
        // A successful Google login for that address IS the proof of
        // ownership the verified flag exists to capture, so this is where
        // it gets set - not a precondition members must clear beforehand.
        const unverified = await prisma.member.findFirst({
          where: { OR: [{ ksetEmail: email }, { privateEmail: email }] },
        });
        if (unverified) {
          const matchedKset = unverified.ksetEmail === email;
          member = await prisma.member.update({
            where: { id: unverified.id },
            data: matchedKset ? { ksetEmailVerified: true } : { privateEmailVerified: true },
          });
        }
      }

      const tokenPayload = {
        email,
        displayName,
      };

      if (member) {
        tokenPayload.memberId = member.id;
        tokenPayload.appRole = member.appRole;
        tokenPayload.isNewUser = false;
      } else {
        tokenPayload.memberId = null;
        tokenPayload.appRole = null;
        tokenPayload.isNewUser = true;
      }

      const token = jwt.sign(tokenPayload, config.jwtSecret, {
        expiresIn: '24h',
        algorithm: JWT_ALGORITHM,
      });

      res.set('Cache-Control', 'no-store');
      const ticket = createLoginTicket(token);
      res.redirect(`${config.clientUrl}/auth/callback#login_code=${ticket}`);
    } catch (err) {
      console.error('OAuth callback error:', err);
      res.redirect(`${config.clientUrl}/login?error=server_error`);
    }
  }
);

router.post('/exchange', (req, res) => {
  const token = consumeLoginTicket(req.body?.code);
  if (!token) return res.status(400).json({ error: 'Kod prijave je nevažeći ili je istekao.' });
  res.set('Cache-Control', 'no-store');
  res.json({ token });
});

async function handleEmailLinkCallback(req, res, memberId) {
  try {
    const { email } = req.user;

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      return res.redirect(`${config.clientUrl}/?linkError=member_not_found`);
    }

    const linkingKset = isKsetEmail(email);
    const currentValue = linkingKset ? member.ksetEmail : member.privateEmail;
    const currentlyVerified = linkingKset ? member.ksetEmailVerified : member.privateEmailVerified;

    if (currentValue === email && currentlyVerified) {
      return res.redirect(`${config.clientUrl}/?linked=already`);
    }

    // Don't bind this email to two different members.
    const claimedByOther = await prisma.member.findFirst({
      where: {
        id: { not: memberId },
        OR: [{ ksetEmail: email }, { privateEmail: email }],
      },
    });
    if (claimedByOther) {
      return res.redirect(`${config.clientUrl}/?linkError=email_taken`);
    }

    await prisma.member.update({
      where: { id: memberId },
      data: linkingKset
        ? { ksetEmail: email, ksetEmailVerified: true }
        : { privateEmail: email, privateEmailVerified: true },
    });

    await logAction(prisma, 'member_email_linked', {
      userId: memberId,
      details: { field: linkingKset ? 'ksetEmail' : 'privateEmail' },
    });

    return res.redirect(`${config.clientUrl}/?linked=success`);
  } catch (err) {
    await logError(prisma, 'member_email_link', err, { userId: memberId || null });
    return res.redirect(`${config.clientUrl}/?linkError=server_error`);
  }
}

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { email, memberId, isNewUser } = req.user;

    if (isNewUser || !memberId) {
      // Check if there's a pending application
      const pending = await prisma.pendingMember.findUnique({
        where: { googleEmail: email },
      });

      return res.json({
        email,
        isNewUser: true,
        hasPendingApplication: !!pending,
        member: null,
      });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        homeSection: true,
        faculty: true,
        sections: { include: { section: true } },
        teams: { include: { team: true } },
        drinks: { include: { drink: true } },
        allergies: { include: { allergy: true } },
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    res.json({
      email,
      isNewUser: false,
      hasPendingApplication: false,
      member,
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const { email, memberId } = req.user;

    // Once a token is bound to a member, re-fetch that exact member by id -
    // never re-derive identity from `email` alone. findMemberByVerifiedEmail
    // is a findFirst() whose filters Prisma silently drops for an
    // undefined/empty email, which would otherwise hand back an unrelated
    // member's session. Email-based lookup is only for the pre-membership
    // (isNewUser) case, where there's no memberId yet to trust.
    const member = memberId
      ? await prisma.member.findUnique({ where: { id: memberId } })
      : await findMemberByVerifiedEmail(email);

    const tokenPayload = {
      email,
      displayName: req.user.displayName,
    };

    if (member) {
      tokenPayload.memberId = member.id;
      tokenPayload.appRole = member.appRole;
      tokenPayload.isNewUser = false;
    } else {
      tokenPayload.memberId = null;
      tokenPayload.appRole = null;
      tokenPayload.isNewUser = true;
    }

    const token = jwt.sign(tokenPayload, config.jwtSecret, {
      expiresIn: '24h',
      algorithm: JWT_ALGORITHM,
    });

    res.json({ token });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Links a second Google-verified email to the logged-in member. The JWT
// comes in as a query param (a link click can't send headers) and rides
// along as OAuth `state` to survive the round-trip to Google.
router.get('/google/link', (req, res, next) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Token je obavezan.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    return res.status(403).json({ error: 'Nevažeći token.' });
  }

  if (!decoded.memberId) {
    return res.status(400).json({ error: 'Morate biti prijavljeni kao član.' });
  }

  const nonce = createLinkNonce(decoded.memberId);

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
    state: `link:${nonce}`,
  })(req, res, next);
});

module.exports = router;
