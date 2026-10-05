const ExcelJS = require('exceljs');

const MEMBERSHIP_LABELS = {
  PRIDRUZENO: 'Pridruženo',
  PUNOPRAVNO: 'Punopravno',
  POCASNO: 'Počasno',
  STARO: 'Staro',
};

const GENDER_LABELS = {
  M: 'Muški',
  Z: 'Ženski',
  OSTALO: 'Ostalo',
};

const DIET_LABELS = {
  MESOJED: 'Mesojed',
  VEGETARIJANSTVO: 'Vegetarijanstvo',
  VEGANSTVO: 'Veganstvo',
  SVEJED: 'Svejed',
};

const ROLE_LABELS = {
  CLAN: 'Član',
  VODITELJ_SEKCIJE: 'Voditelj sekcije',
  ADMINISTRATOR: 'Administrator',
};

const COLUMNS = [
  { header: 'ID', key: 'id', width: 10 },
  { header: 'Ime', key: 'firstName', width: 20 },
  { header: 'Prezime', key: 'lastName', width: 24 },
  { header: 'OIB', key: 'oib', width: 14 },
  { header: 'Datum rođenja', key: 'dateOfBirth', width: 16 },
  { header: 'Datum učlanjenja', key: 'memberSince', width: 18 },
  { header: 'Trenutna vrsta članstva', key: 'membershipLevel', width: 24 },
  { header: 'Datum postanka punopravnim', key: 'fullMemberSince', width: 25 },
  { header: 'Fakultet', key: 'faculty', width: 20 },
  { header: 'Adresa prebivališta', key: 'address', width: 30 },
  { header: 'Kućni broj', key: 'houseNumber', width: 14 },
  { header: 'Poštanski broj', key: 'postalCode', width: 16 },
  { header: 'Mjesto', key: 'city', width: 22 },
  { header: 'Spol', key: 'gender', width: 14 },
  { header: 'Kontakt broj mobitela', key: 'phone', width: 22 },
  { header: 'Privatna e-pošta', key: 'privateEmail', width: 32 },
  { header: 'Privatna e-pošta potvrđena', key: 'privateEmailVerified', width: 26 },
  { header: 'KSET e-pošta', key: 'ksetEmail', width: 32 },
  { header: 'KSET e-pošta potvrđena', key: 'ksetEmailVerified', width: 24 },
  { header: 'Matična sekcija', key: 'homeSection', width: 20 },
  { header: 'Pridružene sekcije', key: 'sections', width: 32 },
  { header: 'Timovi', key: 'teams', width: 28 },
  { header: 'Tip prehrane', key: 'dietType', width: 20 },
  { header: 'Pića', key: 'drinks', width: 44 },
  { header: 'Alergije', key: 'allergies', width: 28 },
  { header: 'Veličina majice', key: 'shirtSize', width: 18 },
  { header: 'Šifra iskaznice', key: 'cardNumber', width: 18 },
  { header: 'Prihvaćeni akti udruge', key: 'acceptedDocuments', width: 24 },
  { header: 'Pomoć pri prijevozu', key: 'transportVolunteer', width: 22 },
  { header: 'Kako ste saznali za KSET?', key: 'referralSource', width: 48 },
  { header: 'Potvrda o studiranju priložena', key: 'certificateUploaded', width: 30 },
  { header: 'Potvrda vrijedi do', key: 'certificateValidUntil', width: 20 },
  { header: 'Potvrda odobrena', key: 'certificateApprovedAt', width: 22 },
  { header: 'Discord ID', key: 'discordId', width: 24 },
  { header: 'Uloga', key: 'appRole', width: 22 },
  { header: 'Sekcija kojom upravlja', key: 'managedSection', width: 24 },
  { header: 'Kreiran', key: 'createdAt', width: 22 },
  { header: 'Zadnje ažuriranje', key: 'updatedAt', width: 22 },
];

function yesNo(value) {
  return value ? 'Da' : 'Ne';
}

function memberToRow(member) {
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    oib: member.oib,
    dateOfBirth: member.dateOfBirth,
    memberSince: member.memberSince,
    membershipLevel: MEMBERSHIP_LABELS[member.membershipLevel] || member.membershipLevel,
    fullMemberSince: member.fullMemberSince,
    faculty: member.faculty?.name || member.facultyOther || '',
    address: member.address,
    houseNumber: member.houseNumber,
    postalCode: member.postalCode,
    city: member.city,
    gender: GENDER_LABELS[member.gender] || member.gender,
    phone: member.phone,
    privateEmail: member.privateEmail,
    privateEmailVerified: yesNo(member.privateEmailVerified),
    ksetEmail: member.ksetEmail,
    ksetEmailVerified: yesNo(member.ksetEmailVerified),
    homeSection: member.homeSection?.name,
    sections: member.sections.map(({ section }) => section.name).join(', '),
    teams: member.teams.map(({ team }) => team.name).join(', '),
    dietType: DIET_LABELS[member.dietType] || member.dietType,
    drinks: member.drinks.map(({ drink }) => drink.name).join(', '),
    allergies: member.allergies.map(({ allergy }) => allergy.name).join(', '),
    shirtSize: member.shirtSize,
    cardNumber: member.cardNumber,
    acceptedDocuments: yesNo(member.acceptedDocuments),
    transportVolunteer: yesNo(member.transportVolunteer),
    referralSource: member.referralSource,
    certificateUploaded: yesNo(Boolean(member.certificatePath)),
    certificateValidUntil: member.certificateValidUntil,
    certificateApprovedAt: member.certificateApprovedAt,
    discordId: member.discordId,
    appRole: ROLE_LABELS[member.appRole] || member.appRole,
    managedSection: member.managedSection?.name,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

async function createMembersWorkbook(members) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSET Registar';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Članovi');
  worksheet.columns = COLUMNS;
  worksheet.addRows(members.map(memberToRow));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  for (const column of ['dateOfBirth', 'memberSince', 'fullMemberSince', 'certificateValidUntil']) {
    worksheet.getColumn(column).numFmt = 'dd.mm.yyyy';
  }
  for (const column of ['certificateApprovedAt', 'createdAt', 'updatedAt']) {
    worksheet.getColumn(column).numFmt = 'dd.mm.yyyy hh:mm';
  }
  worksheet.getRow(1).font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

module.exports = { createMembersWorkbook };
