const prisma = require('../src/lib/prisma');
const { isKsetEmail } = require('../src/utils/email');

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) {
    throw new Error('Postavite valjani ADMIN_EMAIL u .env prije pokretanja seeda.');
  }

  const sections = [
    'Biciklistička',
    'Disco',
    'Dramska',
    'Foto',
    'Glazbena',
    'Media',
    'Planinarska',
    'Računarska',
    'Tehnička',
    'Video',
  ];
  let adminHomeSectionId = null;
  for (const name of sections) {
    const section = await prisma.section.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    if (name === 'Biciklistička') adminHomeSectionId = section.id;
  }
  console.log(`Seeded ${sections.length} sections`);


  const teams = ['Kulinarski', 'Projektni', 'Program'];
  for (const name of teams) {
    await prisma.team.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${teams.length} teams`);


  const allergies = [
    'Gluten',
    'Laktoza',
    'Kikiriki',
  ];
  for (const name of allergies) {
    await prisma.allergy.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${allergies.length} allergies`);


  // Matches the categories used in the real KSET registration form / Excel export.
  const drinks = [
    'Alkoholno (piva, vodka itd.)',
    'Gazirano (radenska, cola, fanta)',
    'Negazirano (sok, voda, cedevita)',
    'Čaj (topli, ledeni)',
    'Kava (s mlijekom, bez mlijeka)',
  ];
  for (const name of drinks) {
    await prisma.drink.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${drinks.length} drinks`);

  const faculties = [
    'FER', 'FSB', 'PMF', 'FFZG', 'TVZ',
  ];
  for (const name of faculties) {
    await prisma.faculty.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${faculties.length} faculties`);

  // ADMIN_EMAIL can be either a @kset.org address or a personal one (e.g. a
  // Gmail the person actually logs in with) - matched against whichever
  // field it actually lives in, not assumed to be ksetEmail. Runs every
  // seed, so this account can never be permanently locked out of admin.
  const existingAdmin = await prisma.member.findFirst({
    where: { OR: [{ ksetEmail: adminEmail }, { privateEmail: adminEmail }] },
  });

  if (existingAdmin) {
    // Whichever field matched is the real login identity for this account -
    // mark it verified, or login's verified-only lookup will never find it
    // (while the unrelated uniqueness check on signup still would, since
    // that one doesn't care about verification - a deadlock otherwise).
    const matchedKset = existingAdmin.ksetEmail === adminEmail;
    await prisma.member.update({
      where: { id: existingAdmin.id },
      data: {
        appRole: 'ADMINISTRATOR',
        managedSectionId: null,
        ...(matchedKset ? { ksetEmailVerified: true } : { privateEmailVerified: true }),
      },
    });
  } else {
    const adminIsKset = isKsetEmail(adminEmail);
    const seededAdmin = await prisma.member.findUnique({ where: { oib: '00000000000' } });
    const loginEmailData = adminIsKset
      ? { ksetEmail: adminEmail, ksetEmailVerified: true }
      : { privateEmail: adminEmail, privateEmailVerified: true };

    if (seededAdmin) {
      await prisma.member.update({
        where: { id: seededAdmin.id },
        data: {
          ...loginEmailData,
          appRole: 'ADMINISTRATOR',
          managedSectionId: null,
        },
      });
    } else {
      await prisma.member.create({
        data: {
          firstName: 'KSET',
          lastName: 'Admin',
          oib: '00000000000',
          dateOfBirth: new Date('1990-01-01'),
          address: 'Admin adresa',
          gender: 'M',
          phone: '0000000000',
          privateEmail: adminEmail,
          privateEmailVerified: !adminIsKset,
          ksetEmail: adminIsKset ? adminEmail : null,
          ksetEmailVerified: adminIsKset,
          memberSince: new Date(),
          cardNumber: 'ADMIN-001',
          membershipLevel: 'PUNOPRAVNO',
          dietType: 'SVEJED',
          shirtSize: 'M',
          acceptedDocuments: true,
          appRole: 'ADMINISTRATOR',
          homeSectionId: adminHomeSectionId,
        },
      });
    }
  }
  console.log(`Seeded admin user: ${adminEmail}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
