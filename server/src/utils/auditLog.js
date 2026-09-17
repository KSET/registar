// Logging

async function logAction(prisma, action, { userId = null, details = null } = {}) {
  console.log(`[audit] ${action}`, details ? JSON.stringify(details) : '');
  try {
    await prisma.auditLog.create({ data: { userId, action, details } });
  } catch (err) {
    console.error(`[audit] Failed to persist audit log "${action}":`, err);
  }
}

async function logError(prisma, action, err, { userId = null, details = null } = {}) {
  console.error(`[audit] ${action} failed:`, err);
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: `${action}_error`,
        details: { message: err.message, code: err.code || null, ...details },
      },
    });
  } catch (logErr) {
    console.error('[audit] Failed to persist error audit log:', logErr);
  }
}

module.exports = { logAction, logError };
