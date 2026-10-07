const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { hasAdminRole } = require('../middleware/authorize');
const { logAction, logError } = require('../utils/auditLog');
const { parsePositiveIntParam } = require('../utils/requestValidation');
const { isPdfBuffer, normalizePdfBuffer } = require('../utils/fileValidation');

const router = express.Router();

const UPLOAD_DIR = '/app/uploads/certificates';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Dozvoljen je samo PDF.'));
    }
    cb(null, true);
  },
});

// First calendar year of the academic year (boundary Oct 1).
function academicStartYear(date = new Date()) {
  const y = date.getFullYear();
  return date.getMonth() >= 9 ? y : y - 1;
}

function sanitizeName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z]/g, '');
}

// Writes a PDF buffer to disk and returns the stored filename.
// Name: ImePrezime_potvrda_YYYY_<timestamp>.pdf (timestamp avoids collisions).
// Async (fs.promises) - a sync write would block Node's single event loop
// thread for every other request in flight, not just this one, for however
// long the disk write takes.
async function saveCertificateBuffer(firstName, lastName, buffer) {
  const year = academicStartYear();
  const ts = Date.now();
  const filename = `${sanitizeName(firstName)}${sanitizeName(lastName)}_potvrda_${year}_${ts}.pdf`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return filename;
}

function deleteCertificate(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(filename));
  fs.unlink(filePath, () => {});
}

function certificateFilePath(filename) {
  return path.join(UPLOAD_DIR, path.basename(filename));
}

// Can viewer see targetMember's certificate?
async function canView(viewer, targetMemberId) {
  if (hasAdminRole(viewer.appRole)) return true;
  if (viewer.memberId === targetMemberId) return true;
  if (viewer.appRole === 'VODITELJ_SEKCIJE') {
    const [leader, target] = await Promise.all([
      prisma.member.findUnique({ where: { id: viewer.memberId }, select: { managedSectionId: true } }),
      prisma.member.findUnique({ where: { id: targetMemberId }, select: { homeSectionId: true } }),
    ]);
    return Boolean(leader?.managedSectionId && target);
  }
  return false;
}

// POST /api/uploads/certificate — existing member re-uploads (profile flow)
router.post('/certificate', authenticateToken, async (req, res) => {
  if (!req.user.memberId) {
    return res.status(403).json({ error: 'Samo registrirani član može poslati potvrdu.' });
  }

  try {
    const existing = await prisma.pendingFieldChange.findFirst({
      where: {
        memberId: req.user.memberId,
        fieldName: 'certificatePath',
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({
        error: 'Već ste poslali potvrdu na odobrenje. Pričekajte da je voditelj pregleda.',
      });
    }
  } catch (err) {
    console.error('Check pending certificate upload error:', err);
    return res.status(500).json({ error: 'Greška na serveru.' });
  }

  upload.single('certificate')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Datoteka nije priložena.' });
    req.file.buffer = normalizePdfBuffer(req.file.buffer);
    if (!isPdfBuffer(req.file.buffer)) {
      return res.status(400).json({ error: 'Datoteka nije valjan PDF.' });
    }

    const { memberId } = req.user;
    try {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { firstName: true, lastName: true, certificateValidUntil: true },
      });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const certificateValidUntil = member?.certificateValidUntil ? new Date(member.certificateValidUntil) : null;
      certificateValidUntil?.setUTCHours(0, 0, 0, 0);
      if (certificateValidUntil && certificateValidUntil >= today) {
        return res.status(400).json({ error: 'Postojeća potvrda je još valjana i ne može se mijenjati.' });
      }

      const existing = await prisma.pendingFieldChange.findFirst({
        where: { memberId, fieldName: 'certificatePath', status: 'PENDING' },
      });
      if (existing) {
        return res.status(409).json({
          error: 'Već ste poslali potvrdu na odobrenje. Pričekajte da je voditelj pregleda.',
        });
      }

      const filename = await saveCertificateBuffer(member.firstName, member.lastName, req.file.buffer);

      await prisma.pendingFieldChange.create({
        data: { memberId, fieldName: 'certificatePath', newValue: filename, status: 'PENDING' },
      });

      await logAction(prisma, 'certificate_uploaded', { userId: memberId, details: { filename } });
      res.status(201).json({
        message: 'Dokument je zabilježen i čeka pregled voditelja. Ne možete poslati novi dok se ovaj ne pregleda.',
      });
    } catch (e) {
      await logError(prisma, 'certificate_upload', e, { userId: memberId });
      res.status(500).json({ error: 'Greška na serveru.' });
    }
  });
});

// GET /api/uploads/certificate/:memberId — serve approved member's certificate
router.get('/certificate/:memberId', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const targetMemberId = parsePositiveIntParam(req.params.memberId);
    if (targetMemberId === null) {
      return res.status(400).json({ error: 'Nevažeći ID člana.' });
    }
    if (!(await canView(req.user, targetMemberId))) {
      return res.status(403).json({ error: 'Nemate pravo pregledati ovu potvrdu.' });
    }

    let filename;
    if (req.query.pending === '1') {
      const p = await prisma.pendingFieldChange.findFirst({
        where: { memberId: targetMemberId, fieldName: 'certificatePath', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      filename = p?.newValue;
    } else {
      const m = await prisma.member.findUnique({
        where: { id: targetMemberId },
        select: { certificatePath: true },
      });
      filename = m?.certificatePath;
    }

    if (!filename) return res.status(404).json({ error: 'Potvrda ne postoji.' });
    const fp = certificateFilePath(filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datoteka nije pronađena.' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="potvrda.pdf"');
    fs.createReadStream(fp).pipe(res);
  } catch (err) {
    console.error('Serve certificate error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// GET /api/uploads/pending-certificate/:pendingId — serve a pending application's certificate
// (leader/admin reviewing a new application, before the member exists)
router.get('/pending-certificate/:pendingId', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;
    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const pendingId = parsePositiveIntParam(req.params.pendingId);
    if (pendingId === null) {
      return res.status(400).json({ error: 'Nevažeći ID prijave.' });
    }
    const pending = await prisma.pendingMember.findUnique({ where: { id: pendingId } });
    if (!pending) return res.status(404).json({ error: 'Prijava nije pronađena.' });

    // Section leader may only view applications for their section
    if (appRole === 'VODITELJ_SEKCIJE') {
      const leader = await prisma.member.findUnique({
        where: { id: memberId },
        select: { managedSectionId: true },
      });
      if (!leader || leader.managedSectionId !== pending.homeSectionId) {
        return res.status(403).json({ error: 'Niste voditelj ove sekcije.' });
      }
    }

    const filename = pending.fieldData?.certificatePath;
    if (!filename) return res.status(404).json({ error: 'Potvrda ne postoji.' });
    const fp = certificateFilePath(filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datoteka nije pronađena.' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="potvrda.pdf"');
    fs.createReadStream(fp).pipe(res);
  } catch (err) {
    console.error('Serve pending certificate error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
module.exports.saveCertificateBuffer = saveCertificateBuffer;
module.exports.deleteCertificate = deleteCertificate;
