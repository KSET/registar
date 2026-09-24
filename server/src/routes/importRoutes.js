const express = require('express');
const multer = require('multer');

const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { logAction } = require('../utils/auditLog');
const { isXlsxBuffer } = require('../utils/fileValidation');
const { parseSectionSheets } = require('../utils/importSections');
const { parseHonoraryBuffer, nameKey } = require('../utils/importHonorary');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

async function getLookups() {
  const [sections, teams, drinks, faculties] = await Promise.all([
    prisma.section.findMany({ select: { id: true, name: true } }),
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.drink.findMany({ select: { id: true, name: true } }),
    prisma.faculty.findMany({ select: { id: true, name: true } }),
  ]);
  return { sections, teams, drinks, faculties };
}

async function getExisting() {
  const members = await prisma.member.findMany({
    select: { oib: true, privateEmail: true, ksetEmail: true, cardNumber: true },
  });
  return {
    oibs: new Set(members.map((m) => m.oib)),
    privateEmails: new Set(members.map((m) => m.privateEmail).filter(Boolean)),
    ksetEmails: new Set(members.map((m) => m.ksetEmail).filter(Boolean)),
    cardNumbers: new Set(members.map((m) => m.cardNumber)),
  };
}

async function getExistingHonoraryNames() {
  const rows = await prisma.honoraryMember.findMany({ select: { firstName: true, lastName: true } });
  return new Set(rows.map((r) => nameKey(r.firstName, r.lastName)));
}

function requireAdmin(req, res) {
  if (req.user.appRole !== 'ADMINISTRATOR') {
    res.status(403).json({ error: 'Nemate ovlasti.' });
    return false;
  }
  return true;
}

// POST /api/import/preview - parses & validates only, writes nothing.
router.post('/preview', authenticateToken, verifyCurrentRole, (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!requireAdmin(req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'Datoteka nije priložena.' });
    if (!isXlsxBuffer(req.file.buffer)) {
      return res.status(400).json({ error: 'Datoteka nije valjani Excel (.xlsx).' });
    }

    try {
      const [lookups, existing, existingHonoraryNames] = await Promise.all([
        getLookups(),
        getExisting(),
        getExistingHonoraryNames(),
      ]);
      const result = parseSectionSheets(req.file.buffer, lookups, existing);
      const honoraryResult = parseHonoraryBuffer(req.file.buffer, existingHonoraryNames);
      res.json({
        totalRows: result.totalRows,
        inactiveSkipped: result.inactiveSkipped,
        validCount: result.valid.length,
        invalidCount: result.invalid.length,
        invalid: result.invalid.slice(0, 100).map((e) => ({
          locations: e.locations,
          personName: e.personName,
          errors: e.errors,
        })),
        newDrinkNames: result.newDrinkNames,
        honorary: {
          totalRows: honoraryResult.totalRows,
          newCount: honoraryResult.valid.length,
          duplicateSkipped: honoraryResult.duplicateSkipped,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Greška pri obradi datoteke.' });
    }
  });
});

// POST /api/import/commit - re-parses the same file and actually writes.
// Stateless by design (no server-side session between preview and commit) -
// the client just re-sends the file it already validated with /preview.
router.post('/commit', authenticateToken, verifyCurrentRole, (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!requireAdmin(req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'Datoteka nije priložena.' });
    if (!isXlsxBuffer(req.file.buffer)) {
      return res.status(400).json({ error: 'Datoteka nije valjani Excel (.xlsx).' });
    }

    try {
      const [lookups, existing, existingHonoraryNames] = await Promise.all([
        getLookups(),
        getExisting(),
        getExistingHonoraryNames(),
      ]);
      const result = parseSectionSheets(req.file.buffer, lookups, existing);
      const honoraryResult = parseHonoraryBuffer(req.file.buffer, existingHonoraryNames);

      if (result.valid.length === 0 && honoraryResult.valid.length === 0) {
        return res.status(400).json({
          error: 'Nema valjanih redaka za uvoz.',
          invalidCount: result.invalid.length,
        });
      }

      const created = await prisma.$transaction(
        async (tx) => {
          for (const name of result.newDrinkNames) {
            await tx.drink.upsert({ where: { name }, update: {}, create: { name } });
          }

          const [drinks, allergies] = await Promise.all([
            tx.drink.findMany({ select: { id: true, name: true } }),
            tx.allergy.findMany({ select: { id: true, name: true } }),
          ]);
          const drinkByName = new Map(drinks.map((d) => [d.name, d.id]));
          const allergyByName = new Map(allergies.map((a) => [a.name, a.id]));
          const sectionByName = new Map(lookups.sections.map((s) => [s.name, s.id]));
          const teamByName = new Map(lookups.teams.map((t) => [t.name, t.id]));

          let count = 0;
          for (const entry of result.valid) {
            const d = entry.data;
            await tx.member.create({
              data: {
                firstName: d.firstName,
                lastName: d.lastName,
                oib: d.oib,
                dateOfBirth: new Date(d.dateOfBirth),
                address: d.address,
                gender: d.gender,
                facultyId: d.facultyId,
                facultyOther: d.facultyOther,
                phone: d.phone,
                privateEmail: d.privateEmail,
                privateEmailVerified: d.privateEmailVerified,
                ksetEmail: d.ksetEmail,
                ksetEmailVerified: d.ksetEmailVerified,
                memberSince: new Date(d.memberSince),
                cardNumber: d.cardNumber,
                membershipLevel: d.membershipLevel,
                fullMemberSince: d.fullMemberSince ? new Date(d.fullMemberSince) : null,
                dietType: d.dietType,
                shirtSize: d.shirtSize,
                acceptedDocuments: d.acceptedDocuments,
                appRole: 'CLAN',
                homeSectionId: d.homeSectionId,
                sections: { create: d.sectionNames.map((n) => ({ sectionId: sectionByName.get(n) })) },
                teams: { create: d.teamNames.map((n) => ({ teamId: teamByName.get(n) })) },
                drinks: { create: d.drinkNames.map((n) => ({ drinkId: drinkByName.get(n) })) },
                allergies: { create: d.allergyNames.map((n) => ({ allergyId: allergyByName.get(n) })) },
              },
            });
            count++;
          }

          if (honoraryResult.valid.length > 0) {
            await tx.honoraryMember.createMany({ data: honoraryResult.valid });
          }

          return count;
        },
        { timeout: 120000 }
      );

      await logAction(prisma, 'members_imported', {
        userId: req.user.memberId,
        details: {
          created,
          skippedInvalid: result.invalid.length,
          skippedInactive: result.inactiveSkipped,
          newDrinkNames: result.newDrinkNames,
          honoraryCreated: honoraryResult.valid.length,
          honoraryDuplicateSkipped: honoraryResult.duplicateSkipped,
        },
      });

      res.json({
        created,
        skippedInvalid: result.invalid.length,
        skippedInactive: result.inactiveSkipped,
        honoraryCreated: honoraryResult.valid.length,
        honoraryDuplicateSkipped: honoraryResult.duplicateSkipped,
      });
    } catch (err) {
      console.error('Import commit error:', err);
      res.status(500).json({ error: 'Greška pri uvozu.' });
    }
  });
});

module.exports = router;
