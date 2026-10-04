const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const config = require('./config');

passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: `${config.serverUrl}/api/auth/google/callback`,
    },
    (accessToken, refreshToken, profile, done) => {
      const email =
        profile.emails && profile.emails.length > 0
          ? profile.emails[0].value
          : null;

      if (!email) {
        return done(new Error('Email nije dostupan iz Google profila.'));
      }

      return done(null, {
        email,
        emailVerified: profile.emails[0].verified === true,
        displayName: profile.displayName,
        googleId: profile.id,
      });
    }
  )
);

module.exports = passport;
