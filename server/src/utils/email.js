const KSET_DOMAIN = '@kset.org';

function isKsetEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(KSET_DOMAIN);
}

module.exports = { isKsetEmail };
